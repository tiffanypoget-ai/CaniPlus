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

    const appUrl = Deno.env.get('APP_URL') ?? 'https://cani-plus.vercel.app';

    // ── CAS 1 : Abonnement mensuel premium ────────────────────────────────────
    if (type === 'premium_mensuel') {
      const session = await stripe.checkout.sessions.create({
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
        success_url: `${appUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
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

    // ── CAS 2 : Paiement unique (cotisation / leçon privée) ───────────────────
    let sub: any = null;

    if (subscription_id) {
      // Utiliser la subscription existante
      const { data, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscription_id)
        .eq('user_id', user_id)
        .single();
      if (subError || !data) throw new Error('Abonnement introuvable');
      if (data.status === 'paid') throw new Error('Cet abonnement est déjà payé');
      sub = data;
    } else {
      // Créer une nouvelle subscription pending à la volée
      const { data, error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          user_id,
          type,
          status: 'pending',
          user_email: user_email ?? null,
          year: new Date().getFullYear(),
          private_lessons_total: type === 'lecon_privee' ? 1 : 0,
        })
        .select()
        .single();
      if (insertError || !data) throw new Error('Impossible de créer la subscription: ' + insertError?.message);
      sub = data;
    }

    const config = ONE_TIME_CONFIG[type] ?? { amount: 5000, name: 'Paiement CaniPlus', description: 'CaniPlus · Ballaigues' };

    const session = await stripe.checkout.sessions.create({
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
      success_url: `${appUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?payment=cancelled`,
      client_reference_id: user_id,
      customer_email: sub.user_email ?? user_email ?? undefined,
      metadata: { subscription_id: sub.id, user_id, type },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
