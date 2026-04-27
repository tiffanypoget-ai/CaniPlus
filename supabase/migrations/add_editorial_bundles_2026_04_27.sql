-- Migration : agent éditorial automatisé
-- Date : 2026-04-27
-- Contexte : Phase 1 — fondation pour l'agent qui propose chaque lundi
-- 3 thèmes éditoriaux, puis génère le bundle complet (blog + ressource premium
-- + carrousel Insta + post Google Business + notification in-app) une fois
-- qu'un thème est choisi.

-- ─── 1. Table editorial_bundles ───────────────────────────────────────
-- Un bundle = un thème éditorial dans son cycle de vie :
--   proposed → chosen → drafted → validated → published
-- Les 3 propositions d'une même semaine partagent le même proposal_batch_id.
CREATE TABLE IF NOT EXISTS editorial_bundles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Regroupement : les 3 propositions d'un même lundi ont le même batch_id
  proposal_batch_id   UUID NOT NULL,
  proposed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Le thème lui-même
  theme               TEXT NOT NULL,             -- "La marche en laisse sereine"
  theme_slug          TEXT NOT NULL,             -- "marche-en-laisse-sereine"
  theme_description   TEXT,                       -- angle, ce que ça apporte au lecteur
  theme_rationale     TEXT,                       -- pourquoi ce thème (saison, gap, besoin)

  -- Statut dans le pipeline
  status              TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed',    -- généré par l'agent, en attente de choix
    'rejected',    -- non choisi par Tiffany ce lundi-là
    'chosen',      -- choisi, en attente de génération du contenu
    'drafted',     -- contenu généré, en attente de validation
    'validated',   -- relu et corrigé par Tiffany
    'published',   -- publié sur les canaux
    'archived'     -- ancien bundle archivé
  )),

  -- Timestamps du cycle de vie
  chosen_at           TIMESTAMPTZ,
  drafted_at          TIMESTAMPTZ,
  validated_at        TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,

  -- Contenu généré (rempli en Phase 2 par generate-editorial-bundle)
  content_blog              JSONB,   -- { title, slug, excerpt, content, category, tags, meta_title, meta_description, cover_image_alt, read_time_min }
  content_premium           JSONB,   -- { title, body, structure }
  content_instagram         JSONB,   -- { caption, hashtags, slides: [{ title, body }, ...] }
  content_google_business   JSONB,   -- { title, body, cta }
  content_notification      JSONB,   -- { title, body }

  -- Lien vers l'article publié (table articles existante)
  article_id          UUID REFERENCES articles(id) ON DELETE SET NULL,

  -- Métadonnées
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Index ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_editorial_bundles_status
  ON editorial_bundles(status, proposed_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_bundles_batch
  ON editorial_bundles(proposal_batch_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_bundles_slug_active
  ON editorial_bundles(theme_slug)
  WHERE status NOT IN ('proposed', 'rejected', 'archived');

-- ─── 3. Trigger updated_at + transitions automatiques ─────────────────
CREATE OR REPLACE FUNCTION update_editorial_bundles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();

  -- Transitions automatiques de timestamps selon le changement de statut
  IF NEW.status = 'chosen'    AND OLD.status <> 'chosen'    AND NEW.chosen_at    IS NULL THEN NEW.chosen_at    = NOW(); END IF;
  IF NEW.status = 'drafted'   AND OLD.status <> 'drafted'   AND NEW.drafted_at   IS NULL THEN NEW.drafted_at   = NOW(); END IF;
  IF NEW.status = 'validated' AND OLD.status <> 'validated' AND NEW.validated_at IS NULL THEN NEW.validated_at = NOW(); END IF;
  IF NEW.status = 'published' AND OLD.status <> 'published' AND NEW.published_at IS NULL THEN NEW.published_at = NOW(); END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_editorial_bundles_updated_at ON editorial_bundles;
CREATE TRIGGER trg_editorial_bundles_updated_at
  BEFORE UPDATE ON editorial_bundles
  FOR EACH ROW
  EXECUTE FUNCTION update_editorial_bundles_updated_at();

-- ─── 4. RLS ───────────────────────────────────────────────────────────
-- Aucun accès direct aux clients : tout passe par admin-query (service role).
ALTER TABLE editorial_bundles ENABLE ROW LEVEL SECURITY;

-- Aucune policy permissive = aucun accès via le client anon/authenticated.
-- Le service role (utilisé par les edge functions) bypasse RLS.

-- ─── 5. Vue : thèmes déjà couverts (anti-doublons) ────────────────────
-- Unifie les thèmes des bundles (chosen+) ET des articles publiés
-- (qui pré-existaient avant la mise en place de l'agent).
-- C'est cette vue que l'agent lira pour éviter de proposer des sujets déjà traités.
CREATE OR REPLACE VIEW editorial_themes_covered AS
  SELECT
    theme         AS theme,
    theme_slug    AS slug,
    COALESCE(chosen_at, proposed_at) AS covered_at,
    'bundle'      AS source,
    status        AS status
  FROM editorial_bundles
  WHERE status NOT IN ('proposed', 'rejected')

  UNION ALL

  SELECT
    title         AS theme,
    slug          AS slug,
    published_at  AS covered_at,
    'article'     AS source,
    'legacy'      AS status
  FROM articles
  WHERE published = true
    AND NOT EXISTS (
      -- Évite de compter 2 fois un article qui aurait été créé via bundle
      SELECT 1 FROM editorial_bundles eb WHERE eb.article_id = articles.id
    );

-- ─── 6. Commentaires ──────────────────────────────────────────────────
COMMENT ON TABLE editorial_bundles IS
  'Pipeline de l''agent éditorial : 3 thèmes proposés chaque lundi, un est choisi, le bundle de contenu est généré, validé, puis publié.';

COMMENT ON COLUMN editorial_bundles.proposal_batch_id IS
  'Identifiant commun aux 3 propositions générées simultanément par l''agent.';

COMMENT ON COLUMN editorial_bundles.content_blog IS
  'JSONB. Rempli en Phase 2 par generate-editorial-bundle. Forme : { title, slug, excerpt, content, category, tags, meta_title, meta_description, cover_image_alt, read_time_min }';

COMMENT ON VIEW editorial_themes_covered IS
  'Vue agrégée des thèmes déjà couverts (bundles + articles publiés). Utilisée par propose-editorial-themes pour éviter les doublons.';
