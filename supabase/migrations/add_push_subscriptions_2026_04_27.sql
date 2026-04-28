-- supabase/migrations/add_push_subscriptions_2026_04_27.sql
-- Table push_subscriptions : referencee par save-push-subscription et vaccine-reminder
-- mais jamais creee. Ajoutee pour Phase 2c (publication automatique des bundles editoriaux).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user manages own sub" ON public.push_subscriptions;
CREATE POLICY "user manages own sub" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "service role full" ON public.push_subscriptions;
CREATE POLICY "service role full" ON public.push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);
