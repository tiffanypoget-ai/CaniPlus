// supabase/functions/editorial-proposals-list/index.ts
// -----------------------------------------------------------------------------
// Petit endpoint dedie : renvoie les propositions du dernier batch en cours
// AVEC le champ category. Cree pour eviter d'avoir a redeployer le gros
// admin-query (56KB) juste pour ajouter une colonne au SELECT.
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { admin_password } = body ?? {};
    const expected = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expected) {
      return ok({ error: 'Mot de passe incorrect' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Dernier batch encore à l'état 'proposed'
    const { data: lastBatch, error: e1 } = await supabase
      .from('editorial_bundles')
      .select('proposal_batch_id, proposed_at')
      .eq('status', 'proposed')
      .order('proposed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;

    if (!lastBatch) {
      return ok({ batch_id: null, proposals: [] });
    }

    const { data: proposals, error: e2 } = await supabase
      .from('editorial_bundles')
      .select('id, theme, theme_slug, theme_description, theme_rationale, category, proposed_at, proposal_batch_id')
      .eq('proposal_batch_id', lastBatch.proposal_batch_id)
      .eq('status', 'proposed')
      .order('created_at', { ascending: true });
    if (e2) throw e2;

    // Bonus : liste des bundles en cours (non-proposed) avec category
    const { data: bundles, error: e3 } = await supabase
      .from('editorial_bundles')
      .select('id, theme, theme_slug, theme_description, category, status, proposed_at, chosen_at, drafted_at, validated_at, published_at, article_id')
      .not('status', 'in', '("proposed","rejected","archived")')
      .order('proposed_at', { ascending: false })
      .limit(50);
    if (e3) throw e3;

    return ok({
      batch_id: lastBatch.proposal_batch_id,
      proposals: proposals ?? [],
      bundles: bundles ?? [],
    });

  } catch (e) {
    return ok({ error: (e as Error).message }, 200);
  }
});
