-- Migration : création de la table articles (blog public)
-- Date : 2026-04-21
-- Contexte : Phase 2 — blog public pour acquisition non-membres via SEO
--
-- Cette table stocke les articles du blog publiés :
--   - Dans l'app (pour membres & externes connectés)
--   - Sur caniplus.ch/blog (généré en HTML statique via Edge Function)
--
-- Différent de :
--   - `news` (annonces internes du club, membres uniquement)
--   - `resources` (fiches/vidéos premium, accès payant)

-- ─── 1. Table articles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,           -- URL : /blog/{slug}.html
  title           TEXT NOT NULL,                   -- Titre H1 de l'article
  excerpt         TEXT,                            -- Résumé (liste blog, meta desc fallback)
  content         TEXT NOT NULL,                   -- Contenu HTML de l'article
  cover_image_url TEXT,                            -- Image principale (Supabase Storage)
  cover_image_alt TEXT,                            -- Alt text SEO de l'image

  -- Métadonnées SEO
  meta_title        TEXT,                          -- <title> spécifique (sinon = title)
  meta_description  TEXT,                          -- <meta name="description">
  meta_keywords     TEXT,                          -- <meta name="keywords"> (optionnel)

  -- Organisation
  category        TEXT DEFAULT 'education',        -- ex: 'education', 'comportement', 'sante'
  tags            TEXT[] DEFAULT '{}',             -- mots-clés libres
  read_time_min   INT DEFAULT 5,                   -- temps de lecture estimé

  -- Auteur (pour l'instant toujours Tiffany, mais future-proof)
  author_name     TEXT DEFAULT 'Tiffany Cotting',
  author_role     TEXT DEFAULT 'Éducatrice canine diplômée',

  -- État de publication
  published       BOOLEAN DEFAULT false,
  published_at    TIMESTAMPTZ,                     -- date publique (différente de created_at)
  pushed_to_site  BOOLEAN DEFAULT false,           -- true quand HTML généré sur caniplus.ch
  pushed_at       TIMESTAMPTZ,                     -- dernier push vers GitHub

  -- Stats
  views_count     INT DEFAULT 0,                   -- compteur de vues (dans l'app)

  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Index pour les requêtes courantes ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published, published_at DESC)
  WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category) WHERE published = true;

-- ─── 3. Trigger pour updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Si on passe à published=true et que published_at est null, on le définit
  IF NEW.published = true AND OLD.published = false AND NEW.published_at IS NULL THEN
    NEW.published_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articles_updated_at ON articles;
CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION update_articles_updated_at();

-- ─── 4. RLS (Row Level Security) ──────────────────────────────────────
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les articles publiés (y compris visiteurs anonymes)
DROP POLICY IF EXISTS "articles_select_published" ON articles;
CREATE POLICY "articles_select_published"
  ON articles FOR SELECT
  USING (published = true);

-- Les admins peuvent tout faire
DROP POLICY IF EXISTS "articles_admin_all" ON articles;
CREATE POLICY "articles_admin_all"
  ON articles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ─── 5. Storage bucket pour les images de couverture ──────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-covers', 'article-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Policy : lecture publique des images
DROP POLICY IF EXISTS "article_covers_public_read" ON storage.objects;
CREATE POLICY "article_covers_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'article-covers');

-- Policy : seuls les admins peuvent uploader
DROP POLICY IF EXISTS "article_covers_admin_upload" ON storage.objects;
CREATE POLICY "article_covers_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'article-covers'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy : seuls les admins peuvent supprimer
DROP POLICY IF EXISTS "article_covers_admin_delete" ON storage.objects;
CREATE POLICY "article_covers_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'article-covers'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
