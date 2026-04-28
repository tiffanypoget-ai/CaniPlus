// supabase/functions/editorial-bundle-actions/index.ts
// -----------------------------------------------------------------------------
// Actions admin Phase 2 dediees a l'agent editorial.
//
// Actions :
//   - trigger_generate_bundle      : appelle generate-editorial-bundle (Phase 2a)
//   - get_editorial_bundle         : recupere un bundle complet
//   - update_editorial_bundle_content : modifie un support apres edition
//   - validate_editorial_bundle    : drafted -> validated (Phase 2b)
//   - publish_editorial_bundle     : validated -> published (Phase 2c)
//       1. INSERT article dans `articles` depuis content_blog
//       2. INSERT resource dans `resources` depuis content_premium
//       3. Envoi push notification aux push_subscriptions
//       4. Update bundle status='published' avec article_id rempli
//   - get_published_bundle_links   : liens (slug article) pour un bundle publie
//
// Auth : admin_password.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, admin_password, payload } = body;

    const expectedPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expectedPassword) return fail('Mot de passe incorrect', 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (action === 'trigger_generate_bundle') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const res = await fetch(`${supaUrl}/functions/v1/generate-editorial-bundle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password, bundle_id }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(`generate-editorial-bundle : ${data?.error ?? res.status}`);
      return ok(data);
    }

    if (action === 'get_editorial_bundle') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const { data, error } = await supabase.from('editorial_bundles').select('*').eq('id', bundle_id).single();
      if (error) throw error;
      return ok({ bundle: data });
    }

    if (action === 'update_editorial_bundle_content') {
      const { bundle_id, ...fields } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const updates: Record<string, unknown> = {};
      for (const k of ['content_blog', 'content_premium', 'content_instagram', 'content_google_business', 'content_notification']) {
        if (fields[k] !== undefined) updates[k] = fields[k];
      }
      if (Object.keys(updates).length === 0) throw new Error('aucun champ content_* fourni');
      const { data, error } = await supabase.from('editorial_bundles').update(updates).eq('id', bundle_id).select().single();
      if (error) throw error;
      return ok({ bundle: data });
    }

    if (action === 'validate_editorial_bundle') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const { data: t, error: e1 } = await supabase.from('editorial_bundles').select('id, status').eq('id', bundle_id).single();
      if (e1) throw e1;
      if (t.status !== 'drafted') throw new Error(`Le bundle doit etre 'drafted' (statut actuel : ${t.status})`);
      const { data, error } = await supabase.from('editorial_bundles').update({ status: 'validated', validated_at: new Date().toISOString() }).eq('id', bundle_id).select().single();
      if (error) throw error;
      return ok({ bundle: data });
    }

    if (action === 'publish_editorial_bundle') {
      const { bundle_id, dry_run } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');

      const { data: bundle, error: e1 } = await supabase.from('editorial_bundles').select('*').eq('id', bundle_id).single();
      if (e1) throw e1;
      if (!bundle) throw new Error('bundle introuvable');
      if (bundle.status !== 'validated' && bundle.status !== 'drafted') {
        throw new Error(`Le bundle doit etre 'validated' ou 'drafted' (statut actuel : ${bundle.status})`);
      }

      const blog = bundle.content_blog ?? {};
      const premium = bundle.content_premium ?? {};
      const notif = bundle.content_notification ?? {};
      const log: Record<string, unknown> = {};
      let articleId: string | null = null;
      let resourceId: string | null = null;

      // 1. Article
      if (blog && blog.title && blog.content_html) {
        const articleRow: Record<string, unknown> = {
          title: blog.title,
          slug: blog.slug || slugify(blog.title),
          excerpt: blog.excerpt ?? null,
          content: blog.content_html,
          cover_image_url: blog.cover_image_url ?? null,
          cover_image_alt: blog.cover_image_alt ?? null,
          meta_title: blog.meta_title ?? blog.title,
          meta_description: blog.meta_description ?? blog.excerpt ?? null,
          meta_keywords: Array.isArray(blog.tags) ? blog.tags.join(', ') : (blog.meta_keywords ?? null),
          category: blog.category ?? null,
          tags: Array.isArray(blog.tags) ? blog.tags : null,
          read_time_min: blog.read_time_min ?? null,
          author_name: blog.author_name ?? 'Tiffany Cotting',
          author_role: blog.author_role ?? 'Educatrice canine',
          published: true,
          published_at: new Date().toISOString(),
        };
        if (!dry_run) {
          let { data: art, error: artErr } = await supabase.from('articles').insert(articleRow).select('id, slug').single();
          if (artErr && String(artErr.message ?? '').includes('duplicate')) {
            articleRow.slug = `${articleRow.slug}-${Date.now().toString(36).slice(-4)}`;
            const r2 = await supabase.from('articles').insert(articleRow).select('id, slug').single();
            if (r2.error) throw r2.error;
            art = r2.data; artErr = null;
            log.article_retry_slug = true;
          }
          if (artErr) throw artErr;
          articleId = art!.id;
          log.article = { id: art!.id, slug: art!.slug };
        } else {
          log.article = { dry_run: true, slug: articleRow.slug };
        }
      } else {
        log.article = { skipped: 'content_blog incomplet' };
      }

      // 2. Resource premium
      if (premium && premium.title && (premium.body_markdown || premium.body)) {
        const resourceRow: Record<string, unknown> = {
          title: premium.title,
          description: premium.description ?? premium.subtitle ?? null,
          type: premium.type ?? 'article',
          category: premium.category ?? blog.category ?? null,
          content: premium.body_markdown ?? premium.body ?? null,
          file_url: premium.file_url ?? null,
        };
        if (!dry_run) {
          const { data: r, error: rErr } = await supabase.from('resources').insert(resourceRow).select('id, title').single();
          if (rErr) throw rErr;
          resourceId = r.id;
          log.resource = { id: r.id, title: r.title };
        } else {
          log.resource = { dry_run: true, title: resourceRow.title };
        }
      } else {
        log.resource = { skipped: 'content_premium incomplet' };
      }

      // 3. Push
      const pushResults = { sent: 0, failed: 0, total_subs: 0 };
      const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
      const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
      const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';

      if (!dry_run && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && notif && notif.title && notif.body) {
        try {
          const { data: subs } = await supabase.from('push_subscriptions').select('subscription, user_id');
          pushResults.total_subs = subs?.length ?? 0;
          for (const s of (subs ?? [])) {
            try {
              await sendWebPush(s.subscription, {
                title: notif.title, body: notif.body, url: notif.url ?? APP_URL,
              }, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
              pushResults.sent++;
            } catch (_e) { pushResults.failed++; }
          }
        } catch (_e) { /* table push_subscriptions absente : ignore */ }
      }
      log.push = pushResults;

      // 4. Update bundle status
      if (!dry_run) {
        const updates: Record<string, unknown> = {
          status: 'published',
          published_at: new Date().toISOString(),
        };
        if (articleId) updates.article_id = articleId;
        const { data: u, error: uErr } = await supabase.from('editorial_bundles').update(updates).eq('id', bundle_id).select().single();
        if (uErr) throw uErr;
        log.bundle = { id: u.id, status: u.status, published_at: u.published_at };
      }

      return ok({ success: true, dry_run: !!dry_run, log, article_id: articleId, resource_id: resourceId });
    }

    if (action === 'list_editorial_bundle_stats') {
      const { data, error } = await supabase
        .from('editorial_bundle_stats')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ok({ stats: data ?? [] });
    }

    if (action === 'get_published_bundle_links') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const { data: bundle, error: e1 } = await supabase.from('editorial_bundles').select('id, status, article_id').eq('id', bundle_id).single();
      if (e1) throw e1;
      let articleSlug: string | null = null;
      if (bundle.article_id) {
        const { data: art } = await supabase.from('articles').select('slug').eq('id', bundle.article_id).single();
        articleSlug = art?.slug ?? null;
      }
      return ok({
        bundle_id: bundle.id,
        status: bundle.status,
        article_id: bundle.article_id,
        article_slug: articleSlug,
        article_url: articleSlug ? `https://caniplus.ch/blog/${articleSlug}` : null,
      });
    }

    throw new Error(`Action inconnue : ${action}`);

  } catch (err: unknown) {
    let message = 'Erreur inconnue';
    if (err instanceof Error) message = err.message;
    else if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      message = String(e.message ?? e.details ?? e.hint ?? JSON.stringify(err));
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '').slice(0, 80);
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string },
  vapidPublicKey: string,
  vapidPrivateKey: string,
) {
  const privKeyBytes = base64urlDecode(vapidPrivateKey);
  const pubKeyBytes = base64urlDecode(vapidPublicKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privKeyBytes.length === 32 ? buildECPrivateKeyDer(privKeyBytes, pubKeyBytes) : privKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const origin = new URL(subscription.endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64urlEncode(new TextEncoder().encode(JSON.stringify({ aud: origin, exp: now + 86400, sub: 'mailto:admin@caniplus.ch' })));
  const toSign = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, new TextEncoder().encode(toSign));
  const jwt = `${toSign}.${base64urlEncode(new Uint8Array(sig))}`;
  const encrypted = await encryptPushPayload(JSON.stringify(payload), subscription.keys.p256dh, subscription.keys.auth);
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

async function encryptPushPayload(plaintext: string, p256dhBase64: string, authBase64: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const p256dh = base64urlDecode(p256dhBase64);
  const authSecret = base64urlDecode(authBase64);
  const receiverPublicKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const senderKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const senderPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeyPair.publicKey));
  const sharedSecretBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverPublicKey }, senderKeyPair.privateKey, 256);
  const sharedSecret = new Uint8Array(sharedSecretBits);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdf(authSecret, sharedSecret, concat(encoder.encode('WebPush: info\0'), p256dh, senderPublicKeyRaw), 32);
  const cek = await hkdf(salt, prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, encoder.encode('Content-Encoding: nonce\0'), 12);
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintextBytes = encoder.encode(plaintext);
  const paddedPlaintext = concat(plaintextBytes, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, paddedPlaintext));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([senderPublicKeyRaw.length]), senderPublicKeyRaw, ciphertext);
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

function buildECPrivateKeyDer(privateKeyBytes: Uint8Array, publicKeyBytes: Uint8Array): ArrayBuffer {
  const ecPrivateKey = concat(
    new Uint8Array([0x30, 0x77]),
    new Uint8Array([0x02, 0x01, 0x01]),
    new Uint8Array([0x04, 0x20]),
    privateKeyBytes,
    new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00]),
    publicKeyBytes,
  );
  return ecPrivateKey.buffer as ArrayBuffer;
}
