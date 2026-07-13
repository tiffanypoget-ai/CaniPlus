// supabase/functions/admin-auth-proxy/index.ts
// Passerelle d'authentification pour le nouveau /admin (refonte juin 2026).
// Vérifie que l'appelant est connecté avec un compte role='admin' (JWT Supabase),
// puis relaie l'action vers la fonction admin legacy en injectant ADMIN_PASSWORD
// côté serveur. Le mot de passe ne transite plus jamais par le navigateur.
//
// v7-v9 (13.07.2026) : actions d'encaissement cash (mark_cash_paid,
// mark_pcr_cash_paid, cancel_pcr_cash_pending) et reject_request (refus
// notifié) gérées ICI directement — la fonction admin-query déployée date
// d'avant leur ajout.
// v10 (13.07.2026, relecture multi-agents) : fix mark_pcr_cash_paid (colonne
// payment_status inexistante sur subscriptions), cancel_pcr_cash_pending
// annule aussi la leçon en attente, set_lesson_date sécurisé (ne touche
// jamais un forfait payé), cancel_pending_lessons (remplace delete_lesson
// à l'annulation d'un cours confirmé).

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
        // NB : pas de colonne payment_status sur subscriptions (l'inclure
        // faisait échouer silencieusement toute la mise à jour).
        const { error: subErr } = await supabase
          .from('subscriptions')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('user_id', data.user_id)
          .eq('type', 'lecon_privee')
          .in('status', ['pending_payment', 'pending']);
        if (subErr) console.error('[mark_pcr_cash_paid] subscription:', subErr.message);
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
        .select('id, user_id, status, payment_status')
        .single();
      if (error) return json({ error: error.message });
      // Annule aussi la subscription lecon_privee en attente du membre pour
      // ne pas laisser une entrée orpheline « Réservée » sur son profil.
      if (data?.user_id) {
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('user_id', data.user_id)
          .eq('type', 'lecon_privee')
          .in('status', ['pending_payment', 'pending']);
      }
      return json({ success: true, request: data });
    }

    // Annuler UNIQUEMENT les leçons privées en attente d'un membre (utilisé à
    // l'annulation d'un cours confirmé) — contrairement au delete_lesson du
    // legacy qui supprimait TOUTES ses subscriptions lecon_privee, y compris
    // des forfaits déjà payés.
    if (target === 'admin-query' && action === 'cancel_pending_lessons') {
      const user_id = payload?.user_id;
      if (!user_id) return json({ error: 'user_id manquant' });
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', user_id)
        .eq('type', 'lecon_privee')
        .in('status', ['pending_payment', 'pending']);
      if (error) return json({ error: error.message });
      return json({ success: true });
    }

    // set_lesson_date sécurisé : le legacy prenait la PREMIÈRE subscription
    // lecon_privee du membre sans filtre de statut et pouvait écraser la date
    // d'un forfait déjà payé. Ici : on met à jour une leçon en attente, sinon
    // on en crée une nouvelle — jamais de modification d'une leçon payée.
    if (target === 'admin-query' && action === 'set_lesson_date') {
      const user_id = payload?.user_id;
      const lesson_date = payload?.lesson_date ?? null;
      const lesson_notes = payload?.lesson_notes ?? null;
      if (!user_id) return json({ error: 'user_id manquant' });
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user_id)
        .eq('type', 'lecon_privee')
        .in('status', ['pending', 'pending_payment'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const { data, error } = await supabase
          .from('subscriptions')
          .update({ lesson_date, lesson_notes })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) return json({ error: error.message });
        return json({ subscription: data });
      }
      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id,
          type: 'lecon_privee',
          status: 'pending',
          lesson_date,
          lesson_notes,
          private_lessons_total: 1,
        })
        .select()
        .single();
      if (error) return json({ error: error.message });
      return json({ subscription: data });
    }

    // Refuser une demande de cours privé : passe la demande en 'rejected',
    // nettoie la subscription en attente, et PRÉVIENT le membre (notification
    // in-app + push web) — avec le message/alternative de Tiffany s'il y en a.
    if (target === 'admin-query' && action === 'reject_request') {
      const request_id = payload?.request_id;
      const message = String(payload?.message ?? '').trim();
      if (!request_id) return json({ error: 'request_id manquant' });
      const { data, error } = await supabase
        .from('private_course_requests')
        .update({ status: 'rejected', ...(message ? { admin_notes: message } : {}) })
        .eq('id', request_id)
        .select('id, user_id, payment_status')
        .single();
      if (error) return json({ error: error.message });

      // Ne doit plus apparaître dans « À encaisser » si c'était un cash en attente
      if (data?.payment_status === 'cash_pending') {
        await supabase
          .from('private_course_requests')
          .update({ payment_status: 'not_required' })
          .eq('id', request_id);
      }
      // Nettoie la subscription lecon_privee en attente (comme le legacy)
      if (data?.user_id) {
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('user_id', data.user_id)
          .eq('type', 'lecon_privee')
          .in('status', ['pending_payment', 'pending']);
      }

      // Notification au membre : in-app + push web
      let notifResult: unknown = { skipped: 'pas de user_id' };
      if (data?.user_id) {
        const title = 'Cours privé';
        const body = message
          ? `Ta demande de cours privé n'a pas pu être acceptée telle quelle. Message de Tiffany : ${message}`
          : 'Ta demande de cours privé n’a pas pu être acceptée cette fois. N’hésite pas à refaire une demande avec d’autres disponibilités !';
        const { error: notifErr } = await supabase
          .from('notifications')
          .insert({ user_id: data.user_id, type: 'info', title, body });
        if (notifErr) console.error('[reject_request] notif in-app:', notifErr.message);
        try {
          const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/editorial-bundle-actions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'send_push_batch',
              admin_password: Deno.env.get('ADMIN_PASSWORD') ?? '',
              payload: { user_ids: [data.user_id], title, body, url: '/' },
            }),
          });
          notifResult = await r.json().catch(() => ({ error: `status ${r.status}` }));
        } catch (e) {
          notifResult = { error: (e as Error).message };
        }
      }
      return json({ success: true, request: data, notification: notifResult });
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
