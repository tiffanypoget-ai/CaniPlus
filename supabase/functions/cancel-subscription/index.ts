// supabase/functions/cancel-subscription/index.ts
// Résilie un abonnement Stripe à la fin de la période en cours (pas de remboursement).
// Pour la cotisation annuelle (paiement unique), la résiliation est gérée côté client via Supabase direct.

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

    const { user_id, type } = await req.json();

    if (!user_id || !type) {
      throw new Error('Paramètres manquants : user_id, type');
    }

    if (type !== 'premium_mensuel') {
      throw new Error('Type non géré par cette fonction');
    }

    // Récupérer le stripe_subscription_id depuis le profil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, premium_until')
      .eq('id', user_id)
      .single();

    if (profileError || !profile) {
      throw new Error('Profil introuvable');
    }

    if (!profile.stripe_subscription_id) {
      throw new Error('Aucun abonnement Stripe actif trouvé');
    }

    // Annuler l'abonnement à la fin de la période → cancel_at_period_end: true
    // Le client garde l'accès jusqu'à la fin du mois payé
    const subscription = await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      { cancel_at_period_end: true },
    );

    const cancelAt = new Date(subscription.cancel_at! * 1000).toISOString();

    // Marquer dans la DB que la résiliation est en attente
    await supabase
      .from('profiles')
      .update({ premium_cancel_at: cancelAt })
      .eq('id', user_id);

    console.log(`🚫 Résiliation planifiée pour user ${user_id} le ${cancelAt}`);

    // Notif admin : résiliation premium
    try {
      const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      // Récupère le nom du membre pour un message lisible
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user_id)
        .single();
      const who = prof?.full_name || prof?.email || `user ${user_id}`;
      const niceDate = new Date(cancelAt).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
      await fetch(`${supaUrl}/functions/v1/notify-admin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'premium_canceled',
          title: `Premium résilié · ${who}`,
          body: `Accès premium jusqu'au ${niceDate}, puis arrêt automatique.`,
          metadata: { user_id, email: prof?.email, cancel_at: cancelAt, stripe_subscription_id: profile.stripe_subscription_id },
        }),
      });
    } catch (e) {
      console.error('notify-admin error (premium_canceled):', (e as Error).message);
    }

    return new Response(
      JSON.stringify({ success: true, cancel_at: cancelAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('Erreur cancel-subscription:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
