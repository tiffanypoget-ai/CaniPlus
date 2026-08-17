// supabase/functions/stripe-webhook-club/index.ts
// Webhook du compte Stripe CLUB (association). Séparé du webhook RI.
// Traite les paiements encaissés sur le compte du club : cours collectifs et
// cotisations annuelles. Écrit les recettes (+ frais Stripe) dans l'entité 'club'.
//
// Secrets utilisés : STRIPE_SECRET_KEY_CLUB + STRIPE_WEBHOOK_SECRET_CLUB.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY_CLUB') ?? '', {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Signature manquante', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET_CLUB') ?? '',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur signature';
    console.error('[club-webhook] signature invalide:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  console.log(`[club-webhook] event=${event.id} type=${event.type}`);

  async function notifyAdmin(kind: string, title: string, bodyTxt: string, metadata: Record<string, unknown>) {
    try {
      const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      if (!supaUrl || !serviceKey) return;
      await fetch(`${supaUrl}/functions/v1/notify-admin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, body: bodyTxt, metadata }),
      });
    } catch (e) { console.error('notify-admin error:', (e as Error).message); }
  }

  async function comptaInsert(
    externalId: string, dateSec: number, libelle: string,
    montantCents: number | null | undefined, catNom: string | null,
    notes: string, sens: 'recette' | 'depense' = 'recette',
  ) {
    if (!montantCents || montantCents <= 0) return;
    try {
      let categorieId: string | null = null;
      if (catNom) {
        const { data: cat } = await supabase
          .from('compta_categories').select('id')
          .eq('entity', 'club').eq('nom', catNom).maybeSingle();
        categorieId = cat?.id ?? null;
      }
      const dateOp = new Date(dateSec * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
      const { error } = await supabase.from('compta_transactions').upsert({
        entity: 'club', date_operation: dateOp, libelle,
        montant: Number((montantCents / 100).toFixed(2)), sens,
        categorie_id: categorieId, source: 'stripe', statut: 'a_valider',
        external_id: externalId, notes,
      }, { onConflict: 'external_id', ignoreDuplicates: true });
      if (error) console.error('[club-compta] insert error:', error.message);
      else console.log(`[club-compta] ${sens} · ${libelle}`);
    } catch (e) { console.error('[club-compta] exception:', (e as Error).message); }
  }

  async function comptaInsertFee(paymentIntent: string | null, chargeId: string | null, dateSec: number, libelleClient: string) {
    try {
      let cid = chargeId;
      if (!cid && paymentIntent) {
        const pi = await stripe.paymentIntents.retrieve(paymentIntent);
        cid = (pi.latest_charge as string) ?? null;
      }
      if (!cid) return;
      const charge = await stripe.charges.retrieve(cid, { expand: ['balance_transaction'] });
      const bt = charge.balance_transaction as Stripe.BalanceTransaction | null;
      const feeCents = bt?.fee ?? 0;
      if (feeCents > 0) {
        await comptaInsert(`fee_${cid}`, dateSec, `Frais Stripe${libelleClient ? ' — ' + libelleClient : ''}`, feeCents, 'Frais Stripe', 'Commission Stripe (compte club) — rapprochée automatiquement', 'depense');
      }
    } catch (e) { console.error('[club-fee] exception:', (e as Error).message); }
  }

  // ✅ PAIEMENT RÉUSSI
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { type, subscription_id, user_id } = session.metadata ?? {};
    const customerEmail = session.customer_details?.email ?? session.customer_email ?? '';

    // Cours collectif : marquer payé + inscrire l'élève
    if (type === 'cours_collectif' && session.metadata?.course_payment_id) {
      await supabase.from('course_payments')
        .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: session.id })
        .eq('id', session.metadata.course_payment_id);
      const courseId = session.metadata.course_id;
      if (user_id && courseId) {
        let dogIds: string[] = [];
        try { if (session.metadata.dog_ids) dogIds = JSON.parse(session.metadata.dog_ids); } catch (_) {}
        await supabase.from('course_attendance')
          .upsert({ user_id, course_id: courseId, dog_ids: dogIds }, { onConflict: 'user_id,course_id' });
      }
    }

    // Cotisation annuelle payée par carte
    if (subscription_id) {
      await supabase.from('subscriptions')
        .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: session.id })
        .eq('id', subscription_id);
    }

    // Écriture compta (entité club) + frais
    const isCotisation = type === 'cotisation_annuelle' || (!!subscription_id && type !== 'cours_collectif');
    const catNom = type === 'cours_collectif' ? 'Cours en supplément (encaissés via app)' : 'Cotisations membres';
    const label = type === 'cours_collectif' ? 'Cours collectif' : 'Cotisation annuelle';
    await comptaInsert(session.id, event.created, `${label}${customerEmail ? ' — ' + customerEmail : ''}`, session.amount_total, catNom, `Stripe club (type=${type ?? 'cotisation'})`);
    await comptaInsertFee(session.payment_intent as string | null, null, event.created, customerEmail || label);

    const amount = session.amount_total ? `CHF ${(session.amount_total / 100).toFixed(0)}` : '';
    await notifyAdmin('payment_received', `${label} payé (club) · ${amount}`, customerEmail ? `Client : ${customerEmail}` : 'Paiement club confirmé.', { type, amount: session.amount_total, customer_email: customerEmail, session_id: session.id });
  }

  // ↩ REMBOURSEMENT (club)
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const email = charge.billing_details?.email ?? charge.receipt_email ?? '';
    await comptaInsert(`refund_${charge.id}`, event.created, `Remboursement Stripe (club)${email ? ' — ' + email : ''}`, charge.amount_refunded, null, 'Remboursement Stripe compte club — vérifier la catégorie au moment de valider', 'depense');
    await notifyAdmin('refund', `Remboursement club · CHF ${(charge.amount_refunded / 100).toFixed(2)}`, email ? `Client : ${email}` : 'Remboursement club effectué.', { charge_id: charge.id, amount_refunded: charge.amount_refunded });
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
