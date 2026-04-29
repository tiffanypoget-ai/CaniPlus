// supabase/functions/notify-admin/index.ts
// -----------------------------------------------------------------------------
// Notifie les administrateurs CaniPlus (Tiffany & co) sur 3 canaux :
//   1. In-app : INSERT dans la table public.admin_notifications (cloche admin)
//   2. Push web : envoie un push aux admins abonnes via web-push
//   3. Email : envoie un email transactionnel via Brevo SMTP API a info@caniplus.ch
//
// Auth : Bearer service role (appel par d'autres edge functions ou pg_cron)
//        OU admin_password (test manuel).
//
// Body :
//   {
//     kind: 'payment_received' | 'private_request' | 'new_member' |
//           'premium_canceled' | 'course_canceled' | 'publish_reminder' |
//           'newsletter_signup',
//     title: string,
//     body?: string,
//     metadata?: object,
//     channels?: ('in_app' | 'push' | 'email')[]   // par defaut : tous
//   }
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BREVO_API_URL = 'https://api.brevo.com/v3';
const ADMIN_EMAIL = 'info@caniplus.ch';
const ADMIN_NAME = 'Tiffany Cotting';
const SENDER_EMAIL = 'info@caniplus.ch';
const SENDER_NAME = 'CaniPlus';

const VAPID_PUBLIC = 'BPzDogj1Yt0zU_REZk5GNHZdCPNSfjAVNRgD7B0Azdwt6pxwyM4oLSQmiv0SehIsrhGQkkD3sQTa31tT8tc25dc';

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

async function sendInApp(supabase: any, kind: string, title: string, body: string | null, metadata: any) {
  const { data, error } = await supabase
    .from('admin_notifications')
    .insert({ kind, title, body, metadata: metadata ?? {} })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

async function sendPush(supabase: any, kind: string, title: string, body: string | null, metadata: any) {
  // Recupere les admins (role=admin) et leurs subscriptions push
  const { data: admins, error: aErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  if (aErr || !admins?.length) return { ok: false, error: aErr?.message ?? 'no admins' };

  const adminIds = admins.map((a: any) => a.id);
  const { data: subs, error: sErr } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription')
    .in('user_id', adminIds);
  if (sErr) return { ok: false, error: sErr.message };
  if (!subs?.length) return { ok: true, sent: 0, skipped: 'aucun admin abonne push' };

  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!vapidPrivate) return { ok: false, error: 'VAPID_PRIVATE_KEY manquante' };

  webpush.setVapidDetails('mailto:' + ADMIN_EMAIL, VAPID_PUBLIC, vapidPrivate);

  let sent = 0; let failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({
        title: `Admin · ${title}`,
        body: body ?? '',
        url: '/admin',
        kind,
        metadata,
      }));
      sent++;
    } catch (_) { failed++; }
  }
  return { ok: true, sent, failed };
}

async function sendEmail(kind: string, title: string, body: string | null, metadata: any) {
  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  if (!apiKey) return { ok: false, error: 'BREVO_API_KEY manquante' };

  const subject = `[CaniPlus admin] ${title}`;
  const metaHtml = metadata && Object.keys(metadata).length > 0
    ? `<details style="margin-top:18px;"><summary style="cursor:pointer;color:#6b7280;font-size:13px;">Détails techniques</summary><pre style="background:#f4f6f8;padding:12px;border-radius:8px;font-size:12px;overflow:auto;">${JSON.stringify(metadata, null, 2)}</pre></details>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F5F0;font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8F5F0;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px 32px;background:#1F1F20;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#2BABE1;font-weight:600;">CaniPlus &middot; Admin</p>
        <p style="margin:4px 0 0 0;font-size:13px;color:rgba(255,255,255,0.7);">${kind}</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 12px 0;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:#1F1F20;font-weight:600;">${title}</h2>
        ${body ? `<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${body}</p>` : ''}
        ${metaHtml}
        <div style="margin-top:24px;">
          <a href="https://app.caniplus.ch/admin" style="display:inline-block;background:#2BABE1;color:#FFFFFF;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Ouvrir le panel admin</a>
        </div>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#F8F5F0;font-size:12px;color:#6b7280;text-align:center;">
        Notification automatique CaniPlus &middot; ${new Date().toLocaleString('fr-CH')}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const r = await fetch(`${BREVO_API_URL}/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL, name: ADMIN_NAME }],
      subject,
      htmlContent: html,
    }),
  });
  if (!r.ok) {
    let msg = `Brevo ${r.status}`;
    try { const j = await r.json(); if (j?.message) msg = j.message; } catch {}
    return { ok: false, error: msg };
  }
  const j = await r.json().catch(() => ({}));
  return { ok: true, messageId: j?.messageId };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth : 3 modes
  // 1. Bearer service role (appel par d'autres edge functions ou pg_cron)
  // 2. admin_password dans le body (test manuel)
  // 3. Aucune auth (pour les kinds declenches par les utilisateurs eux-memes :
  //    nouvelle inscription, demande de cours prive, annulation cours)
  //    - le user agit sur ses propres donnees, pas de risque d'usurpation grave
  //    - on filtre par kind pour eviter qu'on puisse spam des publish_reminder etc.
  const authHeader = req.headers.get('Authorization') ?? '';
  const expectedServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
  let authorized = authHeader === `Bearer ${expectedServiceKey}`;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { admin_password, kind, title, body: msgBody, metadata, channels } = body ?? {};
  if (!authorized && admin_password && admin_password === expectedAdmin) authorized = true;

  // Whitelist des kinds que les utilisateurs peuvent declencher sans auth privilegee
  const userEventKinds = ['new_member', 'private_request', 'course_canceled'];
  if (!authorized && userEventKinds.includes(kind)) authorized = true;

  if (!authorized) return fail('Non autorise', 401);

  if (!kind || !title) return fail('kind et title requis');

  const validKinds = [
    'payment_received', 'private_request', 'new_member',
    'premium_canceled', 'course_canceled', 'publish_reminder', 'newsletter_signup',
  ];
  if (!validKinds.includes(kind)) return fail(`kind invalide : ${kind}`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    expectedServiceKey,
  );

  // Par defaut, on envoie sur les 3 canaux
  const enabled = Array.isArray(channels) && channels.length > 0
    ? channels
    : ['in_app', 'push', 'email'];

  const results: Record<string, unknown> = {};

  if (enabled.includes('in_app')) {
    results.in_app = await sendInApp(supabase, kind, title, msgBody ?? null, metadata);
  }
  if (enabled.includes('push')) {
    try {
      results.push = await sendPush(supabase, kind, title, msgBody ?? null, metadata);
    } catch (e) {
      results.push = { ok: false, error: (e as Error).message };
    }
  }
  if (enabled.includes('email')) {
    try {
      results.email = await sendEmail(kind, title, msgBody ?? null, metadata);
    } catch (e) {
      results.email = { ok: false, error: (e as Error).message };
    }
  }

  return ok({ success: true, kind, title, channels: enabled, results });
});
