-- ============================================================
-- CaniPlus — SQL setup pour les notifications de rappel vaccin
-- À exécuter dans Supabase → SQL Editor
-- ============================================================

-- 1. Table pour les souscriptions Web Push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own subs" ON push_subscriptions;
CREATE POLICY "users own subs" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- 2. Table pour éviter les doublons de rappels envoyés
CREATE TABLE IF NOT EXISTS vaccine_reminders_sent (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reminder_key TEXT NOT NULL UNIQUE,
  dog_id       UUID REFERENCES dogs(id) ON DELETE CASCADE,
  vaccine_name TEXT NOT NULL,
  next_due_date DATE NOT NULL,
  sent_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vaccine_reminders_sent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only" ON vaccine_reminders_sent;
CREATE POLICY "service role only" ON vaccine_reminders_sent
  FOR ALL TO service_role USING (true);

-- 3. pg_cron : appel quotidien à 8h00 UTC (10h heure suisse)
-- Remplace SUPABASE_SERVICE_ROLE_KEY par la vraie clé service role
-- (disponible dans Supabase → Settings → API)
/*
SELECT cron.schedule(
  'vaccine-reminders-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/vaccine-reminder',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer SUPABASE_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
*/
-- Note : pour activer pg_cron, va dans Supabase → Database → Extensions → cherche "pg_cron" et active-le.
-- Ensuite décommente et exécute le SELECT cron.schedule ci-dessus avec la vraie clé.
