-- Migration : coaching à distance (Phase 4)
-- Date : 2026-04-21
-- Contexte : ouvrir un second service payant à Tiffany — le coaching vidéo à distance.
--
-- Le chien reste chez lui, Tiffany intervient via visio (Zoom / Google Meet).
-- On réutilise la table private_course_requests existante :
--   - nouvelle colonne is_remote (true = coaching distance, false = à domicile)
--   - prix fixe en base (60 CHF déjà existant pour présentiel, 50 CHF distance)
--   - meeting_url : URL Zoom/Meet générée par Tiffany et collée dans l'admin
--   - stripe_session_id : lien vers la session Stripe de paiement
--
-- On ajoute aussi les colonnes nécessaires au paiement : price_chf, paid_at
-- (séparées du flux cotisation/abonnement premium existants).

-- ─── 1. Ajout des colonnes sur private_course_requests ────────────────────
ALTER TABLE private_course_requests
  ADD COLUMN IF NOT EXISTS is_remote         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_chf         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS meeting_url       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_status    TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed', 'not_required'));

CREATE INDEX IF NOT EXISTS idx_pcr_is_remote ON private_course_requests(is_remote, payment_status);
CREATE INDEX IF NOT EXISTS idx_pcr_stripe_session ON private_course_requests(stripe_session_id);

COMMENT ON COLUMN private_course_requests.is_remote IS
  'true = coaching distance (Zoom/Meet), false = séance à domicile';
COMMENT ON COLUMN private_course_requests.price_chf IS
  'Prix facturé : 60 CHF à domicile, 50 CHF en distance (valeur par défaut côté front)';
COMMENT ON COLUMN private_course_requests.meeting_url IS
  'URL de visio (Zoom/Meet) générée par Tiffany et renseignée dans le panel admin';
COMMENT ON COLUMN private_course_requests.payment_status IS
  'pending = créée, paid = paiement Stripe confirmé, not_required = ancienne demande (avant Phase 4)';

-- ─── 2. Backfill des demandes existantes ──────────────────────────────────
-- Les demandes antérieures à cette migration sont des cours privés présentiels non payés via Stripe
-- (paiement en espèces ou facturation manuelle). On les marque `not_required`.
UPDATE private_course_requests
SET    payment_status = 'not_required'
WHERE  payment_status IS NULL
  OR   payment_status = 'pending' AND stripe_session_id IS NULL AND created_at < NOW() - INTERVAL '1 day';

-- ─── 3. Policies (lecture propre à l'utilisateur, écriture admin via SRK) ─
-- On respecte les policies existantes sur private_course_requests si elles existent déjà.
-- Si ce n'est pas le cas, les policies par défaut (admin + user propriétaire) s'appliquent.
-- Aucun changement côté RLS — les colonnes ajoutées héritent du contexte de la table.
