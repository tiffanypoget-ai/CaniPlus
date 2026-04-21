-- Migration : boutique guides/ebooks (Phase 3)
-- Date : 2026-04-21
-- Contexte : vente de guides PDF à l'unité (externes + membres)
--
-- Deux tables :
--   - digital_products : catalogue des produits (guides, ebooks, packs)
--   - user_purchases   : historique des achats par utilisateur
--
-- Plus :
--   - Bucket privé `digital-products` dans Supabase Storage
--   - Policies RLS pour accès sécurisé (acheteurs + admins uniquement)
--   - Seed des 3 produits de lancement

-- ─── 1. Table digital_products ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS digital_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,          -- URL-safe : pack-10-fiches-education
  title             TEXT NOT NULL,                  -- Nom affiché
  subtitle          TEXT,                           -- Sous-titre court (sous le titre)
  description       TEXT,                           -- Résumé (vue grille)
  long_description  TEXT,                           -- Description complète (vue détail, markdown)
  price_chf         NUMERIC(10,2) NOT NULL,         -- Prix en CHF
  cover_image_url   TEXT,                           -- Image couverture (bucket article-covers OK)
  file_path         TEXT NOT NULL,                  -- Chemin dans bucket digital-products
  preview_url       TEXT,                           -- Extrait gratuit (URL publique optionnelle)
  pages_count       INT,                            -- Nombre de pages
  category          TEXT DEFAULT 'guide',           -- 'guide', 'pack', 'fiche'
  tags              TEXT[] DEFAULT '{}',
  bullet_points     TEXT[] DEFAULT '{}',            -- Points forts (liste de 3-5 bullets)
  display_order     INT DEFAULT 0,                  -- Ordre d'affichage dans la grille
  is_published      BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digital_products_published ON digital_products(is_published, display_order)
  WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_digital_products_slug ON digital_products(slug);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_digital_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_digital_products_updated_at ON digital_products;
CREATE TRIGGER trg_digital_products_updated_at
  BEFORE UPDATE ON digital_products
  FOR EACH ROW EXECUTE FUNCTION update_digital_products_updated_at();

-- ─── 2. Table user_purchases ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES digital_products(id) ON DELETE RESTRICT,
  stripe_session_id   TEXT UNIQUE,
  amount_chf          NUMERIC(10,2),
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  -- Un utilisateur ne peut acheter qu'une fois le même produit
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON user_purchases(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_purchases_product ON user_purchases(product_id);

-- ─── 3. RLS (Row Level Security) ──────────────────────────────────────
-- digital_products : tout le monde peut lire les produits publiés
ALTER TABLE digital_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "digital_products_select_published" ON digital_products;
CREATE POLICY "digital_products_select_published"
  ON digital_products FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "digital_products_admin_all" ON digital_products;
CREATE POLICY "digital_products_admin_all"
  ON digital_products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- user_purchases : un user voit uniquement ses achats, admin voit tout
ALTER TABLE user_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_purchases_select_own" ON user_purchases;
CREATE POLICY "user_purchases_select_own"
  ON user_purchases FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_purchases_admin_all" ON user_purchases;
CREATE POLICY "user_purchases_admin_all"
  ON user_purchases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- L'INSERT et UPDATE sur user_purchases passent par les Edge Functions avec la service_role_key
-- (pas besoin de policy INSERT pour les users, le front ne doit pas créer d'achats lui-même)

-- ─── 4. Storage bucket privé digital-products ─────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('digital-products', 'digital-products', false)
ON CONFLICT (id) DO NOTHING;

-- Policy : lecture réservée aux acheteurs (via URL signée générée par Edge Function)
-- On ne met PAS de policy SELECT publique : l'accès passe exclusivement par
-- l'Edge Function get-product-download qui utilise la service_role_key et vérifie
-- que l'utilisateur a bien acheté le produit avant de générer l'URL signée.

-- Policy : upload réservé aux admins
DROP POLICY IF EXISTS "digital_products_admin_upload" ON storage.objects;
CREATE POLICY "digital_products_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'digital-products'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "digital_products_admin_delete" ON storage.objects;
CREATE POLICY "digital_products_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'digital-products'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ─── 5. Seed : 3 produits de lancement ────────────────────────────────
-- ⚠️ Après la migration, Tiffany doit :
--   1) Uploader les fichiers PDF dans le bucket digital-products :
--      - pack-10-fiches-education.pdf  (combiner fiche-01 à fiche-10)
--      - premiers-mois-chiot.pdf
--      - langage-canin.pdf
--   2) Uploader les covers dans le bucket article-covers (ou digital-products)
--   3) Mettre à jour cover_image_url si besoin

