// supabase/functions/admin-query/index.ts
// Endpoint admin protégé par mot de passe — liste membres, abonnements, chiens, et actions admin.

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
    const body = await req.json();
    const { action, admin_password, payload } = body;

    // ── Vérification du mot de passe admin ──────────────────────────────────
    const expectedPassword = Deno.env.get('ADMIN_PASSWORD') ?? '';
    if (!admin_password || admin_password !== expectedPassword) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Actions ─────────────────────────────────────────────────────────────

    if (action === 'list_members') {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ok({ members: data });
    }

    if (action === 'list_subscriptions') {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ok({ subscriptions: data });
    }

    if (action === 'list_dogs') {
      const { data, error } = await supabase
        .from('dogs')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ok({ dogs: data });
    }

    if (action === 'set_premium') {
      // payload: { user_id, premium_until } — premium_until = null pour désactiver
      const { user_id, premium_until } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');
      const { data, error } = await supabase
        .from('profiles')
        .update({ premium_until: premium_until ?? null, premium_cancel_at: null })
        .eq('id', user_id)
        .select()
        .single();
      if (error) throw error;
      return ok({ profile: data });
    }

    if (action === 'set_cotisation') {
      // payload: { user_id, status } — 'paid' ou 'pending'
      const { user_id, status } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');
      const year = new Date().getFullYear();
      // Upsert la cotisation annuelle
      // Mettre à jour toutes les cotisations existantes pour cet utilisateur cette année
      const updateFields: Record<string, unknown> = { status };
      if (status === 'paid') updateFields.paid_at = new Date().toISOString();
      else updateFields.paid_at = null;

      const { data: updated, error: updateError } = await supabase
        .from('subscriptions')
        .update(updateFields)
        .eq('user_id', user_id)
        .eq('type', 'cotisation_annuelle')
        .eq('year', year)
        .select();

      if (updateError) throw updateError;

      if (updated && updated.length > 0) {
        return ok({ subscription: updated[0] });
      }

      // Aucune trouvée → créer
      const { data: inserted, error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          user_id, type: 'cotisation_annuelle', status, year,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
          private_lessons_total: 0,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      return ok({ subscription: inserted });
    }

    if (action === 'set_lesson_date') {
      // payload: { user_id, lesson_date, lesson_notes? }
      // lesson_date = ISO string (ex. "2026-04-15T10:00:00") ou null pour supprimer
      const { user_id, lesson_date, lesson_notes } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');

      // Cherche une leçon privée existante pour cet utilisateur
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user_id)
        .eq('type', 'lecon_privee')
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Mise à jour
        const { data, error } = await supabase
          .from('subscriptions')
          .update({ lesson_date: lesson_date ?? null, lesson_notes: lesson_notes ?? null })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return ok({ subscription: data });
      } else {
        // Création
        const { data, error } = await supabase
          .from('subscriptions')
          .insert({
            user_id,
            type: 'lecon_privee',
            status: 'paid',
            lesson_date: lesson_date ?? null,
            lesson_notes: lesson_notes ?? null,
            private_lessons_total: 1,
            private_lessons_used: 0,
            year: new Date().getFullYear(),
          })
          .select()
          .single();
        if (error) throw error;
        return ok({ subscription: data });
      }
    }

    if (action === 'list_lessons') {
      // Retourne toutes les leçons privées avec infos du membre
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, profiles(full_name, email, avatar_url)')
        .eq('type', 'lecon_privee')
        .not('lesson_date', 'is', null)
        .order('lesson_date', { ascending: true });
      if (error) throw error;
      return ok({ lessons: data });
    }

    if (action === 'set_course_type') {
      // payload: { user_id, course_type } — 'group' | 'private' | 'both'
      const { user_id, course_type } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');
      const { data, error } = await supabase
        .from('profiles')
        .update({ course_type })
        .eq('id', user_id)
        .select()
        .single();
      if (error) throw error;
      return ok({ profile: data });
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
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function ok(data: unknown) {
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
