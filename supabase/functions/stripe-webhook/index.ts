// supabase/functions/stripe-webhook/index.ts
// Gère les événements Stripe : paiements uniques ET abonnements mensuels premium.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Signature manquante', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur signature';
    console.error('Webhook signature invalide:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ✅ PAIEMENT RÉUSSI (paiement unique OU début d'abonnement)
  // ══════════════════════════════════════════════════════════════════════════
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { type, subscription_id, user_id } = session.metadata ?? {};

    // — Abonnement mensuel premium
    if (type === 'premium_mensuel' && user_id) {
      // Récupérer la date de fin de période depuis l'abonnement Stripe
      let premiumUntil: string;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        premiumUntil = new Date(sub.current_period_end * 1000).toISOString();
      } else {
        // Fallback : 30 jours
        const d = new Date();
        d.setDate(d.getDate() + 30);
        premiumUntil = d.toISOString();
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          premium_until: premiumUntil,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', user_id);

      if (error) console.error('Erreur mise à jour profil premium:', error.message);
      else console.log(`✅ Premium activé pour user ${user_id} jusqu'au ${premiumUntil}`);
    }

    // — Achat produit numérique (guide, pack de fiches, ebook)
    if (type === 'product_purchase' && session.metadata?.purchase_id) {
      const { error } = await supabase
        .from('user_purchases')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
        })
        .eq('id', session.metadata.purchase_id);
      if (error) console.error('Erreur mise à jour user_purchase:', error.message);
      else console.log(`✅ Produit acheté — purchase ${session.metadata.purchase_id} (${session.metadata.product_slug})`);
    }

    // — Paiement cours collectif
    if (type === 'cours_collectif' && session.metadata?.course_payment_id) {
      const { error } = await supabase
        .from('course_payments')
        .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: session.id })
        .eq('id', session.metadata.course_payment_id);
      if (error) console.error('Erreur mise à jour course_payment:', error.message);
      else console.log(`✅ Cours payé — course_payment ${session.metadata.course_payment_id}`);
    }

    // — Paiement unique (cotisation / leçon privée)
    if (subscription_id) {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
        })
        .eq('id', subscription_id);

      if (error) console.error('Erreur mise à jour subscription:', error.message);
      else console.log(`✅ Abonnement ${subscription_id} marqué payé`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 🔄 RENOUVELLEMENT MENSUEL (facture payée = prolonger le premium)
  // ══════════════════════════════════════════════════════════════════════════
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;

    // Ignorer la première facture (déjà traitée par checkout.session.completed)
    if (invoice.billing_reason === 'subscription_create') {
      return new Response(JSON.stringify({ received: true }));
    }

    if (invoice.subscription) {
      const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
      const premiumUntil = new Date(sub.current_period_end * 1000).toISOString();
      const customerId = sub.customer as string;

      const { error } = await supabase
        .from('profiles')
        .update({ premium_until: premiumUntil })
        .eq('stripe_customer_id', customerId);

      if (error) console.error('Erreur renouvellement premium:', error.message);
      else console.log(`🔄 Premium renouvelé jusqu'au ${premiumUntil}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⏳ RÉSILIATION PROGRAMMÉE (cancel_at_period_end = true côté Stripe)
  // ══════════════════════════════════════════════════════════════════════════
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = sub.customer as string;
    if (sub.cancel_at_period_end && sub.cancel_at) {
      const cancelAt = new Date(sub.cancel_at * 1000).toISOString();
      await supabase.from('profiles')
        .update({ premium_cancel_at: cancelAt })
        .eq('stripe_customer_id', customerId);
      console.log(`⏳ Résiliation programmée au ${cancelAt}`);
    } else {
      // L'utilisateur a rétracté sa résiliation
      await supabase.from('profiles')
        .update({ premium_cancel_at: null })
        .eq('stripe_customer_id', customerId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ❌ RÉSILIATION EFFECTIVE / ÉCHEC DE PAIEMENT (révoquer le premium)
  // ══════════════════════════════════════════════════════════════════════════
  if (event.type === 'customer.subscription.deleted' ||
      event.type === 'invoice.payment_failed') {

    const obj = event.data.object as Stripe.Subscription | Stripe.Invoice;
    const customerId = 'customer' in obj ? obj.customer as string : null;

    if (customerId) {
      // Supprimer l'accès premium et effacer les données d'abonnement
      const { error } = await supabase
        .from('profiles')
        .update({
          premium_until: new Date(0).toISOString(),
          premium_cancel_at: null,
          stripe_subscription_id: null,
        })
        .eq('stripe_customer_id', customerId);

      if (error) console.error('Erreur révocation premium:', error.message);
      else console.log(`❌ Premium révoqué pour customer ${customerId}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
