-- =============================================
-- CaniPlus — Corrections & ajouts
-- Coller dans : Supabase → SQL Editor → Run
-- =============================================

-- 1. Ajouter valid_until sur la table subscriptions (si pas encore fait)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- 2. Remplir valid_until = 31 déc de l'année de cotisation (pour toutes les cotisations payées)
UPDATE public.subscriptions
SET valid_until = ((year::TEXT || '-12-31 23:59:59+01'))::TIMESTAMPTZ
WHERE type = 'cotisation_annuelle'
  AND status = 'paid'
  AND valid_until IS NULL;

-- 3. Nettoyer les données de test dans les notes de cours
UPDATE public.courses
SET notes = NULL
WHERE notes ILIKE '%blian buck%'
   OR notes ILIKE '%test%'
   OR notes ILIKE '%buck%';

-- 4. Ajouter colonne notes sur courses si pas encore présente
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. Ajouter avatar_url sur profiles (pour la photo de profil)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 6. Ajouter notifications_enabled sur profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- 7. Ressources pédagogiques — contenu initial
-- (Supprime les éventuelles ressources vides avant d'insérer)
DELETE FROM public.resources WHERE title IS NULL OR title = '';

INSERT INTO public.resources (id, title, description, type, category, created_at)
VALUES
  -- Éducation
  (gen_random_uuid(), 'Guide de socialisation du chiot', 'Conseils pratiques pour bien socialiser votre chiot entre 0 et 16 semaines : personnes, sons, environnements.', 'article', 'education', NOW()),
  (gen_random_uuid(), 'Les bases du clicker training', 'Introduction au renforcement positif et au clicker training. Principes, exercices de démarrage et pièges à éviter.', 'pdf', 'education', NOW()),
  (gen_random_uuid(), 'Apprendre le rappel fiable', 'Protocole étape par étape pour enseigner un rappel solide, même en présence de distractions.', 'article', 'education', NOW()),
  (gen_random_uuid(), 'La marche en laisse sans tirer', 'Méthode douce et progressive pour obtenir une marche en laisse détendue dès les premières séances.', 'pdf', 'education', NOW()),

  -- Santé
  (gen_random_uuid(), 'Calendrier vaccinal du chien en Suisse', 'Programme de vaccination recommandé par les vétérinaires suisses : primo-vaccination, rappels annuels et obligatoires.', 'pdf', 'sante', NOW()),
  (gen_random_uuid(), 'Prévention des parasites internes et externes', 'Guide complet sur les vermifuges, antiparasitaires et traitements préventifs adaptés au contexte suisse romand.', 'article', 'sante', NOW()),
  (gen_random_uuid(), 'Alimentation équilibrée du chien adulte', 'Comparatif croquettes / BARF / ration ménagère. Conseils pratiques pour bien nourrir votre chien au quotidien.', 'article', 'sante', NOW()),

  -- Comportement
  (gen_random_uuid(), 'Comprendre les signaux d''apaisement', 'Les 30 signaux d''apaisement identifiés par Turid Rugaas : comment les reconnaître et les respecter.', 'article', 'comportement', NOW()),
  (gen_random_uuid(), 'Gérer les peurs et phobies', 'Protocoles de désensibilisation et contre-conditionnement pour aider un chien anxieux ou phobique.', 'pdf', 'comportement', NOW()),
  (gen_random_uuid(), 'Aboiements excessifs : causes et solutions', 'Identifier la cause des aboiements (ennui, peur, excitation, territorial) et mettre en place des solutions adaptées.', 'article', 'comportement', NOW()),

  -- Sécurité
  (gen_random_uuid(), 'Chien et enfants : vivre ensemble en sécurité', 'Règles essentielles pour une cohabitation sûre entre chiens et enfants. Signaux d''alerte à surveiller.', 'pdf', 'securite', NOW()),
  (gen_random_uuid(), 'Premiers secours pour chien', 'Que faire en cas de blessure, intoxication, coup de chaleur ou accident ? Guide de premiers secours canins.', 'pdf', 'securite', NOW()),

  -- Quotidien
  (gen_random_uuid(), 'Bien préparer la visite chez le vétérinaire', 'Astuces pour que votre chien vive la consultation vétérinaire sereinement : désensibilisation, manipulations, transport.', 'article', 'quotidien', NOW()),
  (gen_random_uuid(), 'Voyager avec son chien en Suisse et en Europe', 'Règles de transport (voiture, train, avion), documents requis, passeport européen et conseils pratiques.', 'article', 'quotidien', NOW()),
  (gen_random_uuid(), 'Enrichissement mental au quotidien', 'Idées d''activités et de jeux pour stimuler mentalement votre chien et réduire les comportements indésirables.', 'article', 'quotidien', NOW())

ON CONFLICT DO NOTHING;

-- 8. Politique RLS pour que les membres premium puissent lire les ressources
CREATE POLICY IF NOT EXISTS "resources_select_premium"
  ON public.resources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND premium_until > NOW()
    )
  );

-- =============================================
-- Instructions bucket Supabase Storage (avatars)
-- À faire manuellement dans Supabase → Storage :
-- 1. Créer un bucket "avatars" (Public : oui)
-- 2. Ajouter la politique : allow authenticated users to upload/update their own avatar
-- =============================================
