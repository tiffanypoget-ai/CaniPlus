// publish-to-facebook
// Publie sur la Page Facebook CaniPlus via Meta Graph API.
// Deux modes :
//   - avec image_url : publie une PHOTO + légende (endpoint /photos).
//   - sans image_url mais avec link : publie un POST-LIEN (endpoint /feed).
//     Facebook génère automatiquement la vignette depuis les balises OG du lien.
// Met à jour editorial_bundles.facebook_post_id + facebook_published_at en retour.
//
// Input  : { bundle_id?: string, message: string, image_url?: string, link?: string }
// Output : { facebook_post_id: string, permalink_url?: string }
//
// Secrets requis :
//  - META_PAGE_ACCESS_TOKEN (long-lived, scope pages_manage_posts)
//  - META_PAGE_ID (ID numérique de la Page Facebook CaniPlus)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { bundle_id, image_url, message, link } = await req.json();

    if (!message) {
      return jsonResponse({ error: 'message est requis' }, 400);
    }
    if (!image_url && !link) {
      return jsonResponse({ error: 'fournir image_url (post photo) ou link (post-lien)' }, 400);
    }

    const accessToken = Deno.env.get('META_PAGE_ACCESS_TOKEN');
    const pageId = Deno.env.get('META_PAGE_ID');
    if (!accessToken || !pageId) {
      return jsonResponse({
        error: 'Secrets manquants : META_PAGE_ACCESS_TOKEN et/ou META_PAGE_ID',
      }, 500);
    }

    let publishRes: Response;

    if (image_url) {
      // Mode PHOTO : POST /{page-id}/photos avec caption (+ lien dans le texte).
      const finalMessage = link ? `${message}\n\n${link}` : message;
      const params = new URLSearchParams({
        url: image_url,
        caption: finalMessage,
        access_token: accessToken,
      });
      publishRes = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } else {
      // Mode POST-LIEN : POST /{page-id}/feed avec message + link.
      // Facebook scrape les balises OG du lien pour générer la vignette.
      const params = new URLSearchParams({
        message,
        link: link as string,
        access_token: accessToken,
      });
      publishRes = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    }

    const publishData = await publishRes.json();
    if (!publishRes.ok) {
      return jsonResponse({
        error: 'Echec publication Facebook',
        graph_error: publishData?.error || publishData,
      }, publishRes.status);
    }

    // /photos renvoie { id, post_id }, /feed renvoie { id }.
    const postId: string = publishData.post_id || publishData.id;
    if (!postId) {
      return jsonResponse({
        error: 'Pas de post_id dans la réponse Facebook',
        graph_response: publishData,
      }, 500);
    }

    // Récupère le permalink pour l'afficher dans l'admin.
    let permalinkUrl: string | undefined;
    try {
      const permalinkRes = await fetch(
        `${GRAPH_BASE}/${postId}?fields=permalink_url&access_token=${encodeURIComponent(accessToken)}`,
      );
      const permalinkData = await permalinkRes.json();
      permalinkUrl = permalinkData?.permalink_url;
    } catch {
      // pas bloquant
    }

    // Mise à jour editorial_bundles si bundle_id fourni.
    if (bundle_id) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } },
      );
      const update: Record<string, unknown> = {
        facebook_post_id: postId,
        facebook_published_at: new Date().toISOString(),
      };
      if (image_url) update.facebook_image_url = image_url;
      await supabase.from('editorial_bundles').update(update).eq('id', bundle_id);
    }

    return jsonResponse({
      facebook_post_id: postId,
      permalink_url: permalinkUrl,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
