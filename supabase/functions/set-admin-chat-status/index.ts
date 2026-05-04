// supabase/functions/set-admin-chat-status/index.ts
// -----------------------------------------------------------------------------
// Permet à l'admin (Tiffany) de basculer son statut de disponibilité chat :
//   - 'available' : disponible (par défaut)
//   - 'vacation'  : en vacances (avec date de retour optionnelle)
//
// Body : { admin_password, status: 'available' | 'vacation', vacation_until?: ISO }
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const { admin_password, status, vacation_until } = body ?? {};

    const expected = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!expected || admin_password !== expected) return fail('Authentification requise', 401);

    if (status !== 'available' && status !== 'vacation') {
      return fail('Statut invalide (available | vacation)', 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const updates: Record<string, unknown> = { admin_chat_status: status };
    updates.vacation_until = status === 'vacation' && vacation_until ? vacation_until : null;

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('role', 'admin')
      .select('id, admin_chat_status, vacation_until');

    if (error) return fail('Erreur DB : ' + error.message, 500);

    return ok({ updated: data?.length ?? 0, status, vacation_until: updates.vacation_until });
  } catch (e) {
    return fail('Erreur : ' + (e as Error).message, 500);
  }
});
