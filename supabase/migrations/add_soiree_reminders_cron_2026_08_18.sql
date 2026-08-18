-- ============================================================================
-- Rappels automatiques des soirées CaniPlus
-- Date : 2026-08-18
-- ----------------------------------------------------------------------------
-- Installe un cron horaire qui appelle l'edge function soiree-emails en mode
-- 'reminders'. La fonction décide elle-même quoi envoyer, à partir de
-- event_date de chaque soirée :
--   · rappel J-1     : fenêtre [event − 26h, event − 1h)  → 18h00 la veille
--                      pour une soirée à 20h00
--   · rappel jour J  : fenêtre [event − 1h, event + 15min) → 19h00 pour 20h00
--
-- Les fenêtres sont larges exprès : si une exécution du cron est manquée, la
-- suivante rattrape l'envoi. Le journal soiree_emails_sent (contrainte UNIQUE
-- sur product_id + email + kind) garantit qu'un même rappel ne part jamais
-- deux fois, y compris si deux exécutions se chevauchent.
--
-- Comme les fenêtres se calculent en millisecondes depuis event_date, il n'y a
-- aucune arithmétique de fuseau ici : le passage heure d'été / heure d'hiver
-- (soirées de novembre à mars) n'a pas d'effet sur l'horaire des rappels.
--
-- Pré-requis :
--   1. Extensions pg_cron + pg_net activées (Dashboard → Database → Extensions)
--   2. Le secret CRON_SECRET défini côté base, comme pour cash-payment-reminder :
--        ALTER DATABASE postgres SET app.settings.cron_secret = '<valeur du secret edge function CRON_SECRET>';
--      Sans ça le header X-Cron-Secret part vide et la fonction répond 401.
--   3. soiree-emails déployée avec --no-verify-jwt : pg_cron n'envoie pas de
--      JWT, uniquement son header. La fonction fait elle-même le contrôle
--      (service role, secret cron, ou profil admin).
-- ============================================================================

-- Idempotence : on retire l'ancien schedule s'il existe avant de le recréer
DO $$
BEGIN
  PERFORM cron.unschedule('soiree-reminders-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'soiree-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/soiree-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{"action":"reminders"}'::jsonb
  ) AS request_id;
  $$
);

-- Vérifications après activation :
--   SELECT * FROM cron.job WHERE jobname = 'soiree-reminders-hourly';
--   SELECT * FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'soiree-reminders-hourly')
--     ORDER BY start_time DESC LIMIT 10;
--
-- Déclenchement manuel pour tester (depuis un terminal) :
--   curl -X POST 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/soiree-emails' \
--     -H 'Content-Type: application/json' \
--     -H 'X-Cron-Secret: <CRON_SECRET>' \
--     -d '{"action":"reminders"}'
--
-- Pour arrêter les rappels :
--   SELECT cron.unschedule('soiree-reminders-hourly');
