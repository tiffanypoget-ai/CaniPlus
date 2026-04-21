-- Migration : ajout de la colonne user_type sur profiles
-- Date : 2026-04-21
-- Contexte : ouverture de l'app CaniPlus aux non-membres du club de Ballaigues
--
-- Taxonomie :
--   'member'   = élève du club CaniPlus à Ballaigues (accès complet cours, cotisation, planning)
--   'external' = utilisateur externe (ressources premium, guides, blog, coaching à distance)
--   'admin'    = Tiffany / administrateurs
--
-- Note : on garde `role` pour la compatibilité (RLS policies, edge functions existantes)
--        `user_type` est la nouvelle source de vérité pour le type d'accès de l'app.

-- 1. Ajout de la colonne avec 'external' par défaut (nouveaux comptes = externes par défaut)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'external'
  CHECK (user_type IN ('member', 'external', 'admin'));

-- 2. Backfill : tous les comptes existants avant cette migration sont des membres du club
--    (ce sont les élèves actuels de Tiffany, créés avant l'ouverture au grand public)
UPDATE profiles
  SET user_type = 'member'
  WHERE user_type IS NULL OR user_type = 'external';

-- 3. Les admins gardent le type 'admin'
UPDATE profiles
  SET user_type = 'admin'
  WHERE role = 'admin';

-- 4. Rendre la colonne NOT NULL une fois remplie
ALTER TABLE profiles
  ALTER COLUMN user_type SET NOT NULL;

-- 5. Index pour les requêtes filtrées par type (dashboard admin, stats, etc.)
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);

-- ─── RLS : les utilisateurs peuvent lire et mettre à jour user_type sur leur propre profil ───
-- (les policies existantes sur `profiles` couvrent déjà ce cas puisqu'elles filtrent par `id = auth.uid()`)
