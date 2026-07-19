-- Migration 2026-07-14 : confidentialité des profils + défis archivés
--
-- 1. FUITE DE DONNÉES corrigée : la policy profiles_select_members (qual=true)
--    laissait n'importe quel membre connecté lire TOUS les profils via l'API
--    (emails, adresses, identifiants Stripe). Les seuls besoins légitimes de
--    lecture croisée côté membre sont : l'admin du chat (nom, avatar, statut)
--    et les noms affichés (news, planning club). → Vue public_profiles
--    restreinte à ces colonnes, et suppression de la policy trop large.
--    Chacun ne lit plus que SON profil complet ; admin et éducatrice gardent
--    leurs accès via leurs policies dédiées.
--
-- 2. Défis archivés : une participante qui a une progression sur un défi
--    archivé doit encore le voir (et réclamer sa récompense) — la policy ne
--    montrait que les défis actifs aux non-admins.

-- ── 1. Vue publique restreinte des profils ──────────────────────────────────
-- La vue s'exécute avec les droits de son propriétaire (postgres) : elle
-- expose UNIQUEMENT ces colonnes, quel que soit l'appelant authentifié.
CREATE OR REPLACE VIEW public_profiles AS
  SELECT id, full_name, avatar_url, role, admin_chat_status, vacation_until
  FROM profiles;

REVOKE ALL ON public_profiles FROM anon, authenticated;
GRANT SELECT ON public_profiles TO authenticated;

-- La policy « tout le monde lit tout » disparaît. Restent : lecture de son
-- propre profil (profiles_select_own), admin (admin read profiles gestion),
-- éducatrice (educatrice read profiles).
DROP POLICY IF EXISTS profiles_select_members ON profiles;

-- ── 2. Défis archivés visibles par leurs participantes ──────────────────────
DROP POLICY IF EXISTS defis_read ON defis;
CREATE POLICY defis_read ON defis
  FOR SELECT USING (
    statut = 'actif'
    OR EXISTS (SELECT 1 FROM defi_progression dp WHERE dp.defi_id = defis.id AND dp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS defi_jours_read ON defi_jours;
CREATE POLICY defi_jours_read ON defi_jours
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM defis WHERE defis.id = defi_jours.defi_id AND defis.statut = 'actif')
    OR EXISTS (SELECT 1 FROM defi_progression dp WHERE dp.defi_id = defi_jours.defi_id AND dp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
