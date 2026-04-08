-- =============================================================
-- CaniPlus · Mise à jour schema pour les paiements Stripe
-- À coller dans : Supabase → SQL Editor → Run
-- =============================================================

-- 1. Ajouter les colonnes de paiement à la table subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS user_email        TEXT;

-- 2. S'assurer que le statut 'paid' est gérable
--    (si la colonne status n'existe pas encore, la créer)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Valeurs autorisées : 'pending' | 'paid' | 'cancelled'
-- (pas de contrainte CHECK pour garder de la flexibilité)

-- 3. Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_session
  ON subscriptions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- =============================================================
-- 4. Politiques RLS (Row Level Security)
--    Les clients ne peuvent voir que leurs propres abonnements
-- =============================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Lecture : chaque client voit seulement ses données
CREATE POLICY IF NOT EXISTS "subscriptions_select_own"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Mise à jour : réservée au service_role (webhook Stripe)
-- (les clients ne peuvent pas changer leur propre statut)
CREATE POLICY IF NOT EXISTS "subscriptions_update_service_only"
  ON subscriptions FOR UPDATE
  USING (auth.role() = 'service_role');

-- =============================================================
-- 5. Table payments (historique des transactions)
--    Optionnelle mais recommandée pour le suivi comptable
-- =============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  amount            INTEGER NOT NULL,   -- en centimes (ex: 8000 = CHF 80.00)
  currency          TEXT NOT NULL DEFAULT 'chf',
  status            TEXT NOT NULL DEFAULT 'paid',
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Les clients peuvent voir leur historique de paiements
CREATE POLICY IF NOT EXISTS "payments_select_own"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Insertion réservée au service_role (webhook)
CREATE POLICY IF NOT EXISTS "payments_insert_service_only"
  ON payments FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================
-- Exemple de données de test (à adapter ou supprimer)
-- UPDATE subscriptions SET status = 'pending' WHERE type = 'cotisation_annuelle';
-- =============================================================
