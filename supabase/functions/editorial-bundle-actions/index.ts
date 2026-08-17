// supabase/functions/editorial-bundle-actions/index.ts
// Phase 2 agent editorial + publication multi-canal.
// (v33-34 : Instagram conditionnel + alertes admin echec Meta.
//  v35 : publication Google Business Profile via publish-to-google-business,
//  saut propre si secrets GBP non configures.
//  v36 (17.08.2026) : le post Facebook utilise content_facebook.message s'il
//  existe. Facebook recevait jusqu'ici le texte Google Business tel quel, ecrit
//  pour le referencement local : trop long et mal adapte au fil Facebook. La
//  chaine de repli reste identique si le champ est absent.
//  v43 (17.08.2026) : alerte admin quand le push GitHub echoue. Seules les
//  publications sociales en levaient une ; un 503 de GitHub a laisse l'article
//  en 404 pendant 4 h 30 en silence, avec trois reseaux pointant dessus.)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

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
      for (const k of ['content_blog', 'content_premium', 'content_instagram', 'content_google_business', 'content_notification', 'content_facebook']) {
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
      if (!['validated', 'drafted', 'scheduled'].includes(bundle.status)) {
        throw new Error(`Le bundle doit etre 'validated', 'drafted' ou 'scheduled' (statut actuel : ${bundle.status})`);
      }

      const blog = bundle.content_blog ?? {};
      const premium = bundle.content_premium ?? {};
      const notif = bundle.content_notification ?? {};
      const log: Record<string, unknown> = {};
      let articleId: string | null = null;
      let resourceId: string | null = null;
      let articleSlug: string | null = null;

      if (bundle.article_id) {
        articleId = bundle.article_id;
        const { data: existing } = await supabase.from('articles').select('id, slug').eq('id', bundle.article_id).single();
        articleSlug = existing?.slug ?? null;
        log.article = existing ? { id: existing.id, slug: existing.slug, reused: true } : { id: bundle.article_id, reused: true, missing: true };
      } else if (blog && blog.title && blog.content_html) {
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
          articleSlug = art!.slug;
          log.article = { id: art!.id, slug: art!.slug };
        } else {
          log.article = { dry_run: true, slug: articleRow.slug };
        }
      } else {
        log.article = { skipped: 'content_blog incomplet' };
      }

      if (bundle.resource_id) {
        resourceId = bundle.resource_id;
        const { data: existing } = await supabase.from('resources').select('id, title').eq('id', bundle.resource_id).single();
        log.resource = existing ? { id: existing.id, title: existing.title, reused: true } : { id: bundle.resource_id, reused: true, missing: true };
      } else if (premium && premium.title && (premium.body_markdown || premium.body)) {
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

      const sideEffects: Record<string, unknown> = {};
      if (!dry_run && articleId) {
        const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';

        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id')
            .neq('user_type', 'external');
          const rows = (profs ?? []).map((p: { id: string }) => ({
            user_id: p.id,
            type: 'nouvelle_actualite',
            title: blog.title ?? notif.title ?? 'Nouvel article',
            body: blog.excerpt ?? notif.body ?? null,
            metadata: { article_id: articleId, slug: blog.slug },
          }));
          if (rows.length > 0) {
            const { error: nErr } = await supabase.from('notifications').insert(rows);
            if (nErr) throw nErr;
          }
          sideEffects.notifications = { inserted: rows.length };
        } catch (e) {
          sideEffects.notifications = { error: (e as Error).message };
        }

        sideEffects.newsletter = { skipped: 'remplace par weekly-newsletter (envoi hebdo mercredi)' };

        try {
          const r = await fetch(`${supaUrl}/functions/v1/publish-article-to-github`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'publish', admin_password: expectedAdmin, payload: { article_id: articleId } }),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.success) {
            sideEffects.html_published = { url: j.url, pushed_at: j.pushed_at };
          } else {
            sideEffects.html_published = { error: j?.error ?? `status ${r.status}` };
            await notifySitePublishFailure(supaUrl, serviceKey, bundle_id, articleSlug ?? blog.slug ?? null, sideEffects.html_published);
          }
        } catch (e) {
          sideEffects.html_published = { error: (e as Error).message };
          await notifySitePublishFailure(supaUrl, serviceKey, bundle_id, articleSlug ?? blog.slug ?? null, { error: (e as Error).message });
        }

        // Publication automatique sur la Page Facebook (post-lien : texte + lien
        // vers l'article ; Facebook genere la vignette depuis les balises OG).
        try {
          const slug = articleSlug ?? (blog.slug ?? null);
          const gbp = bundle.content_google_business ?? {};
          const insta = bundle.content_instagram ?? {};
          // content_facebook.message : texte ecrit pour Facebook (accroche courte
          // en premiere ligne, paragraphes aeres). A defaut, on retombe sur le
          // texte Google Business comme avant.
          const fb = bundle.content_facebook ?? {};
          const fbMessage = fb.message || gbp.body || insta.caption || blog.excerpt || blog.title || '';
          const fbLink = slug ? `https://caniplus.ch/blog/${slug}` : null;
          if (fbMessage && fbLink) {
            const fr = await fetch(`${supaUrl}/functions/v1/publish-to-facebook`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ bundle_id, message: fbMessage, link: fbLink }),
            });
            const fj = await fr.json().catch(() => ({}));
            if (fr.ok && !fj?.error) {
              sideEffects.facebook = { post_id: fj.facebook_post_id, permalink: fj.permalink_url };
            } else {
              sideEffects.facebook = { error: fj?.error ?? `status ${fr.status}`, graph_error: fj?.graph_error };
              await notifyPublishFailure(supaUrl, serviceKey, 'Facebook', bundle_id, sideEffects.facebook);
            }
          } else {
            sideEffects.facebook = { skipped: 'message ou lien manquant' };
          }
        } catch (e) {
          sideEffects.facebook = { error: (e as Error).message };
          await notifyPublishFailure(supaUrl, serviceKey, 'Facebook', bundle_id, { error: (e as Error).message });
        }

        // Publication automatique Instagram, UNIQUEMENT si des images sont
        // disponibles (l'API Meta exige des URLs d'images publiques ; la caption
        // seule est impossible). Sources d'images acceptees, par priorite :
        //   1. content_instagram.image_urls (tableau, futur pipeline de slides)
        //   2. bundle.instagram_image_url (image unique)
        //   3. content_blog.cover_image_url (image de couverture d'article)
        try {
          const insta = bundle.content_instagram ?? {};
          let igImages: string[] = [];
          if (Array.isArray(insta.image_urls) && insta.image_urls.length > 0) {
            igImages = insta.image_urls.filter((u: unknown) => typeof u === 'string' && u.startsWith('http'));
          } else if (typeof bundle.instagram_image_url === 'string' && bundle.instagram_image_url.startsWith('http')) {
            igImages = [bundle.instagram_image_url];
          } else if (typeof blog.cover_image_url === 'string' && blog.cover_image_url.startsWith('http')) {
            igImages = [blog.cover_image_url];
          }

          if (igImages.length > 0 && insta.caption) {
            const hashtags = Array.isArray(insta.hashtags) && insta.hashtags.length > 0
              ? '\n\n' + insta.hashtags.join(' ')
              : '';
            const ir = await fetch(`${supaUrl}/functions/v1/publish-to-instagram`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bundle_id,
                image_urls: igImages.slice(0, 10),
                caption: `${insta.caption}${hashtags}`,
              }),
            });
            const ij = await ir.json().catch(() => ({}));
            if (ir.ok && !ij?.error) {
              sideEffects.instagram = { post_id: ij.instagram_post_id, permalink: ij.permalink, images: igImages.length };
            } else {
              sideEffects.instagram = { error: ij?.error ?? `status ${ir.status}`, graph_error: ij?.graph_error };
              await notifyPublishFailure(supaUrl, serviceKey, 'Instagram', bundle_id, sideEffects.instagram);
            }
          } else {
            sideEffects.instagram = { skipped: insta.caption ? 'aucune image disponible (pipeline images non branche)' : 'content_instagram incomplet' };
          }
        } catch (e) {
          sideEffects.instagram = { error: (e as Error).message };
          await notifyPublishFailure(supaUrl, serviceKey, 'Instagram', bundle_id, { error: (e as Error).message });
        }

        // Publication automatique Google Business Profile (LocalPost).
        // Saute proprement (sans alerte) si les secrets GBP ne sont pas encore
        // configures (not_configured) ou si contenu/image manquent.
        try {
          const gbp = bundle.content_google_business ?? {};
          const gbpSlug = articleSlug ?? (blog.slug ?? null);
          const gbpImage = (typeof blog.cover_image_url === 'string' && blog.cover_image_url.startsWith('http'))
            ? blog.cover_image_url
            : ((typeof bundle.instagram_image_url === 'string' && bundle.instagram_image_url.startsWith('http'))
              ? bundle.instagram_image_url
              : null);
          if (gbp.body && gbpImage && gbpSlug) {
            const gr = await fetch(`${supaUrl}/functions/v1/publish-to-google-business`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bundle_id,
                image_url: gbpImage,
                summary: gbp.body,
                cta_url: `https://caniplus.ch/blog/${gbpSlug}`,
                cta_type: 'LEARN_MORE',
              }),
            });
            const gj = await gr.json().catch(() => ({}));
            if (gr.ok && !gj?.error) {
              sideEffects.google_business = { post_id: gj.gbp_post_id, search_url: gj.search_url };
            } else if (gj?.not_configured) {
              sideEffects.google_business = { skipped: 'secrets GBP non configures' };
            } else {
              sideEffects.google_business = { error: gj?.error ?? `status ${gr.status}`, gbp_error: gj?.gbp_error };
              await notifyPublishFailure(supaUrl, serviceKey, 'Google Business', bundle_id, sideEffects.google_business);
            }
          } else {
            sideEffects.google_business = { skipped: 'contenu GBP, image ou slug manquant' };
          }
        } catch (e) {
          sideEffects.google_business = { error: (e as Error).message };
          await notifyPublishFailure(supaUrl, serviceKey, 'Google Business', bundle_id, { error: (e as Error).message });
        }
      }
      log.side_effects = sideEffects;

      const pushResults: { sent: number; failed: number; total_subs: number; errors_sample: string[]; cleaned?: number } = {
        sent: 0, failed: 0, total_subs: 0, errors_sample: [],
      };
      const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
      const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
      const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';

      if (!dry_run && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && notif && notif.title && notif.body) {
        try {
          const { data: subs } = await supabase.from('push_subscriptions').select('subscription, user_id');
          pushResults.total_subs = subs?.length ?? 0;
          for (const s of (subs ?? [])) {
            const r = await sendWebPush(s.subscription, {
              title: notif.title, body: notif.body, url: notif.url ?? APP_URL,
            }, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
            if (r.ok) {
              pushResults.sent++;
            } else {
              pushResults.failed++;
              try {
                const host = new URL(s.subscription?.endpoint ?? '').host;
                const code = r.statusCode ?? '?';
                console.warn(`[push] FAIL ${host} status=${code}: ${r.message}`);
                if (pushResults.errors_sample.length < 3) {
                  pushResults.errors_sample.push(`${host} (${code}): ${r.message.substring(0, 200)}`);
                }
                if (r.statusCode === 404 || r.statusCode === 410) {
                  await supabase.from('push_subscriptions')
                    .delete()
                    .eq('user_id', s.user_id)
                    .eq('subscription', s.subscription);
                  pushResults.cleaned = (pushResults.cleaned ?? 0) + 1;
                }
              } catch (_) {}
            }
          }
        } catch (e) { console.warn('[push] subs read failed:', (e as Error).message); }
      }
      log.push = pushResults;

      if (!dry_run) {
        const updates: Record<string, unknown> = {
          status: 'published',
          published_at: new Date().toISOString(),
        };
        if (articleId)  updates.article_id  = articleId;
        if (resourceId) updates.resource_id = resourceId;
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

    if (action === 'send_push_batch') {
      const { user_ids, title, body, url } = payload ?? {};
      if (!Array.isArray(user_ids) || user_ids.length === 0) throw new Error('user_ids vide');
      if (!title || !body) throw new Error('title et body requis');

      const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
      const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
      const APP_URL           = Deno.env.get('APP_URL') ?? 'https://app.caniplus.ch';
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return ok({ sent: 0, failed: 0, skipped: 'VAPID keys manquantes dans les Secrets' });
      }

      const { data: subs, error: sErr } = await supabase
        .from('push_subscriptions')
        .select('subscription, user_id')
        .in('user_id', user_ids);
      if (sErr) throw sErr;

      const target = url ?? APP_URL;
      let sent = 0, failed = 0, cleaned = 0;
      const errors_sample: string[] = [];
      for (const s of (subs ?? [])) {
        const r = await sendWebPush(s.subscription, { title, body, url: target }, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        if (r.ok) {
          sent++;
        } else {
          failed++;
          try {
            const host = new URL(s.subscription?.endpoint ?? '').host;
            const code = r.statusCode ?? '?';
            console.warn(`[push_batch] FAIL ${host} status=${code}: ${r.message}`);
            if (errors_sample.length < 3) {
              errors_sample.push(`${host} (${code}): ${r.message.substring(0, 200)}`);
            }
            if (r.statusCode === 404 || r.statusCode === 410) {
              await supabase.from('push_subscriptions')
                .delete()
                .eq('user_id', s.user_id)
                .eq('subscription', s.subscription);
              cleaned++;
            }
          } catch (_) {}
        }
      }
      return ok({ sent, failed, cleaned, total_subs: subs?.length ?? 0, target, errors_sample });
    }

    if (action === 'debug_test_push_user') {
      const { user_id, title: tTitle, body: tBody } = payload ?? {};
      if (!user_id) throw new Error('user_id requis');
      const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
      const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return ok({ error: 'VAPID keys manquantes' });

      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('subscription, user_id')
        .eq('user_id', user_id);

      const results: any[] = [];
      for (const s of (subs ?? [])) {
        const r = await sendWebPush(s.subscription, {
          title: tTitle ?? 'Test CaniPlus',
          body: tBody ?? 'Si tu vois ce message, ton push fonctionne !',
          url: 'https://app.caniplus.ch',
        }, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
        const host = (() => { try { return new URL(s.subscription?.endpoint ?? '').host; } catch { return '?'; } })();
        if (r.ok) {
          results.push({ host, ok: true });
        } else {
          results.push({ host, ok: false, statusCode: r.statusCode, message: r.message.substring(0, 300) });
          if (r.statusCode === 404 || r.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('user_id', s.user_id).eq('subscription', s.subscription);
            results[results.length - 1].cleaned = true;
          }
        }
      }
      return ok({ user_id, total_subs: subs?.length ?? 0, results });
    }

    if (action === 'schedule_editorial_bundle') {
      const { bundle_id, scheduled_for } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      if (!scheduled_for) throw new Error('scheduled_for manquant (ISO 8601 attendu)');

      const when = new Date(scheduled_for);
      if (isNaN(when.getTime())) throw new Error('scheduled_for invalide (parse impossible)');
      const minIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      if (when.toISOString() < minIso) {
        throw new Error('scheduled_for doit etre dans le futur (au moins +5 minutes)');
      }

      const { data: cur, error: ce } = await supabase
        .from('editorial_bundles')
        .select('id, status, content_blog, content_premium')
        .eq('id', bundle_id)
        .single();
      if (ce) throw ce;
      if (!cur) throw new Error('bundle introuvable');
      if (!['drafted', 'validated', 'scheduled'].includes(cur.status)) {
        throw new Error(`Le bundle doit etre drafted, validated ou scheduled (statut actuel : ${cur.status})`);
      }
      if (!cur.content_blog || !cur.content_premium) {
        throw new Error('Le bundle n\'a pas encore de contenu genere (drafted minimum requis)');
      }

      const { data: u, error: ue } = await supabase
        .from('editorial_bundles')
        .update({ status: 'scheduled', scheduled_for: when.toISOString() })
        .eq('id', bundle_id)
        .select()
        .single();
      if (ue) throw ue;
      return ok({ bundle: u });
    }

    if (action === 'unschedule_editorial_bundle') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');

      const { data: cur, error: ce } = await supabase
        .from('editorial_bundles')
        .select('id, status, validated_at')
        .eq('id', bundle_id)
        .single();
      if (ce) throw ce;
      if (!cur) throw new Error('bundle introuvable');
      if (cur.status !== 'scheduled') {
        throw new Error(`Le bundle doit etre scheduled (statut actuel : ${cur.status})`);
      }
      const targetStatus = cur.validated_at ? 'validated' : 'drafted';

      const { data: u, error: ue } = await supabase
        .from('editorial_bundles')
        .update({ status: targetStatus, scheduled_for: null })
        .eq('id', bundle_id)
        .select()
        .single();
      if (ue) throw ue;
      return ok({ bundle: u, status: targetStatus });
    }

    if (action === 'count_bundle_sources') {
      const { data, error } = await supabase
        .from('editorial_bundles')
        .select('id, scientific_sources')
        .not('status', 'in', '("proposed","rejected","archived")');
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const b of (data ?? [])) {
        counts[b.id] = Array.isArray(b.scientific_sources) ? b.scientific_sources.length : 0;
      }
      return ok({ counts });
    }

    if (action === 'get_bundle_sources') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const { data, error } = await supabase
        .from('editorial_bundles')
        .select('id, scientific_sources')
        .eq('id', bundle_id)
        .single();
      if (error) throw error;
      return ok({
        bundle_id: data.id,
        sources: Array.isArray(data.scientific_sources) ? data.scientific_sources : [],
      });
    }

    if (action === 'list_scheduled_bundles') {
      const { data, error } = await supabase
        .from('editorial_scheduled_upcoming')
        .select('*')
        .order('scheduled_for', { ascending: true })
        .limit(100);
      if (error) throw error;
      return ok({ scheduled: data ?? [] });
    }

    if (action === 'recent_category_stats') {
      const limit = Math.max(1, Math.min(20, Number(payload?.limit ?? 8)));
      const { data, error } = await supabase
        .from('editorial_bundles')
        .select('id, theme, category, published_at')
        .eq('status', 'published')
        .not('category', 'is', null)
        .order('published_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const counts: Record<string, number> = {
        education: 0,
        comportement: 0,
        sante: 0,
        sociabilisation: 0,
        'bien-etre': 0,
      };
      for (const b of data ?? []) {
        const c = b.category as string;
        if (c in counts) counts[c]++;
        else counts[c] = 1;
      }
      return ok({
        counts,
        recent: data ?? [],
        window_size: limit,
      });
    }

    if (action === 'reroll_proposal') {
      const { bundle_id, forced_category } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');

      const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const res = await fetch(`${supaUrl}/functions/v1/propose-editorial-themes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_password,
          reroll_bundle_id: bundle_id,
          forced_category: forced_category ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error('propose-editorial-themes (reroll) : ' + (data?.error ?? res.status));
      }
      return ok(data);
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

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '').slice(0, 80);
}

// Alerte admin (in-app + push + email via notify-admin) quand une publication
// automatique Facebook, Instagram ou Google Business echoue. Non bloquant :
// la publication du bundle continue meme si la notification echoue.
async function notifyPublishFailure(
  supaUrl: string,
  serviceKey: string,
  network: string,
  bundleId: string,
  errorInfo: unknown,
) {
  try {
    await fetch(`${supaUrl}/functions/v1/notify-admin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'publish_reminder',
        title: `Echec publication ${network}`,
        body: `La publication automatique sur ${network} a echoue pour le bundle ${bundleId}. Le reste du bundle (article, ressource, notifications) est publie normalement. A publier manuellement sur ${network}, et verifier le token si l'erreur mentionne une session expiree.`,
        metadata: { bundle_id: bundleId, network, error: errorInfo },
      }),
    });
  } catch (_) {
    // non bloquant
  }
}

