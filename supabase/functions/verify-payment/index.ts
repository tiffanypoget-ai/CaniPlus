// supabase/functions/verify-payment/index.ts
// Vérifie une session Stripe et marque automatiquement le paiement comme validé.

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
    const { session_id } = await req.json();
    if (!session_id) throw new Error('session_id manquant');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Récupérer la session Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ ok: false, reason: 'not_paid' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type, subscription_id, user_id } = session.metadata ?? {};

    // ── Cotisation annuelle ou leçon privée ──────────────────────────────────
    if (subscription_id) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
        })
        .eq('id', subscription_id);
    }

    // ── Premium mensuel ──────────────────────────────────────────────────────
    if (type === 'premium_mensuel' && user_id && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const premiumUntil = new Date(sub.current_period_end * 1000).toISOString();
      await supabase
        .from('profiles')
        .update({
          premium_until: premiumUntil,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', user_id);
    }

    return new Response(JSON.stringify({ ok: true, type, subscription_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
