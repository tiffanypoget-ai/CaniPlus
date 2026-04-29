// supabase/functions/admin-query/index.ts
// Endpoint admin protege par mot de passe - liste membres, abonnements, chiens, et actions admin.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Notifie les membres ayant une cotisation annuelle payee pour l'annee du cours.
// kind = 'cours_cree' | 'cours_modifie' | 'cours_annule'
// course doit contenir au minimum : id, course_date, start_time, course_type
async function notifyCourseMembers(supabase: any, course: any, kind: string): Promise<{ inserted: number } | { error: string }> {
  try {
    if (!course?.course_date) return { error: 'course_date manquant' };
    const year = new Date(course.course_date).getFullYear();

    const { data: subs, error: subErr } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('type', 'cotisation_annuelle')
      .eq('status', 'paid')
      .eq('year', year);
    if (subErr) return { error: subErr.message };
    if (!subs || subs.length === 0) return { inserted: 0 };

    const titles: Record<string, string> = {
      cours_cree: 'Nouveau cours au planning',
      cours_modifie: 'Cours modifie',
      cours_annule: 'Cours annule',
    };

    const date = new Date(course.course_date);
    const dateStr = date.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
    const time = (course.start_time ?? '').toString().slice(0, 5);
    const ctype = course.course_type ?? 'collectif';
    const body = `Cours ${ctype} le ${dateStr}${time ? ' a ' + time : ''}`;

    const rows = subs.map((s: { user_id: string }) => ({
      user_id: s.user_id,
      type: kind,
      title: titles[kind] ?? 'Cours',
      body,
      metadata: { course_id: course.id, course_date: course.course_date, course_type: ctype },
    }));

    const { error: insErr } = await supabase.from('notifications').insert(rows);
    if (insErr) return { error: insErr.message };
    return { inserted: rows.length };
  } catch (e) {
    return { error: (e as Error).message };
  }
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
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (action === 'list_members') {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ok({ members: data });
    }

    if (action === 'delete_member') {
      const { user_id } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');
      await supabase.from('payments').delete().eq('user_id', user_id);
      await supabase.from('subscriptions').delete().eq('user_id', user_id);
      await supabase.from('dogs').delete().eq('owner_id', user_id);
      await supabase.from('private_course_requests').delete().eq('user_id', user_id);
      await supabase.from('course_attendance').delete().eq('user_id', user_id);
      await supabase.from('profiles').delete().eq('id', user_id);
      const authRes = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users/${user_id}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
          },
        }
      );
      if (!authRes.ok) {
        const errBody = await authRes.text();
        throw new Error('Erreur suppression auth: ' + errBody);
      }
      return ok({ success: true });
    }

    if (action === 'list_subscriptions') {
      const { data: subs, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const userIds = [...new Set((subs ?? []).map((s: any) => s.user_id).filter(Boolean))];
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        for (const p of (profiles ?? [])) {
          profilesMap[p.id] = p;
        }
      }
      const flat = (subs ?? []).map((s: any) => ({
        ...s,
        user_email: profilesMap[s.user_id]?.email ?? null,
        user_name: profilesMap[s.user_id]?.full_name ?? null,
      }));
      return ok({ subscriptions: flat });
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
      const { user_id, status } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');
      const year = new Date().getFullYear();
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
      const { user_id, lesson_date, lesson_notes } = payload ?? {};
      if (!user_id) throw new Error('user_id manquant');

      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user_id)
        .eq('type', 'lecon_privee')
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('subscriptions')
          .update({ lesson_date: lesson_date ?? null, lesson_notes: lesson_notes ?? null })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return ok({ subscription: data });
      } else {
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
      const { from_date, to_date } = payload ?? {};
      let query = supabase.from('group_courses').select('*').order('course_date').order('start_time');
      if (from_date) query = query.gte('course_date', from_date);
      if (to_date)   query = query.lte('course_date', to_date);
      const { data, error } = await query;
      if (error) throw error;
      return ok({ courses: data });
    }

    if (action === 'create_course') {
      const { course_type, course_date, start_time, end_time, notes, color, price, notify } = payload ?? {};
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
      let notifResult = null;
      if (notify === true) {
        notifResult = await notifyCourseMembers(supabase, data, 'cours_cree');
      }
      return ok({ course: data, notifications: notifResult });
    }

    if (action === 'update_course') {
      const { course_id, course_type, course_date, start_time, end_time, notes, color, price, notify } = payload ?? {};
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
      let notifResult = null;
      if (notify === true) {
        notifResult = await notifyCourseMembers(supabase, data, 'cours_modifie');
      }
      return ok({ course: data, notifications: notifResult });
    }

    if (action === 'delete_course') {
      const { course_id, notify } = payload ?? {};
      if (!course_id) throw new Error('course_id manquant');
      // Pour notifier, recupere d'abord le cours avant de le supprimer
      let courseSnapshot: any = null;
      if (notify === true) {
        const { data: snap } = await supabase
          .from('group_courses')
          .select('id, course_type, course_date, start_time')
          .eq('id', course_id)
          .single();
        courseSnapshot = snap;
      }
      const { error } = await supabase.from('group_courses').delete().eq('id', course_id);
      if (error) throw error;
      let notifResult = null;
      if (notify === true && courseSnapshot) {
        notifResult = await notifyCourseMembers(supabase, courseSnapshot, 'cours_annule');
      }
      return ok({ success: true, notifications: notifResult });
    }

    // Notification manuelle envoyee par l'admin a un user specifique ou a tous les membres.
    // payload : { target: 'all_members' | 'one_user', user_id?, title, body, link? }
    if (action === 'send_manual_notification') {
      const { target, user_id, title, body, link } = payload ?? {};
      if (!title) throw new Error('title manquant');
      if (target !== 'all_members' && target !== 'one_user') {
        throw new Error("target doit etre 'all_members' ou 'one_user'");
      }
      if (target === 'one_user' && !user_id) throw new Error('user_id manquant pour target=one_user');

      let userIds: string[] = [];
      if (target === 'one_user') {
        userIds = [user_id];
      } else {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id')
          .neq('user_type', 'external');
        if (pErr) throw pErr;
        userIds = (profs ?? []).map((p: { id: string }) => p.id);
      }

      if (userIds.length === 0) return ok({ inserted: 0 });

      const rows = userIds.map((uid) => ({
        user_id: uid,
        type: 'admin_manuelle',
        title,
        body: body ?? null,
        metadata: link ? { link } : {},
      }));

      const { error: insErr } = await supabase.from('notifications').insert(rows);
      if (insErr) throw insErr;

      // Push web (cloche du systeme + iPhone/Android) : on delegue a
      // editorial-bundle-actions qui a deja toute la mecanique VAPID + crypto.
      // Erreur isolee : si le push echoue, l'INSERT est deja fait → la notif
      // apparait quand meme dans la cloche in-app, on n'echoue pas la requete.
      let pushResult: unknown = { skipped: 'push non-tente' };
      try {
        const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const r = await fetch(`${supaUrl}/functions/v1/editorial-bundle-actions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_push_batch',
            admin_password,
            payload: {
              user_ids: userIds,
              title,
              body: body ?? title,
              url: link ?? undefined,
            },
          }),
        });
        pushResult = await r.json().catch(() => ({ error: `status ${r.status}` }));
      } catch (e) {
        pushResult = { error: (e as Error).message };
      }

      return ok({ inserted: rows.length, target, push: pushResult });
    }

    if (action === 'set_course_type') {
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

    if (action === 'list_articles') {
      const { only_published } = payload ?? {};
      let query = supabase.from('articles').select('*').order('created_at', { ascending: false });
      if (only_published) query = query.eq('published', true);
      const { data, error } = await query;
      if (error) throw error;
      return ok({ articles: data });
    }

    if (action === 'get_article') {
      const { article_id, slug } = payload ?? {};
      if (!article_id && !slug) throw new Error('article_id ou slug manquant');
      let query = supabase.from('articles').select('*');
      if (article_id) query = query.eq('id', article_id);
      else query = query.eq('slug', slug);
      const { data, error } = await query.single();
      if (error) throw error;
      return ok({ article: data });
    }

    if (action === 'create_article') {
      const p = payload ?? {};
      if (!p.slug || !p.title || !p.content) throw new Error('slug, title, content requis');
      const insert: Record<string, unknown> = {
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt ?? null,
        content: p.content,
        cover_image_url: p.cover_image_url ?? null,
        cover_image_alt: p.cover_image_alt ?? null,
        meta_title: p.meta_title ?? null,
        meta_description: p.meta_description ?? null,
        meta_keywords: p.meta_keywords ?? null,
        category: p.category ?? 'education',
        tags: p.tags ?? [],
        read_time_min: p.read_time_min ?? 5,
        published: !!p.published,
      };
      if (p.published) insert.published_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('articles')
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return ok({ article: data });
    }

    if (action === 'update_article') {
      const { article_id, ...fields } = payload ?? {};
      if (!article_id) throw new Error('article_id manquant');
      const updates: Record<string, unknown> = {};
      const allowed = ['slug', 'title', 'excerpt', 'content', 'cover_image_url', 'cover_image_alt',
        'meta_title', 'meta_description', 'meta_keywords', 'category', 'tags', 'read_time_min',
        'published', 'published_at', 'pushed_to_site', 'pushed_at'];
      for (const k of allowed) {
        if (fields[k] !== undefined) updates[k] = fields[k];
      }
      const { data, error } = await supabase
        .from('articles')
        .update(updates)
        .eq('id', article_id)
        .select()
        .single();
      if (error) throw error;
      return ok({ article: data });
    }

    if (action === 'delete_article') {
      const { article_id } = payload ?? {};
      if (!article_id) throw new Error('article_id manquant');
      const { error } = await supabase.from('articles').delete().eq('id', article_id);
      if (error) throw error;
      return ok({ success: true });
    }

    if (action === 'upload_article_cover') {
      const { base64, filename, content_type } = payload ?? {};
      if (!base64) throw new Error('base64 manquant');
      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const ext = (filename ?? 'image').split('.').pop();
      const path = `covers/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('article-covers')
        .upload(path, binary, { contentType: content_type ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('article-covers').getPublicUrl(path);
      return ok({ url: urlData.publicUrl });
    }

    if (action === 'list_editorial_proposals') {
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

      return ok({ batch_id: lastBatch.proposal_batch_id, proposals: proposals ?? [] });
    }

    if (action === 'choose_editorial_theme') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');

      const { data: target, error: e1 } = await supabase
        .from('editorial_bundles')
        .select('id, proposal_batch_id, status')
        .eq('id', bundle_id)
        .single();
      if (e1) throw e1;
      if (target.status !== 'proposed') {
        throw new Error("Ce theme n'est plus a l'etat 'proposed' (statut actuel : " + target.status + ")");
      }

      const { error: e2 } = await supabase
        .from('editorial_bundles')
        .update({ status: 'rejected' })
        .eq('proposal_batch_id', target.proposal_batch_id)
        .neq('id', bundle_id)
        .eq('status', 'proposed');
      if (e2) throw e2;

      const { data: chosen, error: e3 } = await supabase
        .from('editorial_bundles')
        .update({ status: 'chosen' })
        .eq('id', bundle_id)
        .select()
        .single();
      if (e3) throw e3;

      return ok({ bundle: chosen });
    }

    if (action === 'list_editorial_bundles') {
      const { data, error } = await supabase
        .from('editorial_bundles')
        .select('id, theme, theme_slug, theme_description, status, proposed_at, chosen_at, drafted_at, validated_at, published_at, article_id')
        .not('status', 'in', '("proposed","rejected","archived")')
        .order('proposed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ok({ bundles: data ?? [] });
    }

    if (action === 'archive_editorial_bundle') {
      const { bundle_id } = payload ?? {};
      if (!bundle_id) throw new Error('bundle_id manquant');
      const { error } = await supabase
        .from('editorial_bundles')
        .update({ status: 'archived' })
        .eq('id', bundle_id);
      if (error) throw error;
      return ok({ success: true });
    }

    if (action === 'trigger_propose_themes') {
      const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const res = await fetch(`${supaUrl}/functions/v1/propose-editorial-themes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ admin_password }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error('propose-editorial-themes : ' + (data?.error ?? res.status));
      }
      return ok(data);
    }

    if (action === 'list_admin_notifications') {
      const limit = payload?.limit ?? 50;
      const onlyUnread = payload?.only_unread === true;
      let q = supabase
        .from('admin_notifications')
        .select('id, kind, title, body, metadata, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (onlyUnread) q = q.is('read_at', null);
      const { data, error } = await q;
      if (error) throw error;
      const { count: unreadCount } = await supabase
        .from('admin_notifications')
        .select('*', { count: 'exact', head: true })
        .is('read_at', null);
      return ok({ notifications: data ?? [], unread_count: unreadCount ?? 0 });
    }

    if (action === 'mark_admin_notification_read') {
      const { notification_id, mark_all } = payload ?? {};
      if (mark_all) {
        const { error } = await supabase
          .from('admin_notifications')
          .update({ read_at: new Date().toISOString() })
          .is('read_at', null);
        if (error) throw error;
        return ok({ success: true, scope: 'all' });
      }
      if (!notification_id) throw new Error('notification_id manquant');
      const { error } = await supabase
        .from('admin_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notification_id);
      if (error) throw error;
      return ok({ success: true });
    }

    if (action === 'delete_admin_notification') {
      const { notification_id } = payload ?? {};
      if (!notification_id) throw new Error('notification_id manquant');
      const { error } = await supabase.from('admin_notifications').delete().eq('id', notification_id);
      if (error) throw error;
      return ok({ success: true });
    }

    throw new Error('Action inconnue : ' + action);

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

function ok(data: unknown) {
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
