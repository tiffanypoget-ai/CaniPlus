// supabase/functions/editorial-stats/index.ts
// Phase 3d : retourne les stats des bundles publies pour le dashboard admin.
// Auth : admin_password.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const { admin_password } = body ?? {};

    const expected = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expected) {
      return json({ error: 'Mot de passe incorrect' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: stats, error } = await supabase
      .from('editorial_bundle_stats')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const totals = (stats ?? []).reduce((acc, s) => ({
      total_bundles: acc.total_bundles + 1,
      total_article_views: acc.total_article_views + (s.article_views ?? 0),
      total_resource_views: acc.total_resource_views + (s.resource_views ?? 0),
      total_push_clicks: acc.total_push_clicks + (s.push_clicks ?? 0),
    }), { total_bundles: 0, total_article_views: 0, total_resource_views: 0, total_push_clicks: 0 });

    return json({ stats: stats ?? [], totals });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return json({ error: message }, 200);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
