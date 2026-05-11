// supabase/functions/cash-payment-reminder/index.ts
// -----------------------------------------------------------------------------
// Envoie un rappel push + email aux membres avec une réservation en paiement
// sur place dont le créneau est dans ~48h (fenêtre 44h - 50h pour ne rien rater).
//
// Couvre :
//   - subscriptions cash_pending (lecon_privee, cours_theorique, cours_special)
//     avec lesson_date dans la fenêtre
//   - private_course_requests cash_pending avec chosen_slot.date+start dans
//     la fenêtre
//
// Lancée par pg_cron toutes les heures.
// Auth : CRON_SECRET (header X-Cron-Secret) OU Bearer service role.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const VAPID_PUBLIC = 'BPzDogj1Yt0zU_REZk5GNHZdCPNSfjAVNRgD7B0Azdwt6pxwyM4oLSQmiv0SehIsrhGQkkD3sQTa31tT8tc25dc';

function ok(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function isAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const xCron = req.headers.get('X-Cron-Secret') ?? '';
  if (auth === `Bearer ${serviceKey}`) return true;
  if (cronSecret && xCron === cronSecret) return true;
  return false;
}

async function sendPushTo(userId: string, supabase: any, title: string, body: string, url: string) {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (!subs || subs.length === 0) return 0;

  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!vapidPrivate) return 0;

  webpush.setVapidDetails('mailto:info@caniplus.ch', VAPID_PUBLIC, vapidPrivate);

  let sent = 0;
  for (const s of subs) {
    try {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      const payload = JSON.stringify({ title, body, url, tag: 'cash-reminder' });
      await webpush.sendNotification(subscription, payload, { TTL: 600, urgency: 'high' });
      sent++;
    } catch (e) {
      console.error('push send error:', (e as any)?.message ?? e);
    }
  }
  return sent;
}

