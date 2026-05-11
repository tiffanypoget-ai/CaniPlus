-- Migration 2026-05-11 : préparation des 3 chantiers
--
-- Chantier A : achat de guides par des invités (sans compte)
-- Chantier B : code postal du membre pour calcul de déplacement
-- Chantier C : paiement sur place (cours privés + cours théoriques/spéciaux)

-- ─────────────────────────────────────────────────────────────────────────────
-- Chantier A : guest purchases
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. user_id devient nullable pour permettre les achats invités
ALTER TABLE public.user_purchases
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Ajout des colonnes pour l'invité et le suivi de livraison email
ALTER TABLE public.user_purchases
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- 3. Contrainte : il faut soit un user_id, soit un guest_email
ALTER TABLE public.user_purchases
  DROP CONSTRAINT IF EXISTS user_purchases_user_or_guest;

ALTER TABLE public.user_purchases
  ADD CONSTRAINT user_purchases_user_or_guest
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

-- 4. Index pour retrouver vite les achats par email
CREATE INDEX IF NOT EXISTS user_purchases_guest_email_idx
  ON public.user_purchases (guest_email) WHERE guest_email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Chantier B : code postal du membre
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Pour les cours privés : stocker NPA + km + frais de déplacement calculés
ALTER TABLE public.private_course_requests
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS road_km NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS travel_extra_chf NUMERIC(7,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- Chantier C : paiement sur place
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Mode de paiement sur les souscriptions et les demandes de cours privé
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_mode TEXT
  CHECK (payment_mode IN ('online', 'cash') OR payment_mode IS NULL);

ALTER TABLE public.private_course_requests
  ADD COLUMN IF NOT EXISTS payment_mode TEXT
  CHECK (payment_mode IN ('online', 'cash') OR payment_mode IS NULL);

-- 2. Index pour la liste admin "à encaisser"
CREATE INDEX IF NOT EXISTS subscriptions_cash_pending_idx
  ON public.subscriptions (payment_mode, status)
  WHERE payment_mode = 'cash' AND status = 'pending_payment';

CREATE INDEX IF NOT EXISTS private_course_requests_cash_pending_idx
  ON public.private_course_requests (payment_mode, status)
  WHERE payment_mode = 'cash';

-- 3. Table de paramètres admin pour les types de prestation autorisant le cash
-- (cours privé, cours théorique, événements). Plus simple qu'un toggle global.
CREATE TABLE IF NOT EXISTS public.payment_options (
  prestation_type TEXT PRIMARY KEY,
  allow_cash BOOLEAN NOT NULL DEFAULT false,
  allow_online BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pré-remplissage : par défaut, cash autorisé pour cours privé / théorique / spécial
INSERT INTO public.payment_options (prestation_type, allow_cash, allow_online)
VALUES
  ('lecon_privee',    true,  true),
  ('cours_theorique', true,  true),
  ('cours_special',   true,  true),
  ('premium',         false, true),
  ('digital_product', false, true)
ON CONFLICT (prestation_type) DO NOTHING;

-- RLS : tout le monde peut lire (les options sont publiques côté front),
-- seul l'admin peut écrire (via edge function service role)
ALTER TABLE public.payment_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_options_read_all ON public.payment_options;
CREATE POLICY payment_options_read_all
  ON public.payment_options FOR SELECT
  TO anon, authenticated
  USING (true);
