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

  console.log(`[webhook] received event=${event.id} type=${event.type}`);

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
    if (type === 'product_purchase') {
      const purchaseId = session.metadata?.purchase_id;
      const productId = session.metadata?.product_id;
      const buyerId = session.metadata?.user_id;
      console.log(`[product_purchase] event=${event.id} session=${session.id} purchase_id=${purchaseId} product_id=${productId} user_id=${buyerId}`);

      // Tentative 1 : update par purchase_id (chemin nominal)
      let matched = false;
      // Id de la ligne user_purchases réellement passée en payé, quel que soit
      // le chemin emprunté. Sert à l'email de confirmation des soirées.
      let paidPurchaseId: string | null = purchaseId ?? null;
      if (purchaseId) {
        const { data, error } = await supabase
          .from('user_purchases')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id,
          })
          .eq('id', purchaseId)
          .select('id, status');
        if (error) {
          console.error('[product_purchase] update by id error:', error.message, JSON.stringify(error));
        } else if (data && data.length > 0) {
          matched = true;
          paidPurchaseId = data[0].id;
          console.log(`✅ [product_purchase] paid via purchase_id — ${data[0].id}`);
        } else {
          console.warn(`[product_purchase] update by id matched 0 rows for purchase_id=${purchaseId}`);
        }
      }

      // Tentative 2 (fallback) : retrouver/créer la ligne via user_id + product_id
      if (!matched && buyerId && productId) {
        const { data: existing, error: selErr } = await supabase
          .from('user_purchases')
          .select('id')
          .eq('user_id', buyerId)
          .eq('product_id', productId)
          .maybeSingle();
        if (selErr) console.error('[product_purchase] fallback select error:', selErr.message);

        if (existing?.id) {
          const { error: updErr } = await supabase
            .from('user_purchases')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
            })
            .eq('id', existing.id);
          if (updErr) console.error('[product_purchase] fallback update error:', updErr.message);
          else { matched = true; paidPurchaseId = existing.id; console.log(`✅ [product_purchase] paid via fallback select — ${existing.id}`); }
        } else {
          // Aucune ligne existante : on crée directement la ligne payée
          const amount = session.amount_total ? Number((session.amount_total / 100).toFixed(2)) : null;
          const { data: ins, error: insErr } = await supabase
            .from('user_purchases')
            .insert({
              user_id: buyerId,
              product_id: productId,
              amount_chf: amount,
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
            })
            .select('id')
            .single();
          if (insErr) console.error('[product_purchase] fallback insert error:', insErr.message);
          else { matched = true; paidPurchaseId = ins?.id ?? null; console.log(`✅ [product_purchase] paid via fallback insert — ${ins?.id}`); }
        }
      }

      if (!matched) {
        console.error(`❌ [product_purchase] AUCUN MATCH — session=${session.id}. metadata=${JSON.stringify(session.metadata)}`);
      }

      // — Soirée CaniPlus : email de confirmation avec le lien Zoom
      // Le lien Zoom ne transite jamais par ici : soiree-emails le lit lui-même
      // dans webinar_access après avoir revérifié que l'achat est bien payé.
      // Envoi best-effort — un échec d'email ne doit pas faire échouer le
      // webhook, sinon Stripe rejoue l'événement et le paiement est retraité.
      if (matched && productId) {
        try {
          const { data: prod } = await supabase
            .from('digital_products')
            .select('category')
            .eq('id', productId)
            .maybeSingle();

          if (prod?.category === 'soiree') {
            const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/soiree-emails`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'confirmation',
                product_id: productId,
                purchase_id: paidPurchaseId,
                email: session.customer_details?.email ?? session.customer_email ?? undefined,
                full_name: session.customer_details?.name ?? undefined,
              }),
            });
            console.log(`[soiree] confirmation demandée pour ${productId} — HTTP ${r.status}`);
          }
        } catch (e) {
          console.error('[soiree] envoi confirmation impossible:', (e as Error).message);
        }
      }
    }

    // — Achat invité depuis le site vitrine (sans compte) — Chantier A
    if (type === 'product_purchase_guest') {
      const purchaseId = session.metadata?.purchase_id;
      const productId = session.metadata?.product_id;
      const guestEmail = session.metadata?.guest_email || session.customer_details?.email || session.customer_email;
      console.log(`[product_purchase_guest] event=${event.id} session=${session.id} purchase_id=${purchaseId} guest=${guestEmail}`);

      if (purchaseId) {
        const { error: updErr } = await supabase
          .from('user_purchases')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id,
            guest_email: guestEmail,
          })
          .eq('id', purchaseId);
        if (updErr) console.error('[product_purchase_guest] update error:', updErr.message);
      }

      // — Soirée payée sans compte depuis le site vitrine
      // Même chemin d'email que pour un membre : soiree-emails relit lui-même
      // webinar_access après avoir revérifié que l'achat est payé, le lien Zoom
      // ne transite jamais par ce webhook. Le PDF de support n'est PAS envoyé
      // ici : il n'est débloqué qu'au début de la soirée (get-webinar-access).
      let soireeGuest = false;
      let coachingGuest = false;
      if (productId) {
        const { data: prodGuest } = await supabase
          .from('digital_products')
          .select('category')
          .eq('id', productId)
          .maybeSingle();
        soireeGuest = prodGuest?.category === 'soiree';
        coachingGuest = prodGuest?.category === 'coaching';
      }

      if (soireeGuest && productId) {
        try {
          const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/soiree-emails`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'confirmation',
              product_id: productId,
              purchase_id: purchaseId ?? null,
              email: guestEmail ?? undefined,
              full_name: session.customer_details?.name ?? undefined,
            }),
          });
          console.log(`[soiree][guest] confirmation demandée pour ${productId} — HTTP ${r.status}`);
        } catch (e) {
          console.error('[soiree][guest] envoi confirmation impossible:', (e as Error).message);
        }
      }

      // ── Coaching visio : ni lien Zoom, ni PDF ────────────────────────────
      // La seance n'a pas encore de date : l'acheteur vient de payer une heure,
      // il faut maintenant convenir du creneau. On lui envoie un accuse de
      // reception qui lui demande ses disponibilites, et Tiffany est prevenue
      // par la notification admin plus bas, commune a tous les achats.
      // Meme chemin d'envoi que le guide (Brevo depuis ce webhook), pas un
      // second mecanisme.
      if (coachingGuest && productId && guestEmail) {
        try {
          const { data: product } = await supabase
            .from('digital_products')
            .select('title, subtitle')
            .eq('id', productId)
            .single();
          const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
          if (!apiKey) {
            console.error('[coaching][guest] BREVO_API_KEY manquante');
          } else {
            const subject = 'Ton coaching CaniPlus est reserve';
            const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8F5F0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f1f20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Brush Script MT',cursive;font-size:32px;color:#2BABE1;">CaniPlus</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="font-size:24px;margin:0 0 14px;color:#1f1f20;">Merci, ton heure est reservee</h1>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">
            Ton paiement pour <strong>${product?.title ?? 'le coaching personnalise'}</strong> est bien recu.
            Il reste a fixer le creneau qui t'arrange.
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">
            <strong>Reponds simplement a cet email</strong> avec deux ou trois moments qui te conviennent
            dans les prochaines semaines, et dis-nous en une phrase ce sur quoi tu veux travailler
            avec ton chien. Tiffany te confirme le creneau et t'envoie le lien de la visio.
          </p>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
            La seance dure une heure et se fait sur Zoom ou Meet, depuis chez toi.
            Une question d'ici la ? Ecris a <a href="mailto:info@caniplus.ch" style="color:#1e8db8;">info@caniplus.ch</a>.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
          CaniPlus &middot; Tiffany Cotting &middot; Ballaigues
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
            const r = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
              body: JSON.stringify({
                sender: { name: 'CaniPlus', email: 'info@caniplus.ch' },
                to: [{ email: guestEmail }],
                replyTo: { name: 'CaniPlus', email: 'info@caniplus.ch' },
                subject,
                htmlContent: html,
              }),
            });
            if (!r.ok) {
              const t = await r.text().catch(() => '');
              console.error('[coaching][guest] Brevo error:', r.status, t);
            } else {
              console.log(`✅ [coaching][guest] accuse de reception envoye a ${guestEmail}`);
              if (purchaseId) {
                await supabase
                  .from('user_purchases')
                  .update({ delivered_at: new Date().toISOString() })
                  .eq('id', purchaseId);
              }
            }
          }
        } catch (e) {
          console.error('[coaching][guest] envoi email exception:', (e as any)?.message ?? e);
        }
      }

      if (!soireeGuest && !coachingGuest && productId && guestEmail) {
        try {
          const { data: product } = await supabase
            .from('digital_products')
            .select('title, file_path, subtitle')
            .eq('id', productId)
            .single();

          if (product?.file_path) {
            const fileName = product.file_path.split('/').pop() || 'guide-caniplus.pdf';
            const { data: signed, error: signedErr } = await supabase
              .storage
              .from('digital-products')
              .createSignedUrl(product.file_path, 60 * 60 * 24 * 7, { download: fileName });

            if (signedErr) {
              console.error('[product_purchase_guest] signed URL error:', signedErr.message);
            } else if (signed?.signedUrl) {
              const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
              if (!apiKey) {
                console.error('[product_purchase_guest] BREVO_API_KEY manquante');
              } else {
                const subject = `Ton guide CaniPlus : ${product.title}`;
                const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8F5F0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f1f20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Brush Script MT',cursive;font-size:32px;color:#2BABE1;">CaniPlus</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="font-size:24px;margin:0 0 14px;color:#1f1f20;">Merci pour ton achat !</h1>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">
            Voici ton guide <strong>${product.title}</strong> ${product.subtitle ? '— ' + product.subtitle : ''}.<br/>
            Clique sur le bouton ci-dessous pour le télécharger.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${signed.signedUrl}" style="display:inline-block;background:#2BABE1;color:#FFFFFF;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Télécharger mon guide</a>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
            Ce lien reste valable 7 jours. Si tu le perds, écris-nous à <a href="mailto:info@caniplus.ch" style="color:#1e8db8;">info@caniplus.ch</a> et on te renverra le PDF.
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;border-top:1px solid #eee;margin-top:24px;">
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0;">
            Tu veux aller plus loin avec ton chien ? Notre club <strong>CaniPlus</strong> propose des cours collectifs hebdomadaires à Ballaigues, des cours privés à domicile et des entretiens conseil par visio.
          </p>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:14px 0 0;">
            <a href="https://caniplus.ch" style="color:#1e8db8;">caniplus.ch</a> · <a href="https://app.caniplus.ch" style="color:#1e8db8;">app.caniplus.ch</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
          CaniPlus &middot; Tiffany Cotting &middot; Ballaigues
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

                const r = await fetch('https://api.brevo.com/v3/smtp/email', {
                  method: 'POST',
                  headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
                  body: JSON.stringify({
                    sender: { name: 'CaniPlus', email: 'info@caniplus.ch' },
                    to: [{ email: guestEmail }],
                    subject,
                    htmlContent: html,
                  }),
                });
                if (!r.ok) {
                  const t = await r.text().catch(() => '');
                  console.error('[product_purchase_guest] Brevo error:', r.status, t);
                } else {
                  console.log(`✅ [product_purchase_guest] PDF envoyé par email à ${guestEmail}`);
                  if (purchaseId) {
                    await supabase
                      .from('user_purchases')
                      .update({ delivered_at: new Date().toISOString() })
                      .eq('id', purchaseId);
                  }
                }
              }
            }
          } else {
            console.error('[product_purchase_guest] produit sans file_path:', productId);
          }
        } catch (e) {
          console.error('[product_purchase_guest] envoi email exception:', (e as any)?.message ?? e);
        }
      }

      // Notification admin
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-admin`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            kind: 'payment_received',
            title: soireeGuest
              ? `Inscription soirée depuis le site : ${guestEmail}`
              : `Achat boutique site web : ${guestEmail}`,
            body: soireeGuest
              ? `Une inscription à une soirée a été payée depuis caniplus.ch, sans compte. Le lien Zoom a été envoyé par email.`
              : `Un visiteur a acheté un guide depuis le site. Le PDF lui a été envoyé par email.`,
            metadata: { purchase_id: purchaseId, product_id: productId, guest_email: guestEmail },
            channels: ['in_app', 'push', 'email'],
          }),
        }).catch(() => {});
      } catch (_) {}
    }

    // — Paiement cours collectif
    if (type === 'cours_collectif' && session.metadata?.course_payment_id) {
      const { error } = await supabase
        .from('course_payments')
        .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: session.id })
        .eq('id', session.metadata.course_payment_id);
      if (error) console.error('Erreur mise à jour course_payment:', error.message);
      else console.log(`✅ Cours payé — course_payment ${session.metadata.course_payment_id}`);

      // Inscription automatique au cours après paiement réussi.
      // Sinon, le membre paie mais n'apparaît pas dans la liste des inscrits côté admin.
      const userId = session.metadata.user_id;
      const courseId = session.metadata.course_id;
      if (userId && courseId) {
        let dogIds: string[] = [];
        try {
          if (session.metadata.dog_ids) dogIds = JSON.parse(session.metadata.dog_ids);
        } catch (_) {}
        const { error: attErr } = await supabase
          .from('course_attendance')
          .upsert(
            { user_id: userId, course_id: courseId, dog_ids: dogIds },
            { onConflict: 'user_id,course_id' },
          );
        if (attErr) console.error('Erreur inscription auto course_attendance:', attErr.message);
        else console.log(`✅ Inscription auto au cours ${courseId} pour user ${userId}`);
      }
    }

    // — Demande de coaching (présentiel ou distance) — Phase 4
    if (type === 'coaching_request' && session.metadata?.request_id) {
      const { error } = await supabase
        .from('private_course_requests')
        .update({
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
        })
        .eq('id', session.metadata.request_id);
      if (error) console.error('Erreur mise à jour coaching_request:', error.message);
      else console.log(`✅ Coaching payé — request ${session.metadata.request_id} (remote=${session.metadata.is_remote})`);
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

    // — Notification admin : paiement reçu (tous types confondus)
    try {
      const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const amount = session.amount_total ? `CHF ${(session.amount_total / 100).toFixed(0)}` : '';
      const labels: Record<string, string> = {
        premium_mensuel: 'Abonnement premium',
        product_purchase: 'Achat boutique',
        cours_collectif: 'Cours collectif',
        coaching_request: 'Coaching',
      };
      const label = labels[type ?? ''] ?? (subscription_id ? 'Cotisation / leçon privée' : 'Paiement');
      const customerEmail = session.customer_details?.email ?? session.customer_email ?? '';
      if (supaUrl && serviceKey) {
        await fetch(`${supaUrl}/functions/v1/notify-admin`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'payment_received',
            title: `${label} payé · ${amount}`,
            body: customerEmail ? `Client : ${customerEmail}` : 'Paiement Stripe confirmé.',
            metadata: { type, amount: session.amount_total, currency: session.currency, customer_email: customerEmail, session_id: session.id, user_id, subscription_id },
          }),
        });
      }
    } catch (e) {
      console.error('notify-admin error (payment):', (e as Error).message);
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

  // ══════════════════════════════════════════════════════════════════════════
  // ↩ REMBOURSEMENT (compte RI) — pendant du handler du webhook club
  // ══════════════════════════════════════════════════════════════════════════
  // Les remboursements se font à la main dans le dashboard Stripe RI (cas rare,
  // pas d'annulation en self-service). Cet événement répercute le geste dans
  // l'app : l'achat repasse en 'refunded', ce qui coupe immédiatement l'accès
  // au lien Zoom et au replay (get-webinar-access et soiree-emails ne
  // travaillent que sur status='paid').
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const email = charge.billing_details?.email ?? charge.receipt_email ?? '';

    // Un remboursement partiel ne retire pas l'accès : seul un remboursement
    // intégral annule l'inscription. `charge.refunded` n'est vrai qu'au
    // remboursement complet.
    if (!charge.refunded) {
      console.log(`[refund] remboursement partiel sur ${charge.id} — accès conservé`);
    } else {
      // La charge ne porte pas l'id de session Checkout : on remonte par le
      // payment_intent, qui est la clé commune avec user_purchases.stripe_session_id.
      let sessionId: string | null = null;
      try {
        if (charge.payment_intent) {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: charge.payment_intent as string,
            limit: 1,
          });
          sessionId = sessions.data?.[0]?.id ?? null;
        }
      } catch (e) {
        console.error('[refund] lookup session error:', (e as Error).message);
      }

      if (!sessionId) {
        console.error(`❌ [refund] session Checkout introuvable pour charge=${charge.id} — à traiter à la main`);
      } else {
        const { data: updated, error: updErr } = await supabase
          .from('user_purchases')
          .update({ status: 'refunded' })
          .eq('stripe_session_id', sessionId)
          .eq('status', 'paid')
          .select('id, product_id');

        if (updErr) {
          console.error('[refund] update user_purchases error:', updErr.message);
        } else if (updated?.length) {
          console.log(`↩ [refund] achat ${updated[0].id} remboursé — accès coupé`);
        } else {
          console.log(`[refund] aucun achat payé pour session=${sessionId} (remboursement hors boutique)`);
        }
      }
    }

    try {
      const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      if (supaUrl && serviceKey) {
        await fetch(`${supaUrl}/functions/v1/notify-admin`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'refund',
            title: `Remboursement · CHF ${(charge.amount_refunded / 100).toFixed(2)}`,
            body: email ? `Client : ${email}` : 'Remboursement effectué sur le compte RI.',
            metadata: { charge_id: charge.id, amount_refunded: charge.amount_refunded, full_refund: charge.refunded },
          }),
        });
      }
    } catch (e) {
      console.error('notify-admin error (refund):', (e as Error).message);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
