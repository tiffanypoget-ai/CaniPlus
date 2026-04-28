-- ============================================================================
-- Migration : pg_cron pour la newsletter hebdomadaire CaniPlus
-- Date      : 2026-04-28
-- ----------------------------------------------------------------------------
-- Schedule : tous les mercredis a 07:00 UTC.
--   - Heure d'ete (CEST = UTC+2) : 09:00 heure suisse
--   - Heure d'hiver (CET = UTC+1) : 08:00 heure suisse
-- Note     : pg_cron ne gere pas le DST. Pour rester pile a 09:00 toute l'annee
--            il faudrait deux jobs alternes (un pour CEST, un pour CET) declenches
--            par une fonction qui detecte la saison. Pour l'instant on accepte
--            le drift d'1h en hiver (08:00 au lieu de 09:00) — pas critique pour
--            une newsletter B2C.
--
-- Pour activer :
--   1. Active l'extension pg_cron : Database > Extensions > pg_cron
--   2. Active l'extension http : Database > Extensions > http (ou pg_net)
--   3. Decommente le SELECT cron.schedule(...) ci-dessous
--   4. Remplace SUPABASE_SERVICE_ROLE_KEY par la vraie cle (Settings > API)
--   5. Execute ce script dans le SQL Editor
-- ============================================================================

-- Pour annuler un envoi prevu :
--   SELECT cron.unschedule('weekly-newsletter-wednesday');

-- Pour declencher manuellement (test) :
--   curl -X POST 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/weekly-newsletter' \
--     -H 'Content-Type: application/json' \
--     -d '{"admin_password":"<ADMIN_PASSWORD>","dry_run":true}'

/*
SELECT cron.schedule(
  'weekly-newsletter-wednesday',
  '0 7 * * 3',   -- mercredi 07:00 UTC = 09:00 CEST (ete) / 08:00 CET (hiver)
  $$
  SELECT net.http_post(
    url     := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/weekly-newsletter',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SUPABASE_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
*/

-- Verifications utiles apres activation :
-- 1. Voir tous les jobs planifies :
--      SELECT * FROM cron.job;
-- 2. Voir les dernieres executions :
--      SELECT * FROM cron.job_run_details
--      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'weekly-newsletter-wednesday')
--      ORDER BY start_time DESC LIMIT 10;
