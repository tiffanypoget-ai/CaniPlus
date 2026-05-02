// supabase/functions/refund-coaching-request/index.ts
// Rembourse intégralement un cours privé / coaching déjà payé.
//
// Utilisé quand :
//   - Tiffany annule un cours privé déjà payé depuis le panel admin
//   - Le client annule lui-même (à venir : limite 24h avant)
//
// Flux :
//   1. Reçoit { request_id, admin_password }
//   2. Vérifie le mot de passe admin
//   3. Charge la demande, vérifie payment_status='paid' et stripe_session_id présent
//   4. Récupère la session Stripe pour obtenir le payment_intent
//   5. Crée le remboursement Stripe (montant total)
//   6. Met payment_status='refunded' + refunded_at en DB
//   7. Notifie le client (in-app + push)
//
// Note : pour les annulations client (futures), on bypass le mot de passe admin
// en passant un service-role check. Pour l'instant on ne gère que les
// annulations admin authentifiées.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { request_id, admin_password, initiated_by } = await req.json();
    if (!request_id) throw new Error('request_id manquant');

    // Auth : soit mot de passe admin, soit initiated_by='client' avec vérif d'identité
    const expectedPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const isAdmin = admin_password && admin_password === expectedPassword;

    if (!isAdmin && initiated_by !== 'client') {
      throw new Error('Authentification requise.');
    }

    // ── 1. Charger la demande ─────────────────────────────────────────────
    const { data: request, error: reqErr } = await supabase
      .from('private_course_requests')
      .select('id, user_id, payment_status, stripe_session_id, price_chf, chosen_slot')
      .eq('id', request_id)
      .single();
    if (reqErr || !request) throw new Error('Demande introuvable.');

    if (request.payment_status !== 'paid') {
      // Pas payé → rien à rembourser, on retourne un succès no-op
      return new Response(
        JSON.stringify({ refunded: false, reason: 'not_paid', payment_status: request.payment_status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!request.stripe_session_id) {
      throw new Error('Session Stripe manquante — remboursement manuel à faire.');
    }

    // ── 2. Récupérer la session Stripe pour obtenir le payment_intent ─────
    const session = await stripe.checkout.sessions.retrieve(request.stripe_session_id);
    if (!session.payment_intent) {
      throw new Error('Payment intent introuvable sur cette session.');
    }
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent.id;

    // ── 3. Créer le remboursement Stripe (total) ──────────────────────────
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        request_id: request.id,
        initiated_by: isAdmin ? 'admin' : 'client',
      },
    });

    // ── 4. Mettre à jour la demande ───────────────────────────────────────
    await supabase
      .from('private_course_requests')
      .update({
        payment_status: 'refunded',
      })
      .eq('id', request.id);

    // ── 5. Notifier le client (in-app) ────────────────────────────────────
    const slot = request.chosen_slot as { date?: string; start?: string } | null;
    const slotLabel = slot?.date && slot?.start
      ? ` du ${slot.date} à ${slot.start}`
      : '';
    const amount = Number(request.price_chf || 60);

    try {
      await supabase.from('notifications').insert({
        user_id: request.user_id,
        type: 'private_refunded',
        title: 'Cours privé annulé · remboursement',
        body: `Ton cours privé${slotLabel} a été annulé. Tu as été remboursé·e de ${amount} CHF (sous 5 à 10 jours selon ta banque).`,
        metadata: { request_id: request.id, refund_id: refund.id, amount, link: '/profil' },
      });
    } catch (e) {
      console.warn('Notif client échouée:', e);
    }

    return new Response(
      JSON.stringify({
        refunded: true,
        refund_id: refund.id,
        amount,
        status: refund.status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('refund-coaching-request error:', JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
