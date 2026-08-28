// supabase/functions/editorial-proposals-list/index.ts
// -----------------------------------------------------------------------------
// Petit endpoint dedie : renvoie les propositions du dernier batch en cours.
// Cree a l'origine pour exposer le champ category sans redeployer le gros
// admin-query (56KB). Les categories editoriales ont ete retirees le 27 aout
// 2026 : la colonne n'est plus selectionnee, mais l'endpoint reste utile, il
// sert aussi la liste des bundles en cours.
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
      .select('id, theme, theme_slug, theme_description, theme_rationale, proposed_at, proposal_batch_id')
      .eq('proposal_batch_id', lastBatch.proposal_batch_id)
      .eq('status', 'proposed')
      .order('created_at', { ascending: true });
    if (e2) throw e2;

    // Bonus : liste des bundles en cours (non-proposed)
    const { data: bundles, error: e3 } = await supabase
      .from('editorial_bundles')
      // image_generated_at / slides_rendered_at : suffisent a savoir si un
      // bundle a sa couverture et ses slides, sans charger tout le contenu
      // (avertissement non bloquant avant programmation, cote admin).
      .select('id, theme, theme_slug, theme_description, status, proposed_at, chosen_at, drafted_at, validated_at, published_at, article_id, cover_breed, image_generated_at, slides_rendered_at')
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