// Alerte admin quand la mise en ligne sur caniplus.ch echoue.
// Cas different de Facebook / Instagram / Google Business : ici c'est l'article
// lui-meme qui manque, et les trois reseaux pointent deja dessus. Le 17.08.2026,
// un 503 de GitHub a laisse la page en 404 pendant 4 h 30 sans qu'aucune alerte
// ne soit levee, parce que seules les publications sociales en declenchaient.
// Le message dit quoi faire tout de suite : rejouer le bouton de l'editeur.
async function notifySitePublishFailure(
  supaUrl: string,
  serviceKey: string,
  bundleId: string,
  slug: string | null,
  errorInfo: unknown,
) {
  const cible = slug ? `https://caniplus.ch/blog/${slug}` : "la page de l'article";
  try {
    await fetch(`${supaUrl}/functions/v1/notify-admin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'publish_reminder',
        title: 'Article NON mis en ligne sur caniplus.ch',
        body: `Le push GitHub a echoue : ${cible} renvoie une 404, alors que Facebook, Instagram et Google Business pointent deja dessus. A rattraper en priorite, depuis l'editeur du bundle, bouton Republier sur le site. Si l'erreur mentionne un 401 ou un 403, le GITHUB_TOKEN est a regenerer.`,
        metadata: { bundle_id: bundleId, slug, step: 'github', error: errorInfo },
      }),
    });
  } catch (_) {
    // non bloquant
  }
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string },
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<{ ok: true } | { ok: false; statusCode?: number; message: string }> {
  webpush.setVapidDetails('mailto:admin@caniplus.ch', vapidPublicKey, vapidPrivateKey);
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60,
      urgency: 'high',
      headers: { 'Urgency': 'high' },
    });
    return { ok: true };
  } catch (e: any) {
    return {
      ok: false,
      statusCode: e?.statusCode ?? e?.status ?? undefined,
      message: e?.body ?? e?.message ?? String(e),
    };
  }
}
