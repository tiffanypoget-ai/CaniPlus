// supabase/functions/trial-reminder/index.ts
// -----------------------------------------------------------------------------
// Rappel J-7 avant la fin du mois de premium offert (récompense de défi).
//
// Lancée chaque jour par pg_cron (migration add_defis_2026_07_13.sql).
// Interroge Stripe : abonnements en période d'essai (status=trialing) dont
// l'essai se termine dans 6 à 8 jours. Pour chacun, retrouve le profil via
// stripe_customer_id et envoie un email Brevo (canal transactionnel existant) :
//   - le premium devient payant le [date] (10 CHF/mois),
//   - comment résilier avant si la personne ne souhaite pas continuer.
// Idempotent : profiles.premium_trial_reminder_sent_at empêche tout doublon.
//
// Seuls les trials issus des défis existent (le parcours premium payant normal
// n'a pas d'essai) — cette fonction ne concerne donc que les sorties de défi.
// Auth : CRON_SECRET (header X-Cron-Secret) OU Bearer service role.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function isAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const xCron = req.headers.get('X-Cron-Secret') ?? '';
  if (auth === `Bearer ${serviceKey}`) return true;
  if (cronSecret && xCron === cronSecret) return true;
  return false;
}

function fmtDateFr(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString('fr-CH', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich',
  });
}

function reminderHtml(firstName: string, chargeDate: string): string {
  const prenom = firstName ? ` ${firstName}` : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F8F5F0;font-family:Arial,sans-serif;color:#1f1f20;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;"><tr><td style="padding:32px 32px 8px;"><div style="font-size:32px;color:#2BABE1;font-weight:bold;">CaniPlus</div></td></tr><tr><td style="padding:8px 32px 0;"><h1 style="font-size:22px;margin:0 0 14px;">Ton mois offert se termine dans 7 jours</h1><p style="font-size:15px;line-height:1.7;margin:0 0 14px;color:#3d3d3d;">Coucou${prenom} !<br/>Petit rappel tout simple : ton mois de <strong>CaniPlus Premium offert</strong> (bravo encore pour ton défi !) se termine bientôt.</p><div style="background:#F5E6D3;border-radius:12px;padding:16px 18px;margin:0 0 18px;"><p style="font-size:14px;line-height:1.7;margin:0;color:#2C3E50;"><strong>À partir du ${chargeDate}</strong>, ton abonnement passe à <strong>10 CHF/mois</strong>, prélevés automatiquement sur la carte enregistrée. Tu gardes bien sûr l'accès à toutes les ressources, avec une nouveauté chaque semaine.</p></div><p style="font-size:14px;line-height:1.7;margin:0 0 8px;color:#3d3d3d;"><strong>Tu ne souhaites pas continuer ?</strong> Aucun souci, la résiliation prend 30 secondes et il n'y aura aucun prélèvement :</p><p style="font-size:14px;line-height:1.7;margin:0 0 18px;color:#3d3d3d;">Ouvre l'app → <strong>Profil</strong> → <strong>Accès premium</strong> → <strong>Résilier l'abonnement</strong>, avant le ${chargeDate}.</p><div style="text-align:center;margin:24px 0;"><a href="https://app.caniplus.ch" style="display:inline-block;background:#2BABE1;color:#FFFFFF;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Ouvrir CaniPlus</a></div><p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0;">Une question ? Écris-nous à <a href="mailto:info@caniplus.ch" style="color:#1e8db8;">info@caniplus.ch</a>, on répond avec plaisir.</p></td></tr><tr><td style="padding:24px 32px 32px;border-top:1px solid #eee;"><p style="font-size:13px;margin:0;"><a href="https://caniplus.ch" style="color:#1e8db8;">caniplus.ch</a> · <a href="https://app.caniplus.ch" style="color:#1e8db8;">app.caniplus.ch</a></p></td></tr></table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 });
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
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? '';
    if (!brevoKey) throw new Error('BREVO_API_KEY manquante');

    // Fenêtre J-7 : essais finissant dans 6 à 8 jours. Le cron passe une fois
    // par jour → chaque abonnement tombe dans la fenêtre 2 jours de suite, le
    // flag premium_trial_reminder_sent_at évite le second envoi.
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = nowSec + 6 * 86400;
    const windowEnd = nowSec + 8 * 86400;

    let sent = 0;
    let checked = 0;
    let startingAfter: string | undefined;

    // Pagination : peu de trials simultanés attendus, mais on couvre le cas.
    while (true) {
      const page = await stripe.subscriptions.list({
        status: 'trialing',
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const sub of page.data) {
        checked++;
        if (!sub.trial_end || sub.trial_end < windowStart || sub.trial_end >= windowEnd) continue;

        const customerId = sub.customer as string;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, full_name, premium_trial_reminder_sent_at')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (!profile?.email) {
          console.warn(`[trial-reminder] pas de profil pour customer ${customerId}`);
          continue;
        }
        if (profile.premium_trial_reminder_sent_at) continue; // déjà prévenu·e
        if (sub.cancel_at_period_end) continue; // a déjà résilié : rien à rappeler

        const chargeDate = fmtDateFr(sub.trial_end);
        const firstName = (profile.full_name ?? '').split(' ')[0];

        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'content-type': 'application/json', 'accept': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'CaniPlus', email: 'info@caniplus.ch' },
            to: [{ email: profile.email }],
            subject: `Ton mois offert se termine le ${chargeDate} — premium à 10 CHF/mois ensuite`,
            htmlContent: reminderHtml(firstName, chargeDate),
          }),
        });

        if (!r.ok) {
          const t = await r.text().catch(() => '');
          console.error(`[trial-reminder] Brevo error pour ${profile.email}:`, r.status, t);
          continue;
        }

        await supabase
          .from('profiles')
          .update({ premium_trial_reminder_sent_at: new Date().toISOString() })
          .eq('id', profile.id);
        sent++;
        console.log(`✅ [trial-reminder] rappel envoyé à ${profile.email} (prélèvement le ${chargeDate})`);
      }

      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }

    return new Response(
      JSON.stringify({ ok: true, checked, sent }),
      { headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('trial-reminder error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
