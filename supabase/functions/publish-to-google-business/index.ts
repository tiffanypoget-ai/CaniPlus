// publish-to-google-business
// Publie un LocalPost sur la fiche Google Business Profile CaniPlus.
// Met à jour editorial_bundles.gbp_post_id + gbp_published_at en retour.
//
// Input  : { bundle_id?: string, image_url: string, summary: string, cta_url?: string, cta_type?: string }
// Output : { gbp_post_id: string, search_url?: string }
//
// AUTH — deux modes (le refresh token est le mode normal pour l'automatisation) :
//  Mode A (recommandé) : refresh token OAuth, échangé contre un access token à chaque appel.
//    - GBP_REFRESH_TOKEN  (obtenu via OAuth Playground, scope business.manage)
//    - GBP_CLIENT_ID      (client OAuth « CaniPlus GBP Publisher »)
//    - GBP_CLIENT_SECRET
//  Mode B (dépannage) : access token statique (expire en 1h).
//    - GBP_ACCESS_TOKEN
//
// Toujours requis :
//    - GBP_ACCOUNT_ID  (format "accounts/12345" ou "12345")
//    - GBP_LOCATION_ID (format "locations/67890" ou "67890")
//
// Note: le summary GBP est limité à 1500 caractères. On tronque si dépassement.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const GBP_BASE = 'https://mybusiness.googleapis.com/v4';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const MAX_SUMMARY = 1500;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Récupère un access token valide : soit le statique (dépannage), soit en
// échangeant le refresh token (mode normal).
async function getAccessToken(): Promise<string> {
  const staticToken = Deno.env.get('GBP_ACCESS_TOKEN');
  if (staticToken) return staticToken;

  const refreshToken = Deno.env.get('GBP_REFRESH_TOKEN');
  const clientId = Deno.env.get('GBP_CLIENT_ID');
  const clientSecret = Deno.env.get('GBP_CLIENT_SECRET');
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Secrets manquants : fournir GBP_ACCESS_TOKEN, ou (GBP_REFRESH_TOKEN + GBP_CLIENT_ID + GBP_CLIENT_SECRET).',
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error('Echec du rafraîchissement OAuth : ' + JSON.stringify(data));
  }
  return data.access_token as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const {
      bundle_id,
      image_url,
      summary,
      cta_url,
      cta_type = 'LEARN_MORE',
    } = await req.json();

    if (!image_url || !summary) {
      return jsonResponse({ error: 'image_url et summary sont requis' }, 400);
    }

    const accountId = Deno.env.get('GBP_ACCOUNT_ID');
    const locationId = Deno.env.get('GBP_LOCATION_ID');
    if (!accountId || !locationId) {
      return jsonResponse({ error: 'Secrets manquants : GBP_ACCOUNT_ID, GBP_LOCATION_ID' }, 500);
    }

    let token: string;
    try {
      token = await getAccessToken();
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 500);
    }

    const truncatedSummary = summary.length > MAX_SUMMARY
      ? summary.slice(0, MAX_SUMMARY - 1) + '…'
      : summary;

    const body: Record<string, unknown> = {
      languageCode: 'fr',
      summary: truncatedSummary,
      topicType: 'STANDARD',
      media: [{ mediaFormat: 'PHOTO', sourceUrl: image_url }],
    };

    if (cta_url) {
      body.callToAction = {
        actionType: cta_type,
        url: cta_url,
      };
    }

    // Les IDs peuvent être fournis avec ou sans préfixe ; on normalise.
    const cleanAccount = accountId.replace(/^accounts\//, '');
    const cleanLocation = locationId.replace(/^locations\//, '');
    const endpoint = `${GBP_BASE}/accounts/${cleanAccount}/locations/${cleanLocation}/localPosts`;

    const publishRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok) {
      return jsonResponse({
        error: 'Echec publication Google Business',
        gbp_error: publishData?.error || publishData,
      }, publishRes.status);
    }

    // Le nom retourné est de la forme accounts/X/locations/Y/localPosts/Z
    const postId: string = publishData.name || publishData.id;
    const searchUrl: string | undefined = publishData.searchUrl;

    if (bundle_id) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false } },
      );
      await supabase
        .from('editorial_bundles')
        .update({
          gbp_post_id: postId,
          gbp_image_url: image_url,
          gbp_published_at: new Date().toISOString(),
        })
        .eq('id', bundle_id);
    }

    return jsonResponse({
      gbp_post_id: postId,
      search_url: searchUrl,
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