async function sendEmailTo(email: string, fullName: string | null, subject: string, htmlBody: string) {
  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  if (!apiKey) return false;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8F5F0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f1f20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.05);">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-family:'Brush Script MT',cursive;font-size:30px;color:#2BABE1;">CaniPlus</div>
        </td></tr>
        <tr><td style="padding:4px 32px 24px;">
          ${htmlBody}
        </td></tr>
        <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
          CaniPlus &middot; Tiffany Cotting &middot; Ballaigues
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'CaniPlus', email: 'info@caniplus.ch' },
        to: [{ email, name: fullName || undefined }],
        subject,
        htmlContent: html,
      }),
    });
    return r.ok;
  } catch (e) {
    console.error('brevo error:', (e as any)?.message ?? e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const now = new Date();
    const minTs = new Date(now.getTime() + 44 * 60 * 60 * 1000); // 44h
    const maxTs = new Date(now.getTime() + 50 * 60 * 60 * 1000); // 50h

    let pushed = 0;
    let emailed = 0;
    let reminded = 0;
    const sentToUsers: string[] = [];

    // ── 1. Subscriptions cash_pending avec lesson_date dans 44h-50h ────────────
    const { data: subs, error: subsErr } = await supabase
      .from('subscriptions')
      .select('id, user_id, type, lesson_date, price_chf, travel_extra_chf, reminder_sent_at')
      .eq('payment_mode', 'cash')
      .eq('status', 'pending_payment')
      .not('lesson_date', 'is', null)
      .gte('lesson_date', minTs.toISOString())
      .lte('lesson_date', maxTs.toISOString());

    if (subsErr) console.error('subs query error:', subsErr.message);

    for (const s of (subs ?? [])) {
      if (s.reminder_sent_at) continue;
      const amount = (s.price_chf ?? 60) + (s.travel_extra_chf ?? 0);
      const labelMap: Record<string, string> = {
        lecon_privee: 'Leçon privée',
        cours_theorique: 'Cours théorique',
        cours_special: 'Cours spécial',
      };
      const label = labelMap[s.type] || 'Réservation';

      // Charger profil
      const { data: prof } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', s.user_id)
        .maybeSingle();

      const lessonDateStr = new Date(s.lesson_date).toLocaleString('fr-CH', { dateStyle: 'long', timeStyle: 'short' });

      // Push
      const p = await sendPushTo(
        s.user_id, supabase,
        `Rappel : ${amount} CHF à payer sur place`,
        `Ton ${label.toLowerCase()} est dans 2 jours. Pense au cash ou à TWINT.`,
        'https://app.caniplus.ch/profil',
      );
      pushed += p;

      // Email
      if (prof?.email) {
        const html = `
          <h1 style="font-size:22px;margin:0 0 14px;">Rappel paiement sur place</h1>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">
            Salut${prof.full_name ? ' ' + prof.full_name.split(' ')[0] : ''},
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">
            Ton <strong>${label.toLowerCase()}</strong> est prévu <strong>${lessonDateStr}</strong>, dans environ 48 heures.
          </p>
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:14px 16px;margin:18px 0;">
            <div style="font-size:13px;color:#92400e;font-weight:600;margin-bottom:4px;">À régler sur place</div>
            <div style="font-size:24px;color:#1f1f20;font-weight:700;">${amount} CHF</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px;">Cash ou TWINT à la séance</div>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0 0 12px;">
            Si tu préfères régler en ligne par avance, tu peux le faire depuis ton profil dans l'app.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="https://app.caniplus.ch/profil" style="display:inline-block;background:#2BABE1;color:#FFFFFF;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Voir ma réservation</a>
          </div>
          <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:18px 0 0;">
            Une question ? Réponds à ce mail ou écris à <a href="mailto:info@caniplus.ch" style="color:#1e8db8;">info@caniplus.ch</a>.
          </p>
        `;
        const ok = await sendEmailTo(prof.email, prof.full_name, `Rappel CaniPlus : ${amount} CHF à payer à la séance`, html);
        if (ok) emailed++;
      }

      // Marquer reminder_sent_at
      await supabase
        .from('subscriptions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', s.id);

      reminded++;
      sentToUsers.push(s.user_id);
    }

    // ── 2. Private_course_requests cash_pending dans 44h-50h ───────────────────
    // chosen_slot est jsonb { date, start, end }
    const { data: reqs, error: reqsErr } = await supabase
      .from('private_course_requests')
      .select('id, user_id, price_chf, travel_extra_chf, chosen_slot, reminder_sent_at')
      .eq('payment_mode', 'cash')
      .eq('payment_status', 'cash_pending')
      .not('chosen_slot', 'is', null);

    if (reqsErr) console.error('reqs query error:', reqsErr.message);

    for (const r of (reqs ?? [])) {
      if (r.reminder_sent_at) continue;
      if (!r.chosen_slot?.date || !r.chosen_slot?.start) continue;
      const slotTime = new Date(`${r.chosen_slot.date}T${r.chosen_slot.start}:00`);
      if (slotTime < minTs || slotTime > maxTs) continue;

      const amount = (r.price_chf ?? 60) + (r.travel_extra_chf ?? 0);

      const { data: prof } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', r.user_id)
        .maybeSingle();

      const slotStr = slotTime.toLocaleString('fr-CH', { dateStyle: 'long', timeStyle: 'short' });

      const p = await sendPushTo(
        r.user_id, supabase,
        `Rappel : ${amount} CHF à payer sur place`,
        `Ton cours privé est dans 2 jours. Pense au cash ou à TWINT.`,
        'https://app.caniplus.ch/planning',
      );
      pushed += p;

      if (prof?.email) {
        const html = `
          <h1 style="font-size:22px;margin:0 0 14px;">Rappel paiement sur place</h1>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">
            Salut${prof.full_name ? ' ' + prof.full_name.split(' ')[0] : ''},
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">
            Ton <strong>cours privé</strong> est prévu <strong>${slotStr}</strong>, dans environ 48 heures.
          </p>
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:14px 16px;margin:18px 0;">
            <div style="font-size:13px;color:#92400e;font-weight:600;margin-bottom:4px;">À régler sur place</div>
            <div style="font-size:24px;color:#1f1f20;font-weight:700;">${amount} CHF</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px;">Cash ou TWINT à la séance</div>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#3d3d3d;margin:0 0 12px;">
            Tu peux aussi régler en ligne depuis ton planning dans l'app si tu préfères.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="https://app.caniplus.ch/planning" style="display:inline-block;background:#2BABE1;color:#FFFFFF;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Voir mon cours privé</a>
          </div>
        `;
        const ok = await sendEmailTo(prof.email, prof.full_name, `Rappel CaniPlus : ${amount} CHF à payer à la séance`, html);
        if (ok) emailed++;
      }

      await supabase
        .from('private_course_requests')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', r.id);

      reminded++;
      sentToUsers.push(r.user_id);
    }

    return ok({
      reminded,
      pushed,
      emailed,
      users: sentToUsers,
      window: { min: minTs.toISOString(), max: maxTs.toISOString() },
    });

  } catch (err) {
    console.error('cash-payment-reminder error:', (err as any)?.message ?? err);
    return new Response(JSON.stringify({ error: (err as any)?.message ?? 'Erreur' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
