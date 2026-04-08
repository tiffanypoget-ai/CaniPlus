// supabase/functions/vaccine-reminder/index.ts
// Envoie emails + push notifications 30 jours avant les rappels de vaccins
// À appeler quotidiennement via pg_cron ou un scheduler externe

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://cani-plus.vercel.app';

  // ── Fenêtre de rappel : dans 28 à 33 jours (couvre le "1 mois avant") ──
  const now = new Date();
  const minDate = new Date(now); minDate.setDate(minDate.getDate() + 28);
  const maxDate = new Date(now); maxDate.setDate(maxDate.getDate() + 33);
  const minStr = minDate.toISOString().slice(0, 10);
  const maxStr = maxDate.toISOString().slice(0, 10);

  // ── Récupérer tous les chiens avec vaccins dans cette fenêtre ──────────
  const { data: dogs, error: dogsErr } = await supabase
    .from('dogs')
    .select('id, name, owner_id, vaccines, profiles!inner(full_name, email)')
    .not('vaccines', 'eq', '[]')
    .not('vaccines', 'is', null);

  if (dogsErr) {
    return new Response(JSON.stringify({ error: dogsErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ dog: string; vaccine: string; email: string; sent: boolean; method: string[] }> = [];

  for (const dog of dogs ?? []) {
    const profile = Array.isArray(dog.profiles) ? dog.profiles[0] : dog.profiles;
    const vaccines: Array<{ name: string; last_date?: string; next_due_date?: string }> = dog.vaccines ?? [];

    for (const vaccine of vaccines) {
      if (!vaccine.next_due_date) continue;
      if (vaccine.next_due_date < minStr || vaccine.next_due_date > maxStr) continue;

      // ── Vérifier si rappel déjà envoyé (éviter doublons) ───────────────
      const reminderKey = `${dog.id}_${vaccine.name}_${vaccine.next_due_date}`;
      const { data: existing } = await supabase
        .from('vaccine_reminders_sent')
        .select('id')
        .eq('reminder_key', reminderKey)
        .maybeSingle();
      if (existing) continue;

      const daysLeft = Math.round((new Date(vaccine.next_due_date).getTime() - now.getTime()) / 86400000);
      const dueDateFr = new Date(vaccine.next_due_date).toLocaleDateString('fr-CH', {
        day: 'numeric', month: 'long', year: 'numeric',
      });

      const sentMethods: string[] = [];

      // ── Email via Resend ────────────────────────────────────────────────
      if (RESEND_API_KEY && profile?.email) {
        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #1F1F20, #2a3a4a); padding: 28px 24px; text-align: center;">
      <div style="font-family: 'Georgia', serif; font-size: 32px; color: white; margin-bottom: 4px;">CaniPlus</div>
      <div style="color: rgba(255,255,255,0.6); font-size: 13px;">Club canin de Ballaigues</div>
    </div>
    <div style="padding: 28px 24px;">
      <div style="font-size: 36px; text-align: center; margin-bottom: 16px;">💉</div>
      <h2 style="font-size: 18px; color: #1F1F20; margin: 0 0 8px; text-align: center;">Rappel de vaccin pour ${dog.name}</h2>
      <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 0 0 24px;">
        Le vaccin <strong>${vaccine.name}</strong> arrive à échéance dans <strong>${daysLeft} jours</strong>.
      </p>
      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 13px; color: #92400e; font-weight: 600;">Date du prochain rappel</div>
        <div style="font-size: 20px; font-weight: 800; color: #d97706; margin-top: 4px;">${dueDateFr}</div>
      </div>
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 20px;">
        N'oublie pas de prendre rendez-vous avec ton vétérinaire avant cette date pour que ${dog.name} reste bien protégé(e) !
      </p>
      <a href="${APP_URL}" style="display: block; background: linear-gradient(135deg, #2BABE1, #1a8bbf); color: white; text-decoration: none; border-radius: 12px; padding: 14px; text-align: center; font-weight: 800; font-size: 14px;">
        Voir le profil de ${dog.name} →
      </a>
    </div>
    <div style="padding: 16px 24px; border-top: 1px solid #f0f0f0; text-align: center;">
      <p style="color: #9ca3af; font-size: 11px; margin: 0;">
        CaniPlus · Club canin de Ballaigues<br>
        Tu reçois cet email car tu as enregistré un rappel de vaccin pour ${dog.name}.
      </p>
    </div>
  </div>
</body>
</html>`;

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'CaniPlus <rappels@cani-plus.vercel.app>',
            to: profile.email,
            subject: `💉 Rappel vaccin ${vaccine.name} pour ${dog.name} — dans ${daysLeft} jours`,
            html: emailHtml,
          }),
        });
        if (emailRes.ok) sentMethods.push('email');
      }

      // ── Push notification via Web Push ──────────────────────────────────
      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        const { data: pushSubs } = await supabase
          .from('push_subscriptions')
          .select('subscription')
          .eq('user_id', dog.owner_id);

        if (pushSubs && pushSubs.length > 0) {
          for (const sub of pushSubs) {
            try {
              await sendWebPush(sub.subscription, {
                title: `💉 Rappel vaccin — ${dog.name}`,
                body: `Le vaccin ${vaccine.name} arrive à échéance dans ${daysLeft} jours (${dueDateFr}).`,
                url: APP_URL,
              }, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
              sentMethods.push('push');
            } catch (_e) { /* ignore push errors */ }
          }
        }
      }

      // ── Marquer le rappel comme envoyé ──────────────────────────────────
      if (sentMethods.length > 0) {
        await supabase.from('vaccine_reminders_sent').insert({
          reminder_key: reminderKey,
          dog_id: dog.id,
          vaccine_name: vaccine.name,
          next_due_date: vaccine.next_due_date,
          sent_at: new Date().toISOString(),
        });
      }

      results.push({
        dog: dog.name,
        vaccine: vaccine.name,
        email: profile?.email ?? '',
        sent: sentMethods.length > 0,
        method: sentMethods,
      });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

// ── Web Push helper (VAPID) ────────────────────────────────────────────────
async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string },
  vapidPublicKey: string,
  vapidPrivateKey: string,
) {
  // Import VAPID private key
  const privKeyBytes = base64urlDecode(vapidPrivateKey);
  const pubKeyBytes = base64urlDecode(vapidPublicKey);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privKeyBytes.length === 32
      ? buildECPrivateKeyDer(privKeyBytes, pubKeyBytes)
      : privKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  // Build VAPID JWT
  const origin = new URL(subscription.endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64urlEncode(new TextEncoder().encode(JSON.stringify({ aud: origin, exp: now + 86400, sub: 'mailto:admin@caniplus.ch' })));
  const toSign = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(toSign),
  );
  const jwt = `${toSign}.${base64urlEncode(new Uint8Array(sig))}`;

  // Encrypt the payload
  const encrypted = await encryptPushPayload(
    JSON.stringify(payload),
    subscription.keys.p256dh,
    subscription.keys.auth,
  );

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: encrypted,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    throw new Error(`Push failed ${res.status}: ${text}`);
  }
}

// ── AES-128-GCM payload encryption (RFC 8291) ─────────────────────────────
async function encryptPushPayload(plaintext: string, p256dhBase64: string, authBase64: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const p256dh = base64urlDecode(p256dhBase64);
  const authSecret = base64urlDecode(authBase64);

  // Receiver public key
  const receiverPublicKey = await crypto.subtle.importKey(
    'raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, true, [],
  );

  // Generate sender key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeyPair.publicKey),
  );

  // ECDH shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverPublicKey }, senderKeyPair.privateKey, 256,
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // HKDF to derive keys
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prk = await hkdf(authSecret, sharedSecret,
    concat(encoder.encode('WebPush: info\0'), p256dh, senderPublicKeyRaw), 32);
  const cek = await hkdf(salt, prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, encoder.encode('Content-Encoding: nonce\0'), 12);

  // Encrypt
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintextBytes = encoder.encode(plaintext);
  // Pad with 0x02 delimiter then zeros (minimal padding)
  const paddedPlaintext = concat(plaintextBytes, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, cekKey, paddedPlaintext,
  ));

  // Build RFC 8291 content: salt(16) + rs(4) + keyid_len(1) + keyid + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const result = concat(salt, rs, new Uint8Array([senderPublicKeyRaw.length]), senderPublicKeyRaw, ciphertext);
  return result;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', key, salt.length ? salt : new Uint8Array(32)));
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, concat(info, new Uint8Array([1]))));
  return t.slice(0, length);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Build a DER-encoded ECPrivateKey that WebCrypto can import as 'raw' PKCS8
function buildECPrivateKeyDer(privateKeyBytes: Uint8Array, publicKeyBytes: Uint8Array): ArrayBuffer {
  // PKCS#8 wrapper for EC P-256 private key
  // OID for EC public key: 1.2.840.10045.2.1
  // OID for P-256: 1.2.840.10045.3.1.7
  const ecPrivateKey = concat(
    new Uint8Array([0x30, 0x77]), // SEQUENCE
    new Uint8Array([0x02, 0x01, 0x01]), // version = 1
    new Uint8Array([0x04, 0x20]), // OCTET STRING (32 bytes)
    privateKeyBytes,
    new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00]), // explicit [1] BIT STRING
    publicKeyBytes,
  );
  return ecPrivateKey.buffer;
}
