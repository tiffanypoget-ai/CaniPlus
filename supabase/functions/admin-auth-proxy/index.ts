// supabase/functions/admin-auth-proxy/index.ts
// Passerelle d'authentification pour le nouveau /admin (refonte juin 2026).
// Vérifie que l'appelant est connecté avec un compte role='admin' (JWT Supabase),
// puis relaie l'action vers la fonction admin legacy en injectant ADMIN_PASSWORD
// côté serveur. Le mot de passe ne transite plus jamais par le navigateur.
//
// v7 (13.07.2026) : les actions d'encaissement cash (mark_cash_paid,
// mark_pcr_cash_paid, cancel_pcr_cash_pending) sont gérées ICI directement —
// la fonction admin-query déployée date d'avant leur ajout et renvoyait une
// erreur. L'annulation d'une demande cash pose aussi payment_status='cancelled'
// pour qu'elle ne réapparaisse plus jamais dans la liste « À encaisser ».

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cibles au format standard { action, admin_password, payload }
const STANDARD_TARGETS = new Set([
  'admin-query',
  'validate-adhesion',
  'publish-article-to-github',
  'editorial-bundle-actions',
]);
// Cibles au format plat { admin_password, ...payload }
const FLAT_TARGETS = new Set([
  'set-admin-chat-status',
  'refund-coaching-request',
  'editorial-proposals-list',
  'editorial-stats',
]);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const target = String(body?.target ?? 'admin-query');
    const action = body?.action;
    const payload = body?.payload ?? null;

    if (!STANDARD_TARGETS.has(target) && !FLAT_TARGETS.has(target)) {
      return json({ error: 'Cible inconnue' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Vérification : compte connecté + role admin ──
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Accès refusé : connecte-toi avec un compte admin' }, 401);
    const { data: userData } = await supabase.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'Accès refusé : session invalide' }, 401);
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (prof?.role !== 'admin') return json({ error: 'Accès refusé : compte sans droits admin' }, 403);

    // ── Actions gérées directement ici (absentes du legacy déployé) ──
    if (target === 'admin-query' && action === 'cancel_cash_pending') {
      const subscription_id = payload?.subscription_id;
      if (!subscription_id) return json({ error: 'subscription_id manquant' });
      const { data, error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', subscription_id)
        .select('id, status')
        .single();
      if (error) return json({ error: error.message });
      return json({ success: true, subscription: data });
    }

    // Marquer une réservation cash (subscription) comme payée à la séance
    if (target === 'admin-query' && action === 'mark_cash_paid') {
      const subscription_id = payload?.subscription_id;
      if (!subscription_id) return json({ error: 'subscription_id manquant' });
      const { data, error } = await supabase
        .from('subscriptions')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_mode: 'cash' })
        .eq('id', subscription_id)
        .select('id, status, paid_at')
        .single();
      if (error) return json({ error: error.message });
      return json({ success: true, subscription: data });
    }

    // Marquer une demande de cours privé cash comme payée à la séance
    if (target === 'admin-query' && action === 'mark_pcr_cash_paid') {
      const request_id = payload?.request_id;
      if (!request_id) return json({ error: 'request_id manquant' });
      const { data, error } = await supabase
        .from('private_course_requests')
        .update({ payment_status: 'cash_paid', payment_mode: 'cash', paid_at: new Date().toISOString() })
        .eq('id', request_id)
        .select('id, user_id, payment_status, paid_at')
        .single();
      if (error) return json({ error: error.message });
      if (data?.user_id) {
        await supabase
          .from('subscriptions')
          .update({ status: 'paid', payment_status: 'cash_paid', paid_at: new Date().toISOString() })
          .eq('user_id', data.user_id)
          .eq('type', 'lecon_privee')
          .in('status', ['pending_payment', 'pending']);
      }
      return json({ success: true, request: data });
    }

    // Annuler une demande de cours privé cash en attente d'encaissement.
    // On pose status ET payment_status : la liste « À encaisser » filtre sur
    // payment_status='cash_pending', sans quoi l'entrée réapparaissait.
    // 'not_required' = seule valeur du CHECK adaptée à une demande annulée.
    if (target === 'admin-query' && action === 'cancel_pcr_cash_pending') {
      const request_id = payload?.request_id;
      if (!request_id) return json({ error: 'request_id manquant' });
      const { data, error } = await supabase
        .from('private_course_requests')
        .update({ status: 'cancelled', payment_status: 'not_required' })
        .eq('id', request_id)
        .select('id, status, payment_status')
        .single();
      if (error) return json({ error: error.message });
      return json({ success: true, request: data });
    }

    // Rôle éducatrice : seuls 'educatrice' et 'member' sont autorisés ici.
    // Le rôle 'admin' ne peut JAMAIS être attribué par cette action (sécurité).
    if (target === 'admin-query' && action === 'set_role') {
      const user_id = payload?.user_id;
      const role = payload?.role;
      if (!user_id) return json({ error: 'user_id manquant' });
      if (role !== 'educatrice' && role !== 'member') {
        return json({ error: "role doit être 'educatrice' ou 'member'" });
      }
      // On ne touche jamais à un compte admin
      const { data: targetProf } = await supabase.from('profiles').select('role').eq('id', user_id).maybeSingle();
      if (targetProf?.role === 'admin') return json({ error: 'Impossible de modifier un compte admin' });
      const { data, error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', user_id)
        .select('id, role')
        .single();
      if (error) return json({ error: error.message });
      return json({ success: true, profile: data });
    }

    // ── Relais vers la fonction legacy avec le mot de passe injecté côté serveur ──
    const adminPwd = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const forwardBody = FLAT_TARGETS.has(target)
      ? { admin_password: adminPwd, ...(payload ?? {}) }
      : { action, admin_password: adminPwd, payload };
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${target}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwardBody),
    });
    const data = await r.json().catch(() => ({ error: `Réponse invalide (${r.status})` }));
    return json(data, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur inconnue' });
  }
});
