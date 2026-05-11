-- Migration 2026-05-11 : suivi des rappels de paiement cash
--
-- Ajoute un timestamp reminder_sent_at sur subscriptions et private_course_requests
-- pour éviter les doubles envois de rappel 48h avant la séance, et installe
-- un cron horaire qui appelle l'edge function cash-payment-reminder.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

ALTER TABLE public.private_course_requests
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Pré-requis : extensions pg_cron + pg_net activées (Dashboard → Database → Extensions)
-- Pré-requis : le secret CRON_SECRET doit être défini côté DB :
--   ALTER DATABASE postgres SET app.settings.cron_secret = '<même valeur que le secret edge function CRON_SECRET>';
-- (sinon le header X-Cron-Secret sera vide et la fonction renverra 401).

-- Idempotence : on retire l'ancien schedule s'il existe avant de le recréer
DO $$
BEGIN
  PERFORM cron.unschedule('cash-payment-reminder-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cash-payment-reminder-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/cash-payment-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
