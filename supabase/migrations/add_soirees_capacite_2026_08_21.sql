-- ============================================================================
-- Soirées CaniPlus — limite de places (8 à 20 participants)
-- 21.08.2026
--
-- Décision Tiffany : une soirée se tient entre 8 et 20 personnes.
--   · 20 = plafond dur, imposé au moment du paiement (on refuse la 21e).
--   · 8  = seuil bas indicatif, affiché à l'admin. Aucun blocage automatique :
--          c'est Tiffany qui décide de maintenir ou d'annuler une soirée.
--
-- La colonne est nullable : les guides PDF de la boutique n'ont pas de limite
-- de places, capacity IS NULL veut dire « places illimitées ».
-- ============================================================================

-- ── 1. Colonne capacity ─────────────────────────────────────────────────────
ALTER TABLE public.digital_products
  ADD COLUMN IF NOT EXISTS capacity INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'digital_products_capacity_positive'
  ) THEN
    ALTER TABLE public.digital_products
      ADD CONSTRAINT digital_products_capacity_positive
      CHECK (capacity IS NULL OR capacity > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.digital_products.capacity IS
  'Nombre maximum d''inscriptions payées. NULL = illimité (guides PDF). 20 pour les soirées.';

-- ── 2. Plafond à 20 sur les soirées existantes ──────────────────────────────
UPDATE public.digital_products
   SET capacity = 20
 WHERE category = 'soiree'
   AND capacity IS NULL;

-- ── 3. Compteur de places, lisible publiquement ─────────────────────────────
-- user_purchases est protégé par RLS (chacun ne voit que ses achats). Compter
-- les inscrits demande donc SECURITY DEFINER. La fonction ne renvoie qu'un
-- nombre : aucune donnée personnelle ne fuit, et elle refuse tout produit qui
-- n'est pas une soirée publiée.
CREATE OR REPLACE FUNCTION public.soiree_places(p_slug TEXT)
RETURNS TABLE (capacity INTEGER, inscrits INTEGER, places_restantes INTEGER, complet BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_cap INTEGER;
  v_count INTEGER;
BEGIN
  SELECT dp.id, dp.capacity INTO v_id, v_cap
    FROM public.digital_products dp
   WHERE dp.slug = p_slug
     AND dp.category = 'soiree'
     AND dp.is_published = true;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  -- Seuls les achats réellement payés occupent une place. Un 'pending' ne
  -- réserve rien : la session Stripe expire au bout de 30 minutes et on
  -- préfère laisser passer deux paiements simultanés sur la dernière place
  -- plutôt que de bloquer une place sur un panier abandonné.
  SELECT COUNT(*)::INTEGER INTO v_count
    FROM public.user_purchases up
   WHERE up.product_id = v_id
     AND up.status = 'paid';

  RETURN QUERY SELECT
    v_cap,
    v_count,
    CASE WHEN v_cap IS NULL THEN NULL ELSE GREATEST(v_cap - v_count, 0) END,
    CASE WHEN v_cap IS NULL THEN false ELSE v_count >= v_cap END;
END $$;

REVOKE ALL ON FUNCTION public.soiree_places(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soiree_places(TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.soiree_places(TEXT) IS
  'Places restantes d''une soirée publiée. Ne renvoie qu''un décompte, jamais l''identité des inscrits.';

-- ── 4. Le même décompte pour toutes les soirées d'un coup ───────────────────
-- L'app affiche une liste de dix soirées : dix appels séparés seraient dix
-- allers-retours pour dix nombres.
CREATE OR REPLACE FUNCTION public.soirees_places()
RETURNS TABLE (id UUID, slug TEXT, capacity INTEGER, inscrits INTEGER, places_restantes INTEGER, complet BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dp.id,
    dp.slug,
    dp.capacity,
    COALESCE(c.n, 0)::INTEGER,
    CASE WHEN dp.capacity IS NULL THEN NULL
         ELSE GREATEST(dp.capacity - COALESCE(c.n, 0), 0)::INTEGER END,
    CASE WHEN dp.capacity IS NULL THEN false
         ELSE COALESCE(c.n, 0) >= dp.capacity END
  FROM public.digital_products dp
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS n
      FROM public.user_purchases
     WHERE status = 'paid'
     GROUP BY product_id
  ) c ON c.product_id = dp.id
  WHERE dp.category = 'soiree'
    AND dp.is_published = true;
$$;

REVOKE ALL ON FUNCTION public.soirees_places() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soirees_places() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.soirees_places() IS
  'Places restantes de toutes les soirées publiées. Décomptes uniquement, aucune donnée personnelle.';
