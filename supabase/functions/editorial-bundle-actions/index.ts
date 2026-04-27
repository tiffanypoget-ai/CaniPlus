// supabase/functions/editorial-bundle-actions/index.ts
// -----------------------------------------------------------------------------
// Actions admin Phase 2 dediees a l'agent editorial. Separee de admin-query
// pour ne pas surcharger ce dernier.
//
// Actions :
//   - trigger_generate_bundle    : appelle generate-editorial-bundle (Phase 2a)
//   - get_editorial_bundle       : recupere un bundle complet avec ses content_*
//   - update_editorial_bundle_content : modifie un support apres edition manuelle
//   - validate_editorial_bundle  : drafted -> validated (Phase 2b)
//   - publish_editorial_bundle   : validated -> published (Phase 2c, stub pour l'instant)
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
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

function fail(message: string, status = 400) {
  return ok({ error: message }, status);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, admin_password, payload } = body;

    const expectedPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expectedPassword) {
      return fail('Mot de passe incorrect', 401);
    }

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
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ admin_password, bundle_id }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(`generate-editorial-bundle : ${data?.error ?? res.status}`);
      }
      return ok(data);
    }

    if (action === 'get_editorial_bundle') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const { data, error } = await supabase
        .from('editorial_bundles')
        .select('*')
        .eq('id', bundle_id)
        .single();
      if (error) throw error;
      return ok({ bundle: data });
    }

    if (action === 'update_editorial_bundle_content') {
      // payload: { bundle_id, content_blog?, content_premium?, content_instagram?, content_google_business?, content_notification? }
      const { bundle_id, ...fields } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');

      const updates: Record<string, unknown> = {};
      const allowed = ['content_blog', 'content_premium', 'content_instagram', 'content_google_business', 'content_notification'];
      for (const k of allowed) {
        if (fields[k] !== undefined) updates[k] = fields[k];
      }
      if (Object.keys(updates).length === 0) throw new Error('aucun champ content_* fourni');

      const { data, error } = await supabase
        .from('editorial_bundles')
        .update(updates)
        .eq('id', bundle_id)
        .select()
        .single();
      if (error) throw error;
      return ok({ bundle: data });
    }

    if (action === 'validate_editorial_bundle') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');

      const { data: target, error: e1 } = await supabase
        .from('editorial_bundles')
        .select('id, status')
        .eq('id', bundle_id)
        .single();
      if (e1) throw e1;
      if (target.status !== 'drafted') {
        throw new Error(`Le bundle doit etre a l'etat 'drafted' (statut actuel : ${target.status})`);
      }

      const { data, error } = await supabase
        .from('editorial_bundles')
        .update({ status: 'validated' })
        .eq('id', bundle_id)
        .select()
        .single();
      if (error) throw error;
      return ok({ bundle: data });
    }

    if (action === 'publish_editorial_bundle') {
      // Phase 2c : stub pour l'instant. Sera complete dans une iteration suivante.
      // Logique future :
      //   1. Creer un article dans la table `articles` depuis content_blog (published=true)
      //   2. Optionnellement creer une ressource premium depuis content_premium
      //   3. Optionnellement envoyer une notification push depuis content_notification
      //   4. Appeler publish-article-to-github pour generer le HTML statique
      //   5. Marquer le bundle comme 'published' avec article_id rempli
      return fail('Publication automatique non encore implementee (Phase 2c). Tu peux pour l instant copier les contenus depuis l admin et publier manuellement.', 501);
    }

    throw new Error(`Action inconnue : ${action}`);

  } catch (err: unknown) {
    let message = 'Erreur inconnue';
    if (err instanceof Error) message = err.message;
    else if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      message = String(e.message ?? e.details ?? e.hint ?? JSON.stringify(err));
    }
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
