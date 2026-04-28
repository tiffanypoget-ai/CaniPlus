// supabase/functions/track-event/index.ts
// -----------------------------------------------------------------------------
// Endpoint PUBLIC (pas d'admin password) pour incrementer les compteurs de vues
// d'articles, ressources, et logger les clics push.
//
// Body: { kind, article_id?, resource_id?, bundle_id?, user_id? }
//   kind = 'article_view' | 'resource_view' | 'push_click' | 'push_received'
//
// Anti-spam basique : 1 event par (kind+target+user_agent+ip) toutes les 30 min.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_KINDS = new Set(['article_view', 'resource_view', 'push_click', 'push_received']);

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);

  try {
    const body = await req.json().catch(() => ({} as any));
    const { kind, article_id, resource_id, bundle_id, user_id } = body ?? {};

    if (!kind || !ALLOWED_KINDS.has(kind)) {
      return ok({ error: 'kind invalide' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;
    const referrer = req.headers.get('referer')?.slice(0, 500) ?? null;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('cf-connecting-ip')
      ?? null;

    // Anti-spam : meme (kind, target, ua, ip) dans les 30 dernieres minutes -> ignore
    const target = article_id ?? resource_id ?? bundle_id ?? null;
    if (target && userAgent) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const targetCol = article_id ? 'article_id' : (resource_id ? 'resource_id' : 'bundle_id');
      const { count } = await supabase
        .from('editorial_events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', kind)
        .eq(targetCol, target)
        .eq('user_agent', userAgent)
        .gte('created_at', since);

      if ((count ?? 0) > 0) {
        return ok({ deduped: true });
      }
    }

    // Insert event
    const { error: insErr } = await supabase
      .from('editorial_events')
      .insert({
        kind,
        article_id: article_id ?? null,
        resource_id: resource_id ?? null,
        bundle_id: bundle_id ?? null,
        user_id: user_id ?? null,
        user_agent: userAgent,
        referrer,
      });
    if (insErr) throw insErr;

    // Incremente le compteur de l'article ou de la ressource
    if (kind === 'article_view' && article_id) {
      const { error: rpcErr } = await supabase.rpc('increment_article_views', { aid: article_id });
      if (rpcErr) {
        const { data: a } = await supabase.from('articles').select('views_count').eq('id', article_id).single();
        await supabase.from('articles').update({ views_count: (a?.views_count ?? 0) + 1 }).eq('id', article_id);
      }
    }
    if (kind === 'resource_view' && resource_id) {
      const { error: rpcErr } = await supabase.rpc('increment_resource_views', { rid: resource_id });
      if (rpcErr) {
        const { data: r } = await supabase.from('resources').select('views_count').eq('id', resource_id).single();
        await supabase.from('resources').update({ views_count: (r?.views_count ?? 0) + 1 }).eq('id', resource_id);
      }
    }

    return ok({ success: true, kind });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return ok({ error: message }, 200);
  }
});
