// supabase/functions/create-checkout/index.ts
// Crée une session de paiement Stripe — paiement unique OU abonnement mensuel.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Paiements uniques (cotisation / leçon privée) ───────────────────────────
// cotisation_annuelle : CHF 150/an/chien (inclut 1 cours de groupe/semaine)
const ONE_TIME_CONFIG: Record<string, { amount: number; name: string; description: string }> = {
  cotisation_annuelle: {
    amount: 15000, // CHF 150.00 (en centimes)
    name: 'Cotisation annuelle CaniPlus',
    description: '1 cours de groupe par semaine selon planning annuel · par chien',
  },
  lecon_privee: {
    amount: 6000, // CHF 60.00
    name: 'Leçon privée CaniPlus',
    description: 'Leçon individuelle avec un éducateur · CaniPlus Ballaigues',
  },
  cours_theorique: {
    amount: 5000, // CHF 50.00
    name: 'Cours théorique CaniPlus',
    description: 'Cours théorique · CaniPlus Ballaigues',
  },
};

// ─── Abonnement mensuel premium ──────────────────────────────────────────────
const PREMIUM_PRICE_CHF = 1000; // CHF 10.00 (en centimes)

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

    const body = await req.json();
    const { type, user_id, user_email, subscription_id } = body;

    if (!type || !user_id) {
      throw new Error('Paramètres manquants : type, user_id');
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://caniplus-pwa.vercel.app';

    // ── CAS 1 : Abonnement mensuel premium ────────────────────────────────────
    if (type === 'premium_mensuel') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency: 'chf',
              product_data: {
                name: 'CaniPlus Premium',
                description: 'Ressources, vidéos, documents · CaniPlus Ballaigues',
              },
              recurring: { interval: 'month' },
              unit_amount: PREMIUM_PRICE_CHF,
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}?payment=success&type=premium_mensuel&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}?payment=cancelled`,
        client_reference_id: user_id,
        customer_email: user_email ?? undefined,
        metadata: { user_id, type: 'premium_mensuel' },
      });

      return new Response(
        JSON.stringify({ url: session.url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── CAS 2b : Paiement cours collectif (montant dynamique) ─────────────────
    if (type === 'cours_collectif') {
      const { course_id, course_title, amount, dog_ids } = body;
      if (!course_id || !amount) throw new Error('course_id et amount requis');

      // Créer ou récupérer l'entrée course_payments
      const { data: existing } = await supabase
        .from('course_payments')
        .select('id, status')
        .eq('user_id', user_id)
        .eq('course_id', course_id)
        .maybeSingle();

      if (existing?.status === 'paid') throw new Error('Ce cours est déjà payé');

      let paymentId = existing?.id;
      if (!paymentId) {
        const { data: newPayment, error: insertErr } = await supabase
          .from('course_payments')
          .insert({ user_id, course_id, amount, status: 'pending' })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        paymentId = newPayment.id;
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'chf',
            product_data: {
              name: course_title ?? 'Cours CaniPlus',
              description: 'Cours · CaniPlus Ballaigues',
            },
            unit_amount: amount * 100,
          },
          quantity: 1,
        }],
        success_url: `${appUrl}?payment=success&type=cours_collectif&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}?payment=cancelled`,
        client_reference_id: user_id,
        customer_email: user_email ?? undefined,
        metadata: {
          user_id,
          type: 'cours_collectif',
          course_payment_id: paymentId,
          course_id,
          // Stripe metadata accepte uniquement strings — on sérialise les dog_ids en JSON
          dog_ids: Array.isArray(dog_ids) && dog_ids.length > 0 ? JSON.stringify(dog_ids) : '',
        },
      });

      return new Response(
        JSON.stringify({ url: session.url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── CAS 3 : Paiement unique (cotisation / leçon privée) ───────────────────
    if (!subscription_id) {
      throw new Error('subscription_id requis pour les paiements uniques');
    }

    // Vérifier que l'abonnement appartient bien à cet utilisateur
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscription_id)
      .eq('user_id', user_id)
      .single();

    if (subError || !sub) throw new Error('Abonnement introuvable');
    if (sub.status === 'paid') throw new Error('Cet abonnement est déjà payé');

    const config = ONE_TIME_CONFIG[type] ?? { amount: 5000, name: 'Paiement CaniPlus', description: 'CaniPlus · Ballaigues' };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'chf',
            product_data: {
              name: config.name,
              description: config.description,
            },
            unit_amount: config.amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}?payment=success&type=${encodeURIComponent(type)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?payment=cancelled`,
      client_reference_id: user_id,
      customer_email: sub.user_email ?? user_email ?? undefined,
      metadata: { subscription_id, user_id, type },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? (err as any)?.details ?? (err as any)?.hint ?? String(err) ?? 'Erreur inconnue';
    console.error('create-checkout error:', JSON.stringify(err));
    // On retourne 200 pour que le client puisse lire data.error
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
