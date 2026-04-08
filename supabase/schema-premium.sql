-- =============================================================
-- CaniPlus · Colonnes premium dans la table profiles
-- À coller dans : Supabase → SQL Editor → Run
-- (à exécuter APRÈS schema-payments.sql)
-- =============================================================

-- 1. Ajouter les colonnes liées à l'abonnement premium mensuel
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS premium_until          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_cancel_at      TIMESTAMPTZ,   -- date de fin si résiliation programmée
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- 2. Colonne résiliation cotisation annuelle (ne pas renouveler)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renew_cancelled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index pour retrouver un profil par son customer Stripe (utilisé par le webhook)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- =============================================================
-- 3. Vue utilitaire : membres premium actifs
--    Pratique pour voir d'un coup d'œil qui est abonné
-- =============================================================
CREATE OR REPLACE VIEW premium_members AS
  SELECT
    id,
    full_name,
    email,
    premium_until,
    premium_cancel_at,
    stripe_subscription_id,
    CASE WHEN premium_until > NOW() THEN true ELSE false END AS is_active,
    CASE WHEN premium_cancel_at IS NOT NULL AND premium_until > NOW() THEN true ELSE false END AS is_cancelling
  FROM profiles
  WHERE premium_until IS NOT NULL
  ORDER BY premium_until DESC;

-- =============================================================
-- 4. Mettre à jour les politiques RLS pour profiles
--    (les utilisateurs peuvent lire leurs propres données premium)
-- =============================================================
-- Si RLS est activé sur profiles, s'assurer que la colonne premium_until est lisible :
-- (normalement déjà couvert par la policy existante "select own")

-- Exemple de vérification manuelle :
-- SELECT id, full_name, premium_until FROM profiles WHERE id = auth.uid();

-- =============================================================
-- 5. Webhook Stripe — nouveaux événements à écouter
--    (en plus de checkout.session.completed)
-- =============================================================
-- Dans Stripe → Développeurs → Webhooks → ton endpoint → Modifier :
-- Ajouter ces événements :
--   ✅ checkout.session.completed        (déjà présent)
--   ✅ checkout.session.expired          (déjà présent)
--   🆕 invoice.payment_succeeded         ← renouvellement mensuel
--   🆕 invoice.payment_failed            ← échec de paiement
--   🆕 customer.subscription.updated     ← résiliation programmée (cancel_at_period_end)
--   🆕 customer.subscription.deleted     ← résiliation effective

-- N'oublie pas aussi de redéployer la fonction stripe-webhook :
--   supabase functions deploy stripe-webhook
--   supabase functions deploy cancel-subscription
