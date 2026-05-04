// supabase/functions/send-chat-message/index.ts
// -----------------------------------------------------------------------------
// Envoie un message dans le chat privé membre ↔ admin.
//
// Body :
//   {
//     conversation_id: string (UUID),
//     content?: string,
//     attachment_url?: string,
//     attachment_type?: 'image' | 'video' | 'pdf',
//     attachment_name?: string,
//     attachment_size?: number,
//   }
//
// Auth : Bearer JWT user (verify_jwt: true). Le user_id du JWT est utilisé
//        comme sender_id. Le sender_role est calculé depuis profiles.role.
//
// Effets :
//   - INSERT dans chat_messages (le trigger DB met à jour la conversation)
//   - Push notification au destinataire (admin → member ou member → admin)
//
// La signature côté membre passe par supabase.functions.invoke (qui inclut
// auto le JWT) — pas besoin d'admin_password.
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

const MAX_CONTENT_LENGTH = 5000;
const ALLOWED_ATTACHMENT_TYPES = ['image', 'video', 'pdf'] as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return fail('Authentification requise', 401);

    // Client avec le JWT du user
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Récupère le user
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return fail('JWT invalide', 401);
    const userId = user.id;

    // Body
    const body = await req.json().catch(() => ({} as any));
    const { conversation_id, content, attachment_url, attachment_type, attachment_name, attachment_size } = body ?? {};
    if (!conversation_id) return fail('conversation_id manquant', 400);
    if (!content && !attachment_url) return fail('Message vide (content ou attachment requis)', 400);
    if (content && content.length > MAX_CONTENT_LENGTH) return fail('Message trop long (max ' + MAX_CONTENT_LENGTH + ')', 400);
    if (attachment_type && !ALLOWED_ATTACHMENT_TYPES.includes(attachment_type)) {
      return fail('Type de pièce jointe non supporté', 400);
    }

    // Client service-role pour les opérations privilégiées
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Récupère le rôle du user
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url')
      .eq('id', userId)
      .single();
    if (profErr || !profile) return fail('Profil non trouvé', 404);

    const senderRole = profile.role === 'admin' ? 'admin' : 'member';

    // Vérifie que la conversation existe et que le user a le droit
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, member_id')
      .eq('id', conversation_id)
      .single();
    if (convErr || !conv) return fail('Conversation introuvable', 404);

    if (senderRole === 'member' && conv.member_id !== userId) {
      return fail('Pas l\'autorisation d\'écrire dans cette conversation', 403);
    }

    // INSERT le message (le trigger DB met à jour la conversation)
    const { data: msg, error: msgErr } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id,
        sender_id: userId,
        sender_role: senderRole,
        content: content ?? null,
        attachment_url: attachment_url ?? null,
        attachment_type: attachment_type ?? null,
        attachment_name: attachment_name ?? null,
        attachment_size: attachment_size ?? null,
      })
      .select()
      .single();
    if (msgErr) return fail('Erreur DB : ' + msgErr.message, 500);

    // Identifie le destinataire pour le push
    let pushTargetId: string | null = null;
    if (senderRole === 'member') {
      // Cherche l'admin
      const { data: admin } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      pushTargetId = admin?.id ?? null;
    } else {
      // Admin → push au membre
      pushTargetId = conv.member_id;
    }

    // Push web (réutilise editorial-bundle-actions / send_push_batch)
    let pushResult: unknown = { skipped: 'no target' };
    if (pushTargetId) {
      try {
        const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const adminPwd = Deno.env.get('ADMIN_PASSWORD') ?? '';

        const previewBody = content
          ? content.substring(0, 120)
          : (attachment_type === 'image' ? '📷 Photo' : attachment_type === 'video' ? '🎥 Vidéo' : '📄 Document');

        const pushTitle = senderRole === 'admin'
          ? 'Tiffany'
          : (profile.full_name ?? 'Nouveau message');
        const pushUrl = senderRole === 'admin'
          ? 'https://app.caniplus.ch?openChat=1'
          : 'https://app.caniplus.ch/admin?tab=messagerie';

        const r = await fetch(supaUrl + '/functions/v1/editorial-bundle-actions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_push_batch',
            admin_password: adminPwd,
            payload: {
              user_ids: [pushTargetId],
              title: pushTitle,
              body: previewBody,
              url: pushUrl,
            },
          }),
        });
        pushResult = await r.json().catch(() => ({ error: 'parse failed' }));
      } catch (e) {
        pushResult = { error: (e as Error).message };
      }
    }

    return ok({ message: msg, push: pushResult });
  } catch (e) {
    return fail('Erreur : ' + (e as Error).message, 500);
  }
});
