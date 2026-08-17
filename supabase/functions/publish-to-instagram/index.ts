// publish-to-instagram
// Publie un carrousel (jusqu'à 10 images) sur Instagram Business via Meta Graph API.
//
// Workflow Meta pour carrousel (Graph API v21) :
//   1. POST /{IG-USER-ID}/media pour chaque image avec is_carousel_item=true
//   2. POST /{IG-USER-ID}/media avec media_type=CAROUSEL + children=[creation_ids]
//   3. POST /{IG-USER-ID}/media_publish avec creation_id du container
//
// Input  : { bundle_id?: string, image_urls: string[] (1 à 10), caption: string }
// Output : { instagram_post_id: string, permalink: string }
//
// Secrets requis :
//  - META_PAGE_ACCESS_TOKEN (long-lived, scope instagram_business_content_publish)
//  - META_INSTAGRAM_ACCOUNT_ID (ID numérique du compte Insta Business)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const CAROUSEL_MAX_ITEMS = 10;
const INSTA_CAPTION_MAX = 2200;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const startedAt = Date.now();

  try {
    const { bundle_id, image_urls, caption } = await req.json();

    if (!Array.isArray(image_urls) || image_urls.length === 0) {
      return jsonResponse({ error: 'image_urls doit être un tableau non vide' }, 400);
    }
    if (image_urls.length > CAROUSEL_MAX_ITEMS) {
      return jsonResponse({
        error: `Instagram accepte maximum ${CAROUSEL_MAX_ITEMS} images par carrousel`,
      }, 400);
    }
    if (typeof caption !== 'string' || caption.length === 0) {
      return jsonResponse({ error: 'caption requise' }, 400);
    }

    const accessToken = Deno.env.get('META_PAGE_ACCESS_TOKEN');
    const igUserId = Deno.env.get('META_INSTAGRAM_ACCOUNT_ID');
    if (!accessToken || !igUserId) {
      return jsonResponse({
        error: 'Secrets manquants : META_PAGE_ACCESS_TOKEN et/ou META_INSTAGRAM_ACCOUNT_ID',
      }, 500);
    }

    const finalCaption = caption.length > INSTA_CAPTION_MAX
      ? caption.slice(0, INSTA_CAPTION_MAX - 1) + '…'
      : caption;

    // Cas particulier : 1 seule image → pas de carrousel, post simple.
    if (image_urls.length === 1) {
      const result = await publishSinglePhoto({
        igUserId,
        accessToken,
        imageUrl: image_urls[0],
        caption: finalCaption,
      });
      if (!result.ok) return jsonResponse({ error: result.error }, result.status || 500);
      await updateBundle(bundle_id, image_urls[0], result.postId!);
      return jsonResponse({
        instagram_post_id: result.postId,
        permalink: result.permalink,
        duration_ms: Date.now() - startedAt,
      });
    }

    // Étape 1 : créer un container par image (in parallel pour aller vite).
    const childPromises = image_urls.map((url) =>
      createCarouselItem({ igUserId, accessToken, imageUrl: url }),
    );
    const childResults = await Promise.all(childPromises);
    const childErrors = childResults.filter((r) => !r.ok);
    if (childErrors.length > 0) {
      return jsonResponse({
        error: 'Echec création containers carrousel',
        details: childErrors.map((e) => e.error),
      }, 500);
    }
    const childIds = childResults.map((r) => r.id!);

    // Étape 2 : container CAROUSEL parent.
    const containerParams = new URLSearchParams({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: finalCaption,
      access_token: accessToken,
    });
    const containerRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: containerParams.toString(),
    });
    const containerData = await containerRes.json();
    if (!containerRes.ok || !containerData.id) {
      return jsonResponse({
        error: 'Echec création container CAROUSEL',
        graph_error: containerData?.error || containerData,
      }, containerRes.status);
    }
    const containerId: string = containerData.id;

    // Petit délai pour laisser Meta traiter les enfants (recommandé par la doc).
    await sleep(2000);

    // Étape 3 : publication.
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });
    const publishRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishParams.toString(),
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      return jsonResponse({
        error: 'Echec publication carrousel',
        graph_error: publishData?.error || publishData,
      }, publishRes.status);
    }
    const postId: string = publishData.id;

    // Récup permalink pour affichage admin.
    let permalink: string | undefined;
    try {
      const linkRes = await fetch(
        `${GRAPH_BASE}/${postId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
      );
      const linkData = await linkRes.json();
      permalink = linkData?.permalink;
    } catch {
      // non bloquant
    }

    await updateBundle(bundle_id, image_urls[0], postId);

    return jsonResponse({
      instagram_post_id: postId,
      permalink,
      carousel_size: image_urls.length,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    return jsonResponse({
      error: (err as Error).message,
      duration_ms: Date.now() - startedAt,
    }, 500);
  }
});

async function createCarouselItem(args: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const params = new URLSearchParams({
    image_url: args.imageUrl,
    is_carousel_item: 'true',
    access_token: args.accessToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${args.igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.id) {
    return { ok: false, error: JSON.stringify(data?.error || data) };
  }
  return { ok: true, id: data.id };
}

async function publishSinglePhoto(args: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{ ok: boolean; postId?: string; permalink?: string; error?: string; status?: number }> {
  const containerParams = new URLSearchParams({
    image_url: args.imageUrl,
    caption: args.caption,
    access_token: args.accessToken,
  });
  const containerRes = await fetch(`${GRAPH_BASE}/${args.igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: containerParams.toString(),
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok || !containerData.id) {
    return { ok: false, error: JSON.stringify(containerData?.error || containerData), status: containerRes.status };
  }
  await sleep(2000);
  const publishParams = new URLSearchParams({
    creation_id: containerData.id,
    access_token: args.accessToken,
  });
  const publishRes = await fetch(`${GRAPH_BASE}/${args.igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publishParams.toString(),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok || !publishData.id) {
    return { ok: false, error: JSON.stringify(publishData?.error || publishData), status: publishRes.status };
  }
  let permalink: string | undefined;
  try {
    const linkRes = await fetch(
      `${GRAPH_BASE}/${publishData.id}?fields=permalink&access_token=${encodeURIComponent(args.accessToken)}`,
    );
    const linkData = await linkRes.json();
    permalink = linkData?.permalink;
  } catch {
    // non bloquant
  }
  return { ok: true, postId: publishData.id, permalink };
}

async function updateBundle(bundleId: string | undefined, imageUrl: string, postId: string) {
  if (!bundleId) return;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  await supabase
    .from('editorial_bundles')
    .update({
      instagram_post_id: postId,
      instagram_image_url: imageUrl,
      instagram_published_at: new Date().toISOString(),
    })
    .eq('id', bundleId);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
