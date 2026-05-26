-- Migration : programmation des publications + sources scientifiques
-- Date : 2026-05-26
--
-- Contexte : on ajoute deux capacités à l'agent éditorial.
--
--   1. PROGRAMMATION DES PUBLICATIONS
--      Tiffany veut générer un bundle, choisir une date de publi (1 à 3 mois
--      d'avance), et le système publie automatiquement le jour J. Pour ça :
--        - nouvelle colonne `scheduled_for TIMESTAMPTZ`
--        - nouveau statut `'scheduled'` (entre validated et published)
--        - un cron Supabase (pg_cron) appelle chaque heure une edge function
--          `publish-scheduled-bundles` qui repère et publie les bundles dûs.
--
--   2. SOURCES SCIENTIFIQUES (Semantic Scholar + PubMed)
--      Quand un thème s'y prête, l'agent récupère 2-3 études peer-reviewed
--      récentes et les cite dans l'article blog et la ressource premium.
--        - nouvelle colonne `scientific_sources JSONB` (array d'objets
--          { title, authors, year, doi, url, source }).
--        - le champ est rempli au moment de generate-editorial-bundle, et
--          Claude décide s'il les cite ou pas selon la pertinence (pas
--          obligatoire pour les sujets légers : été, chiot mignon, etc.).

-- ─── 1. Colonnes ──────────────────────────────────────────────────────
ALTER TABLE public.editorial_bundles
  ADD COLUMN IF NOT EXISTS scheduled_for      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scientific_sources JSONB;

COMMENT ON COLUMN public.editorial_bundles.scheduled_for IS
  'Date et heure à laquelle le bundle doit être publié automatiquement (timezone UTC). NULL si pas programmé.';

COMMENT ON COLUMN public.editorial_bundles.scientific_sources IS
  'Array JSONB des sources scientifiques associées au thème. Forme : [{ title, authors, year, doi, url, source: "semantic_scholar"|"pubmed", abstract_excerpt }]. Rempli par generate-editorial-bundle, cité ou non par Claude selon la pertinence.';

-- ─── 2. Étendre le CHECK statut pour inclure 'scheduled' ──────────────
-- On reconstitue la contrainte CHECK avec la nouvelle valeur.
ALTER TABLE public.editorial_bundles
  DROP CONSTRAINT IF EXISTS editorial_bundles_status_check;

ALTER TABLE public.editorial_bundles
  ADD CONSTRAINT editorial_bundles_status_check CHECK (status IN (
    'proposed',
    'rejected',
    'chosen',
    'drafted',
    'validated',
    'scheduled',   -- nouveau : prêt et planifié, attend scheduled_for
    'published',
    'archived'
  ));

-- ─── 3. Index pour le cron de publication ────────────────────────────
-- Le cron interroge : SELECT id FROM editorial_bundles
--   WHERE status='scheduled' AND scheduled_for <= NOW().
-- Index partiel : seuls les bundles 'scheduled' nous intéressent.
CREATE INDEX IF NOT EXISTS idx_editorial_bundles_scheduled
  ON public.editorial_bundles(scheduled_for)
  WHERE status = 'scheduled';

-- ─── 4. Garde-fou : scheduled_for obligatoire si status='scheduled' ──
-- Empêche d'avoir un bundle scheduled sans date (le cron ne saurait pas
-- quand le publier). On le fait via un trigger plutôt qu'une contrainte
-- pour rester compatible avec les UPDATE partiels.
CREATE OR REPLACE FUNCTION check_editorial_bundles_scheduled_for()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'scheduled' AND NEW.scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Un bundle scheduled doit avoir une scheduled_for non nulle.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_editorial_bundles_check_scheduled ON public.editorial_bundles;
CREATE TRIGGER trg_editorial_bundles_check_scheduled
  BEFORE INSERT OR UPDATE ON public.editorial_bundles
  FOR EACH ROW
  EXECUTE FUNCTION check_editorial_bundles_scheduled_for();

-- ─── 5. Programmation du cron pg_cron ────────────────────────────────
-- On déclenche publish-scheduled-bundles toutes les heures pile. Si un
-- bundle est programmé à 14:32, il sera publié à 15:00. Acceptable pour
-- du contenu éditorial (vs un message urgent).
--
-- Le secret CRON_SECRET doit être configuré dans les Secrets Supabase et
-- ajouté ici via pg_settings ('app.cron_secret'). Pour faciliter, on lit
-- directement depuis le settings (à set côté Supabase dashboard ensuite).
--
-- NB : ce bloc est idempotent : si le job existe déjà, on le remplace.

DO $$
DECLARE
  v_jobid    bigint;
  v_supa_url text;
  v_secret   text;
BEGIN
  -- Lecture des paramètres (configurés via ALTER DATABASE SET app.xxx)
  BEGIN
    v_supa_url := current_setting('app.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN
    v_supa_url := 'https://oncbeqnznrqummxmqxbx.supabase.co';
  END;

  BEGIN
    v_secret := current_setting('app.cron_secret', true);
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  -- Supprime un éventuel job existant pour éviter les doublons
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'publish-scheduled-bundles' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  -- (Re)programme le job toutes les heures pile.
  -- Le payload contient cron_secret pour authentifier l'appel.
  -- Si v_secret est NULL ici (pas encore configuré), on programme quand
  -- même : il suffira de mettre à jour app.cron_secret + relancer la
  -- partie DO ci-après pour activer.
  PERFORM cron.schedule(
    'publish-scheduled-bundles',
    '0 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := '%s/functions/v1/publish-scheduled-bundles',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object('cron_secret', %L)
      );$cmd$,
      v_supa_url,
      COALESCE(v_secret, 'SET_VIA_ALTER_DATABASE')
    )
  );
END $$;

-- ─── 6. Vue : prochaines publications programmées ────────────────────
-- Pratique côté admin pour afficher rapidement la liste à venir.
CREATE OR REPLACE VIEW public.editorial_scheduled_upcoming AS
  SELECT
    id,
    theme,
    theme_slug,
    scheduled_for,
    (content_blog->>'title')    AS blog_title,
    (content_premium->>'title') AS premium_title,
    drafted_at,
    validated_at,
    created_at
  FROM public.editorial_bundles
  WHERE status = 'scheduled'
    AND scheduled_for IS NOT NULL
  ORDER BY scheduled_for ASC;

COMMENT ON VIEW public.editorial_scheduled_upcoming IS
  'Bundles programmés en attente de publication automatique, triés par date croissante.';
