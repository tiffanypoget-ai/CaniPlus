-- ============================================================================
-- Les soirées CaniPlus — webinaires payants (prestation raison individuelle)
-- Créé le 13 juillet 2026.
--
-- Modèle retenu : on ÉTEND digital_products (category='soiree') pour réutiliser
-- tel quel le tunnel produit existant (create-product-checkout → stripe-webhook
-- → user_purchases). Les informations SENSIBLES (lien Zoom, replay Bunny) vont
-- dans une table séparée webinar_access SANS lecture publique : digital_products
-- est lisible par tous quand is_published=true, il ne doit donc contenir aucun
-- secret. L'accès acheteur passe par l'edge function get-webinar-access.
-- ============================================================================

-- ── 1. digital_products : champs événement (informations publiques) ─────────
ALTER TABLE digital_products ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ;
ALTER TABLE digital_products ADD COLUMN IF NOT EXISTS event_duration_min INTEGER;

-- Une soirée est créée avant que son PDF de support existe : file_path devient
-- optionnel. get-product-download et get-webinar-access gèrent le cas NULL.
ALTER TABLE digital_products ALTER COLUMN file_path DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_digital_products_category_event
  ON digital_products (category, event_date);

-- ── 2. user_purchases : code promo utilisé ──────────────────────────────────
-- Stocké (normalisé en majuscules) pour appliquer la règle « un code promo ne
-- sert qu'une seule fois par client » : create-product-checkout refuse un code
-- déjà présent sur un achat payé du même utilisateur.
ALTER TABLE user_purchases ADD COLUMN IF NOT EXISTS promo_code TEXT;

CREATE INDEX IF NOT EXISTS idx_user_purchases_promo
  ON user_purchases (user_id, promo_code)
  WHERE promo_code IS NOT NULL;

-- ── 3. webinar_access : secrets d'accès d'une soirée ────────────────────────
-- zoom_url        : lien unique de la séance Zoom (visible acheteurs uniquement)
-- bunny_video_id  : identifiant du replay Bunny Stream, rempli après la soirée.
--                   Format accepté : "librairieId/videoGuid" ou URL d'embed
--                   complète (get-webinar-access construit l'URL d'iframe).
CREATE TABLE IF NOT EXISTS webinar_access (
  product_id     UUID PRIMARY KEY REFERENCES digital_products(id) ON DELETE CASCADE,
  zoom_url       TEXT,
  bunny_video_id TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_webinar_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_webinar_access_updated_at ON webinar_access;
CREATE TRIGGER trg_webinar_access_updated_at
  BEFORE UPDATE ON webinar_access
  FOR EACH ROW EXECUTE FUNCTION set_webinar_access_updated_at();

-- ── 4. RLS webinar_access ───────────────────────────────────────────────────
-- AUCUNE policy SELECT publique : seuls les admins (gestion) et le service_role
-- (edge functions, qui vérifient l'achat payé) peuvent lire cette table.
ALTER TABLE webinar_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webinar_access_admin_all ON webinar_access;
CREATE POLICY webinar_access_admin_all ON webinar_access
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
