// supabase/functions/publish-scheduled-bundles/index.ts
// -----------------------------------------------------------------------------
// Cron horaire : repère les bundles éditoriaux dont scheduled_for est dépassé
// et déclenche leur publication via editorial-bundle-actions.publish.
//
// Appelé toutes les heures pile par pg_cron (cf. migration
// add_scheduled_and_sources_2026_05_26.sql, section 5).
//
// Auth : cron_secret obligatoire. Si manquant ou erroné → 401.
//
// Variables d'environnement :
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto)
//   ADMIN_PASSWORD : pour appeler editorial-bundle-actions
//   CRON_SECRET    : secret partagé avec pg_cron
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
    const { cron_secret, dry_run } = body ?? {};

    const expectedCron  = Deno.env.get('CRON_SECRET') ?? '';
    const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';

    if (!expectedCron || cron_secret !== expectedCron) {
      return fail('Cron secret invalide.', 401);
    }
    if (!expectedAdmin) {
      return fail('ADMIN_PASSWORD non configuré.', 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Tous les bundles dont la date est dépassée et toujours en attente.
    const { data: due, error: dueErr } = await supabase
      .from('editorial_bundles')
      .select('id, theme, scheduled_for')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(20); // jamais plus de 20 par tick pour éviter de saturer

    if (dueErr) throw dueErr;

    const results: Array<Record<string, unknown>> = [];
    const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    for (const b of (due ?? [])) {
      if (dry_run) {
        results.push({ bundle_id: b.id, theme: b.theme, scheduled_for: b.scheduled_for, dry_run: true });
        continue;
      }
      try {
        const r = await fetch(`${supaUrl}/functions/v1/editorial-bundle-actions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'publish_editorial_bundle',
            admin_password: expectedAdmin,
            payload: { bundle_id: b.id },
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) {
          results.push({ bundle_id: b.id, theme: b.theme, ok: false, error: j?.error ?? `HTTP ${r.status}` });
        } else {
          results.push({
            bundle_id: b.id,
            theme: b.theme,
            ok: true,
            article_id: j?.article_id ?? null,
            resource_id: j?.resource_id ?? null,
            push_sent: j?.log?.push?.sent ?? 0,
          });
        }
      } catch (e) {
        results.push({ bundle_id: b.id, theme: b.theme, ok: false, error: (e as Error).message });
      }
    }

    return ok({
      checked_at: new Date().toISOString(),
      due_count: due?.length ?? 0,
      dry_run: !!dry_run,
      results,
    });

  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
