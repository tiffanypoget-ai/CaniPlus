-- ============================================================================
-- Migration : table admin_notifications + cron rappel publication
-- Date      : 2026-04-28
-- ----------------------------------------------------------------------------
-- Stocke les notifications adressees aux administrateurs (Tiffany & co).
-- Affichee dans le panel admin via une cloche, et envoyee aussi par push web
-- + email selon le canal configure dans la fonction `notify-admin`.
--
-- Types d'evenements (champ kind) :
--   - payment_received    : paiement Stripe reussi (cotisation, premium, lecon, achat)
--   - private_request     : nouvelle demande de cours prive
--   - new_member          : nouvelle inscription membre
--   - premium_canceled    : resiliation d'abonnement premium
--   - course_canceled     : un membre annule son inscription a un cours
--   - publish_reminder    : rappel mardi 18h pour valider le bundle editorial
--   - newsletter_signup   : nouvelle inscription a la newsletter
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN (
                'payment_received', 'private_request', 'new_member',
                'premium_canceled', 'course_canceled', 'publish_reminder',
                'newsletter_signup'
              )),
  title       TEXT NOT NULL,
  body        TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,         -- NULL = non lu
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour la cloche admin (notifs non lues, recentes en premier)
CREATE INDEX IF NOT EXISTS idx_admin_notifs_unread
  ON public.admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_notifs_recent
  ON public.admin_notifications (created_at DESC);

-- RLS : service role only (l'admin panel passe par admin-query avec mdp)
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only" ON public.admin_notifications;
CREATE POLICY "service role only" ON public.admin_notifications
  FOR ALL TO service_role USING (true);

-- Vue pratique : compteur de non-lus
CREATE OR REPLACE VIEW public.admin_notifications_unread_count AS
  SELECT COUNT(*)::int AS unread_count
  FROM public.admin_notifications
  WHERE read_at IS NULL;

-- ============================================================================
-- pg_cron : rappel publication mardi 18h00 heure suisse
-- ----------------------------------------------------------------------------
-- 18:00 CEST (ete) = 16:00 UTC
-- 18:00 CET  (hiver) = 17:00 UTC
-- On choisit 16:00 UTC (heure d'ete = 18:00 / heure d'hiver = 17:00).
-- L'edge function notify-admin recoit kind=publish_reminder et insere dans la table.
-- ============================================================================

-- Pour annuler :
--   SELECT cron.unschedule('admin-publish-reminder-tuesday');

/*
SELECT cron.schedule(
  'admin-publish-reminder-tuesday',
  '0 16 * * 2',  -- mardi 16:00 UTC
  $$
  SELECT net.http_post(
    url     := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SUPABASE_SERVICE_ROLE_KEY'
    ),
    body    := jsonb_build_object(
      'kind', 'publish_reminder',
      'title', 'Valide le bundle editorial pour mercredi',
      'body', 'C''est mardi 18h. Si le bundle editorial est pret, valide-le maintenant. Sinon il ne partira pas mercredi 9h.'
    )
  ) AS request_id;
  $$
);
*/

-- Verifications utiles :
-- 1. Voir les jobs : SELECT * FROM cron.job;
-- 2. Voir les runs : SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- 3. Tester manuellement : INSERT INTO admin_notifications (kind, title) VALUES ('publish_reminder', 'Test');
