// supabase/functions/save-push-subscription/index.ts
// Enregistre ou supprime une souscription Web Push pour un utilisateur

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json();
    const { user_id, subscription, action } = body;

    if (!user_id) throw new Error('user_id manquant');

    if (action === 'unsubscribe') {
      await supabase.from('push_subscriptions').delete().eq('user_id', user_id);
      return ok({ message: 'Souscription supprimée' });
    }

    if (!subscription) throw new Error('subscription manquante');

    // Upsert la souscription (une par user pour simplifier)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ user_id, subscription, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) throw error;
    return ok({ message: 'Souscription enregistrée' });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
