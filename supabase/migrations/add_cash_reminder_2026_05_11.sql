-- Migration 2026-05-11 : suivi des rappels de paiement cash
--
-- Ajoute un timestamp reminder_sent_at sur subscriptions et private_course_requests
-- pour éviter les doubles envois de rappel 48h avant la séance.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

ALTER TABLE public.private_course_requests
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Cron horaire pour cash-payment-reminder
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
