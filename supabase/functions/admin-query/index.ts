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

    if (action === 'delete_member') {
      // payload: { user_id }
      const { user_id } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');
      // Supprimer les données liées
      await supabase.from('subscriptions').delete().eq('user_id', user_id);
      await supabase.from('dogs').delete().eq('owner_id', user_id);
      await supabase.from('enrollments').delete().eq('user_id', user_id);
      await supabase.from('messages').delete().or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`);
      await supabase.from('private_course_requests').delete().eq('user_id', user_id);
      await supabase.from('course_attendance').delete().eq('user_id', user_id);
      await supabase.from('profiles').delete().eq('id', user_id);
      // Supprimer l'utilisateur Supabase Auth
      const { error: authErr } = await supabase.auth.admin.deleteUser(user_id);
      if (authErr) throw authErr;
      return ok({ success: true });
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
            status: 'pending',
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

    if (action === 'delete_lesson') {
      const { user_id } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');
      const { error } = await supabase
        .from('subscriptions').delete().eq('user_id', user_id).eq('type', 'lecon_privee');
      if (error) throw error;
      return ok({ success: true });
    }

    if (action === 'delete_subscription') {
      const { subscription_id } = payload ?? {};
      if (!subscription_id) throw new Error('subscription_id manquant');
      const { error } = await supabase
        .from('subscriptions').delete().eq('id', subscription_id);
      if (error) throw error;
      return ok({ success: true });
    }

    if (action === 'list_requests') {
      const { data, error } = await supabase
        .from('private_course_requests')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ok({ requests: data });
    }

    if (action === 'update_request') {
      const { request_id, status, chosen_slot, admin_notes } = payload ?? {};
      if (!request_id) throw new Error('request_id manquant');
      const updates: Record<string, unknown> = {};
      if (status !== undefined) updates.status = status;
      if (chosen_slot !== undefined) updates.chosen_slot = chosen_slot;
      if (admin_notes !== undefined) updates.admin_notes = admin_notes;
      const { data, error } = await supabase
        .from('private_course_requests').update(updates).eq('id', request_id).select().single();
      if (error) throw error;
      return ok({ request: data });
    }

    if (action === 'list_news') {
      const { data, error } = await supabase
        .from('news').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return ok({ news: data });
    }

    if (action === 'create_news') {
      const { title, content, published, image_url } = payload ?? {};
      if (!title) throw new Error('title manquant');
      const { data, error } = await supabase
        .from('news').insert({ title, content: content ?? '', published: published ?? true, image_url: image_url ?? null })
        .select().single();
      if (error) throw error;
      return ok({ news: data });
    }

    if (action === 'update_news') {
      const { news_id, title, content, published, image_url } = payload ?? {};
      if (!news_id) throw new Error('news_id manquant');
      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;
      if (published !== undefined) updates.published = published;
      if (image_url !== undefined) updates.image_url = image_url;
      const { data, error } = await supabase
        .from('news').update(updates).eq('id', news_id).select().single();
      if (error) throw error;
      return ok({ news: data });
    }

    if (action === 'delete_news') {
      const { news_id } = payload ?? {};
      if (!news_id) throw new Error('news_id manquant');
      const { error } = await supabase.from('news').delete().eq('id', news_id);
      if (error) throw error;
      return ok({ success: true });
    }

    if (action === 'upload_news_image') {
      // payload: { base64, filename, content_type }
      const { base64, filename, content_type } = payload ?? {};
      if (!base64) throw new Error('base64 manquant');
      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const ext = (filename ?? 'image').split('.').pop();
      const path = `news/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('news-images')
        .upload(path, binary, { contentType: content_type ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('news-images').getPublicUrl(path);
      return ok({ url: urlData.publicUrl });
    }

    if (action === 'list_courses') {
      // payload: { from_date?, to_date? } — optionnel pour filtrer par plage
      const { from_date, to_date } = payload ?? {};
      let query = supabase.from('group_courses').select('*').order('course_date').order('start_time');
      if (from_date) query = query.gte('course_date', from_date);
      if (to_date)   query = query.lte('course_date', to_date);
      const { data, error } = await query;
      if (error) throw error;
      return ok({ courses: data });
    }

    if (action === 'create_course') {
      // payload: { course_type, course_date, start_time, end_time, notes?, color?, price? }
      const { course_type, course_date, start_time, end_time, notes, color, price } = payload ?? {};
      if (!course_date) throw new Error('course_date manquant');
      const { data, error } = await supabase
        .from('group_courses')
        .insert({
          course_type: course_type ?? 'collectif',
          course_date, start_time, end_time,
          notes: notes ?? null,
          color: color ?? '#2BABE1',
          price: price ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return ok({ course: data });
    }

    if (action === 'update_course') {
      // payload: { course_id, course_type?, course_date?, start_time?, end_time?, notes?, color?, price? }
      const { course_id, course_type, course_date, start_time, end_time, notes, color, price } = payload ?? {};
      if (!course_id) throw new Error('course_id manquant');
      const updates: Record<string, unknown> = {};
      if (course_type  !== undefined) updates.course_type  = course_type;
      if (course_date  !== undefined) updates.course_date  = course_date;
      if (start_time   !== undefined) updates.start_time   = start_time;
      if (end_time     !== undefined) updates.end_time     = end_time;
      if (notes        !== undefined) updates.notes        = notes;
      if (color        !== undefined) updates.color        = color;
      if (price        !== undefined) updates.price        = price;
      const { data, error } = await supabase
        .from('group_courses').update(updates).eq('id', course_id).select().single();
      if (error) throw error;
      return ok({ course: data });
    }

    if (action === 'delete_course') {
      const { course_id } = payload ?? {};
      if (!course_id) throw new Error('course_id manquant');
      const { error } = await supabase.from('group_courses').delete().eq('id', course_id);
      if (error) throw error;
      return ok({ success: true });
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
