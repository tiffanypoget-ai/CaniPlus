// supabase/functions/create-coaching-checkout/index.ts
// Crée une session Stripe pour un cours privé — présentiel (60 CHF) ou distance (50 CHF).
//
// Flux :
//   1. Le front envoie { user_id, user_email, availability_slots, is_remote, notes }
//   2. La fonction insère une ligne private_course_requests (payment_status = 'pending')
//   3. Elle crée la session Stripe (mode: 'payment') et retourne l'URL
//   4. Le webhook stripe-webhook marquera payment_status='paid' à confirmation
//   5. Tiffany confirme le créneau + colle l'URL Zoom/Meet dans l'admin après paiement
//
// ⚠️ Pas de table dédiée : on réutilise private_course_requests (colonne is_remote
// ajoutée dans la migration add_coaching_distance_2026_04_21.sql).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tarifs CHF définis en dur côté back-end (source de vérité)
const PRICE_IN_PERSON_CHF = 60;
const PRICE_REMOTE_CHF = 50;

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

    const {
      user_id,
      user_email,
      availability_slots,
      is_remote,
      notes,
    } = await req.json();

    if (!user_id) throw new Error('user_id manquant');
    if (!Array.isArray(availability_slots) || availability_slots.length === 0) {
      throw new Error('Indique au moins une disponibilité');
    }

    const remote = Boolean(is_remote);
    const priceChf = remote ? PRICE_REMOTE_CHF : PRICE_IN_PERSON_CHF;

    // ── 1. Créer la demande (payment_status = 'pending') ──────────────────────
    const { data: request, error: insertErr } = await supabase
      .from('private_course_requests')
      .insert({
        user_id,
        availability_slots,
        status: 'pending',
        admin_notes: notes || null,
        is_remote: remote,
        price_chf: priceChf,
        payment_status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    // ── 2. Créer la session Stripe ────────────────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';
    const amountCents = Math.round(priceChf * 100);

    const label = remote
      ? 'Coaching à distance (visio)'
      : 'Cours privé à domicile';
    const desc = remote
      ? `Séance de ${PRICE_REMOTE_CHF} CHF en visio (Zoom/Meet). Le lien te sera envoyé par email après confirmation du créneau.`
      : `Séance de ${PRICE_IN_PERSON_CHF} CHF avec Tiffany à ton domicile ou sur un lieu défini ensemble.`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'chf',
            product_data: { name: label, description: desc },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}?payment=success&purchase=coaching&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?payment=cancelled&purchase=coaching`,
      client_reference_id: user_id,
      customer_email: user_email ?? undefined,
      metadata: {
        user_id,
        type: 'coaching_request',
        request_id: request.id,
        is_remote: remote ? 'true' : 'false',
      },
    });

    return new Response(
      JSON.stringify({ url: session.url, request_id: request.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('create-coaching-checkout error:', JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
