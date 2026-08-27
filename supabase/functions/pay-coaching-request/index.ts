// supabase/functions/pay-coaching-request/index.ts
// Génère une session Stripe Checkout pour une demande de cours privé déjà
// confirmée par l'admin. Le client paie SEULEMENT après confirmation du créneau.
//
// Flux (révisé 2026-05-02) :
//   1. Le client envoie sa demande via CoachingRequestModal — sans payer
//      (insertion dans private_course_requests, status='pending', payment_status='pending')
//   2. Tiffany confirme un créneau dans le panel admin (status='confirmed', chosen_slot)
//   3. Le client voit le bouton "Payer ce cours" dans son planning
//   4. Au clic : on appelle cette edge function avec request_id
//   5. Elle vérifie que la demande est confirmée et non encore payée
//   6. Elle crée la session Stripe et retourne l'URL
//   7. Le webhook stripe-webhook (type=coaching_request) passe payment_status='paid'
//
// Sécurité : on n'accepte que les demandes status='confirmed' + payment_status IN ('pending','failed').

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tarif unique : 60 CHF l'heure, présentiel comme visio.
const PRICE_PER_HOUR_CHF = 60;

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

    const { request_id, user_email } = await req.json();
    if (!request_id) throw new Error('request_id manquant');

    // ── 1. Charger la demande et valider l'état ──────────────────────────────
    const { data: request, error: reqErr } = await supabase
      .from('private_course_requests')
      .select('id, user_id, status, payment_status, is_remote, price_chf, chosen_slot, admin_notes, travel_extra_chf')
      .eq('id', request_id)
      .single();
    if (reqErr || !request) throw new Error('Demande introuvable.');

    if (request.status !== 'confirmed') {
      throw new Error("Cette demande n'est pas encore confirmée par Tiffany.");
    }
    if (request.payment_status === 'paid') {
      throw new Error('Ce cours est déjà payé.');
    }
    if (!request.chosen_slot) {
      throw new Error('Créneau confirmé manquant.');
    }

    const remote = Boolean(request.is_remote);
    const slotForCalc = request.chosen_slot as { date?: string; start?: string; end?: string };

    // Calculer la durée du cours à partir du créneau confirmé (start → end)
    let durationHours = 1;
    if (slotForCalc?.start && slotForCalc?.end) {
      const [h1, m1] = slotForCalc.start.split(':').map(Number);
      const [h2, m2] = slotForCalc.end.split(':').map(Number);
      const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (mins > 0) durationHours = mins / 60;
    }

    const hourlyRate = PRICE_PER_HOUR_CHF;
    const coursePrice = Math.round(durationHours * hourlyRate);
    const travelExtra = Number(request.travel_extra_chf) > 0 ? Number(request.travel_extra_chf) : 0;
    const priceChf = coursePrice + travelExtra;
    const amountCents = Math.round(priceChf * 100);

    console.log(`[pay-coaching-request] durée=${durationHours}h, cours=${coursePrice} CHF, déplacement=${travelExtra} CHF, total=${priceChf} CHF`);

    // ── 2. Construire le label du paiement avec la date confirmée ────────────
    const slot = request.chosen_slot as { date?: string; start?: string; end?: string };
    const slotLabel = slot?.date && slot?.start
      ? ` — ${slot.date} à ${slot.start}`
      : '';
    const durationLabel = durationHours === 1 ? '1h' : (durationHours % 1 === 0 ? `${durationHours}h` : `${durationHours}h`);
    const label = remote
      ? `Coaching visio ${durationLabel}${slotLabel}`
      : `Cours privé ${durationLabel}${slotLabel}`;
    const baseDesc = remote
      ? `Séance en visio avec Tiffany. Le lien te sera envoyé après paiement.`
      : `Séance avec Tiffany à ton domicile ou sur un lieu défini.`;
    const desc = travelExtra > 0
      ? `${baseDesc} · ${coursePrice} CHF (cours) + ${travelExtra} CHF (déplacement).`
      : baseDesc;

    // ── 3. Créer la session Stripe ───────────────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';

    const session = await stripe.checkout.sessions.create({
      // Pas de payment_method_types : les moyens de paiement (carte, TWINT…)
      // sont pilotés depuis le Dashboard du compte Stripe RI. Le fixer ici
      // masquerait TWINT — voir
      // https://docs.stripe.com/payments/dashboard-payment-methods
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
      client_reference_id: request.user_id,
      customer_email: user_email ?? undefined,
      metadata: {
        user_id: request.user_id,
        type: 'coaching_request',
        request_id: request.id,
        is_remote: remote ? 'true' : 'false',
      },
    });

    // Mettre à jour price_chf sur la demande pour que l'affichage affiche le bon montant
    try {
      await supabase
        .from('private_course_requests')
        .update({ price_chf: priceChf })
        .eq('id', request.id);
    } catch (_) {}

    return new Response(
      JSON.stringify({ url: session.url, request_id: request.id, amount_chf: priceChf }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('pay-coaching-request error:', JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
