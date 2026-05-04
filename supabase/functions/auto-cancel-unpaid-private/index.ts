// supabase/functions/auto-cancel-unpaid-private/index.ts
// Cron : annule automatiquement les cours privés confirmés mais non payés
// quand la date du cours approche, pour libérer le créneau côté Tiffany.
//
// Logique (mise à jour 4 mai 2026) :
//   - Cherche private_course_requests où :
//       status = 'confirmed'
//       payment_status = 'pending'
//       chosen_slot.date + chosen_slot.start < now() + 48h
//     (= le cours commence dans MOINS de 48h ET pas encore payé)
//   - Pour chaque demande : passe status='cancelled', notifie le client + admin
//
// Avant : on annulait 48h APRÈS confirmation, ce qui annulait des cours
// payés en cash/twint dont le webhook Stripe n'avait pas mis à jour le
// payment_status, et des cours réservés très en avance dont le client
// avait toute la marge pour payer.
//
// Lancé via pg_cron Supabase, par exemple toutes les heures :
//   SELECT cron.schedule('auto-cancel-unpaid', '0 * * * *',
//     $$ SELECT net.http_post(
//          url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/auto-cancel-unpaid-private',
//          headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.cron_token'))
//        ); $$);
//
// Sécurité : la fonction utilise verify_jwt=false pour pouvoir être appelée par
// pg_cron. On vérifie un token spécifique CRON_SECRET passé en header pour bloquer
// les appels externes non autorisés.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Délai (en heures) avant le cours en dessous duquel on annule si toujours impayé.
// Au-delà, on laisse au client le temps de payer (Stripe/TWINT/cash + webhook).
const CANCEL_BEFORE_HOURS = 48;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Vérification token cron (optionnel mais conseillé)
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (cronSecret) {
      const auth = req.headers.get('authorization') ?? '';
      const provided = auth.replace(/^Bearer\s+/i, '');
      if (provided !== cronSecret) {
        // On accepte aussi le service role key (au cas où on appelle depuis dashboard)
        const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        if (provided !== srk) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── 1. Trouver les demandes à annuler ────────────────────────────────
    // Récupère TOUTES les demandes confirmées impayées, puis filtre côté code
    // sur la date du cours (chosen_slot est un JSONB difficile à comparer en
    // PostgREST simple).
    const { data: candidates, error: selErr } = await supabase
      .from('private_course_requests')
      .select('id, user_id, chosen_slot, price_chf, profiles(full_name, email)')
      .eq('status', 'confirmed')
      .eq('payment_status', 'pending');

    if (selErr) throw selErr;

    // Filtre : ne garder que celles où la date du cours est dans moins de 48h.
    // Si chosen_slot est null ou mal formé : on skip (sécurité).
    const cutoff = Date.now() + CANCEL_BEFORE_HOURS * 60 * 60 * 1000;
    const stale = (candidates ?? []).filter((r: any) => {
      const slot = r.chosen_slot as { date?: string; start?: string } | null;
      if (!slot?.date) return false;
      const courseTime = new Date(`${slot.date}T${slot.start || '00:00'}:00`).getTime();
      if (Number.isNaN(courseTime)) return false;
      // Annule uniquement si le cours est dans le futur ET dans moins de 48h.
      // Si déjà passé, on laisse (cas pathologique, intervention manuelle).
      return courseTime > Date.now() && courseTime < cutoff;
    });

    if (!stale || stale.length === 0) {
      return new Response(JSON.stringify({ cancelled: 0, scanned: 0, message: 'Aucune demande à annuler.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Pour chacune : status='cancelled' + notifs ────────────────────
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const req of stale) {
      try {
        const slot = req.chosen_slot as { date?: string; start?: string } | null;
        const slotLabel = slot?.date && slot?.start
          ? ` du ${slot.date} à ${slot.start}`
          : '';
        const amount = Number(req.price_chf || 60);

        // Update DB : status='cancelled', payment_status reste 'pending' (ou on peut mettre 'failed')
        const { error: updErr } = await supabase
          .from('private_course_requests')
          .update({ status: 'cancelled', payment_status: 'failed' })
          .eq('id', req.id);
        if (updErr) throw updErr;

        // Notif client (in-app)
        await supabase.from('notifications').insert({
          user_id: req.user_id,
          type: 'private_auto_cancelled',
          title: 'Cours privé annulé',
          body: `Ton cours privé${slotLabel} a été automatiquement annulé : pas de paiement reçu et le cours approche (moins de ${CANCEL_BEFORE_HOURS}h). Tu peux refaire une demande quand tu veux.`,
          metadata: { request_id: req.id, amount, link: '/planning' },
        });

        // Notif admin
        try {
          const memberLabel = req.profiles?.full_name || req.profiles?.email || 'un membre';
          await supabase.functions.invoke('notify-admin', {
            body: {
              kind: 'course_canceled',
              title: 'Cours privé auto-annulé (non payé)',
              body: `${memberLabel} n'a pas payé son cours privé${slotLabel} (cours dans moins de ${CANCEL_BEFORE_HOURS}h). Le créneau est libéré.`,
              metadata: { type: 'private_auto_cancel', user_id: req.user_id, request_id: req.id },
            },
          });
        } catch (_) { /* notif admin optionnelle */ }

        results.push({ id: req.id, ok: true });
      } catch (e) {
        results.push({ id: req.id, ok: false, error: (e as Error)?.message ?? String(e) });
      }
    }

    const cancelled = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({
      scanned: stale.length,
      cancelled,
      failed: results.length - cancelled,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = (err as any)?.message ?? String(err) ?? 'Erreur inconnue';
    console.error('auto-cancel-unpaid-private error:', JSON.stringify(err));
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
