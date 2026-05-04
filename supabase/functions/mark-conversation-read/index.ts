// supabase/functions/mark-conversation-read/index.ts
// -----------------------------------------------------------------------------
// Marque les messages d'une conversation comme lus pour le côté qui appelle
// (membre ou admin), et reset le compteur unread_count correspondant.
//
// Body :
//   { conversation_id: string (UUID) }
//
// Auth : Bearer JWT user. Le rôle est lu depuis profiles.role.
//        Le membre ne peut marquer 'lu' que sa propre conversation.
//        L'admin peut marquer 'lu' n'importe quelle conversation.
//
// Effets :
//   - UPDATE chat_messages SET read_at = now() pour les messages venant de
//     l'autre côté qui n'ont pas encore été lus.
//   - UPDATE conversations SET unread_count_(admin|member) = 0
//     selon le rôle de l'appelant.
//
// Routée via une edge function plutôt qu'un UPDATE direct côté client pour
// éviter les soucis de RLS sur les UPDATE sur les tables conversations /
// chat_messages depuis le frontend.
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
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return fail('Authentification requise', 401);

    // Client avec le JWT du user pour vérifier l'identité
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return fail('JWT invalide', 401);
    const userId = user.id;

    const body = await req.json().catch(() => ({} as any));
    const { conversation_id } = body ?? {};
    if (!conversation_id) return fail('conversation_id manquant', 400);

    // Service role pour bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Récupère le rôle de l'appelant
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single();
    if (profErr || !profile) return fail('Profil non trouvé', 404);
    const callerRole: 'admin' | 'member' = profile.role === 'admin' ? 'admin' : 'member';

    // Vérifie que la conversation existe
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, member_id')
      .eq('id', conversation_id)
      .single();
    if (convErr || !conv) return fail('Conversation introuvable', 404);

    // Membre : doit être le propriétaire de la conv
    if (callerRole === 'member' && conv.member_id !== userId) {
      return fail('Pas l\'autorisation', 403);
    }

    // Le côté qui marque "lu" lit les messages venant de l'AUTRE côté
    const otherSide = callerRole === 'admin' ? 'member' : 'admin';

    // 1) Marque les messages non-lus venant de l'autre côté comme lus
    const nowIso = new Date().toISOString();
    const { data: updatedMsgs, error: msgErr } = await supabase
      .from('chat_messages')
      .update({ read_at: nowIso })
      .eq('conversation_id', conversation_id)
      .eq('sender_role', otherSide)
      .is('read_at', null)
      .select('id');
    if (msgErr) return fail('Erreur DB messages : ' + msgErr.message, 500);

    // 2) Reset le compteur unread_count du côté appelant
    const counterField = callerRole === 'admin' ? 'unread_count_admin' : 'unread_count_member';
    const { error: convUpdErr } = await supabase
      .from('conversations')
      .update({ [counterField]: 0 })
      .eq('id', conversation_id);
    if (convUpdErr) return fail('Erreur DB conversation : ' + convUpdErr.message, 500);

    return ok({
      ok: true,
      marked_read: updatedMsgs?.length ?? 0,
      caller_role: callerRole,
    });
  } catch (e) {
    return fail('Erreur : ' + (e as Error).message, 500);
  }
});