INSERT INTO digital_products (
  slug, title, subtitle, description, long_description,
  price_chf, file_path, pages_count, category, tags, bullet_points, display_order, is_published
) VALUES
(
  'pack-10-fiches-education',
  'Pack 10 fiches éducation',
  'Les fondamentaux de l''éducation canine positive',
  'Un kit complet pour démarrer l''éducation de ton chien sur des bases saines. Rappel, marche en laisse, socialisation, gestion de la réactivité, propreté du chiot… les 10 sujets essentiels réunis.',
  E'Ce pack rassemble les 10 fiches pratiques que Tiffany utilise avec ses élèves du club CaniPlus, mises à jour et enrichies pour les propriétaires qui veulent progresser chez eux.\n\n**Ce que tu vas trouver dans ce pack :**\n- Fiche 1 : Le rappel qui marche vraiment\n- Fiche 2 : Marche en laisse détendue\n- Fiche 3 : Les signaux d''apaisement\n- Fiche 4 : Socialisation du chiot\n- Fiche 5 : Gérer la réactivité\n- Fiche 6 : Renforcement positif au quotidien\n- Fiche 7 : Anxiété de séparation\n- Fiche 8 : Jeu éducatif\n- Fiche 9 : Propreté du chiot\n- Fiche 10 : Les 10 réflexes du quotidien\n\nChaque fiche est écrite en étapes progressives (pas en jours) pour que ton chien avance à son rythme. Pas de méthodes punitives, pas de gadgets : uniquement des techniques douces et efficaces.',
  29.00,
  'pack-10-fiches-education.pdf',
  40,
  'pack',
  ARRAY['education', 'chiot', 'rappel', 'laisse', 'socialisation'],
  ARRAY[
    '10 fiches pratiques en un seul PDF',
    'Progressions par étapes (pas par jours)',
    'Méthode positive, sans punition',
    'Exemples concrets et exercices guidés'
  ],
  1,
  true
),
(
  'guide-premiers-mois-chiot',
  'Les premiers mois du chiot',
  'Bien démarrer avec un chiot, de l''adoption à 6 mois',
  'Le guide complet pour les nouveaux propriétaires. Socialisation, propreté, mordillement, alimentation, premiers apprentissages : les questions qu''on se pose vraiment.',
  E'Adopter un chiot, c''est magique… et parfois épuisant. Ce guide te donne un chemin clair pour les 6 premiers mois : ce qu''il faut faire, ce qu''il vaut mieux éviter, et comment construire une relation solide dès le début.\n\n**Les thèmes couverts :**\n- La période de socialisation (fenêtre critique jusqu''à 12 semaines)\n- La propreté : méthode douce et efficace\n- Mordillement et dents de lait\n- Premières séparations sereines\n- Alimentation : fréquence, quantités, transitions\n- Premiers apprentissages : assis, couché, rappel, nom\n- Les erreurs les plus courantes à éviter\n\nÉcrit dans un style accessible, avec des exemples et des encadrés ASTUCE/ATTENTION pour aller droit au but.',
  19.00,
  'premiers-mois-chiot.pdf',
  32,
  'guide',
  ARRAY['chiot', 'adoption', 'socialisation', 'proprete', 'debutant'],
  ARRAY[
    'Spécial chiot de 2 à 6 mois',
    'Socialisation sans sur-stimulation',
    'Méthode propreté qui fonctionne',
    'Exemples du quotidien'
  ],
  2,
  true
),
(
  'guide-langage-canin',
  'Comprendre le langage canin',
  'Décoder ton chien pour mieux communiquer avec lui',
  'Apprends à lire les signaux de ton chien : posture, queue, oreilles, regard, vocalisations. Un chien bien compris est un chien qui ne monte pas dans les tours.',
  E'La majorité des problèmes de comportement viennent d''un malentendu entre le chien et son humain. Ce guide t''apprend à lire ce que ton chien te dit — avant qu''il ait besoin de crier.\n\n**Ce que tu vas apprendre :**\n- Les 30 signaux d''apaisement (bâillement, léchage de truffe, détournement du regard…)\n- Posture du corps : queue, oreilles, poils, poids\n- Expressions faciales et regard\n- Vocalisations : aboiements, grognements, couinements\n- Les signaux de stress souvent ignorés\n- Les situations typiques (rencontre, jeu, tension)\n\nIllustré avec des photos et des schémas. Un outil qui change ta relation avec ton chien du jour au lendemain.',
  15.00,
  'langage-canin.pdf',
  28,
  'guide',
  ARRAY['langage', 'communication', 'signaux', 'comportement'],
  ARRAY[
    'Les 30 signaux d''apaisement',
    'Lire la posture du corps',
    'Décoder les vocalisations',
    'Illustré de photos et schémas'
  ],
  3,
  true
)
ON CONFLICT (slug) DO NOTHING;
