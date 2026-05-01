-- Migration : fix global signup + notifications
-- Date : 2026-05-01
-- Auteur : fix de 4 bugs racine signales par Tiffany le 1er mai
--
-- Probleme initial :
--   1. Le chien ajoute pendant l'inscription n'est pas enregistre
--      → cause secondaire (le profil n'est pas cree donc l'onboarding non plus)
--   2. L'email de confirmation va dans spam
--      → fix cote dashboard Supabase (SMTP custom Brevo) — pas dans cette migration
--   3. Cocher "eleve du club" a l'inscription ne donne pas acces au planning
--      → cause racine : trigger handle_new_user cree le profil avec user_type='external'
--        (DEFAULT de la table) AVANT que le upsert dans signUp puisse ecrire 'member'.
--   4. Pas de notifs pour les autres comptes
--      → cause racine : tous les nouveaux comptes etaient en 'external', donc filtres
--        d'admin (`.neq('user_type', 'external')`) les excluaient.
--
-- Cette migration corrige 3 triggers Postgres :
--
--   A. handle_new_user
--      Lit user_type ET full_name depuis raw_user_meta_data du auth.users.
--      Le frontend doit passer ces metadata via options.data dans supabase.auth.signUp.
--      Si non present (anciens clients), fallback sur 'external' (comportement legacy).
--
--   B. notify_new_group_course
--      Avant : notifiait UNIQUEMENT les members ayant cotisation_annuelle paid pour
--      l'annee du cours → quasi personne en debut d'annee.
--      Apres : notifie TOUS les profils en user_type='member' (sans filtre cotisation).
--      Les externes ne sont pas notifies (ils n'ont pas vocation a venir aux cours
--      collectifs de Ballaigues — confirme avec Tiffany).
--
--   C. notify_private_course_confirm
--      Avant : ne notifiait personne (l'action update_request faisait juste UPDATE
--      sur la table). Le trigger DB existait peut-etre deja mais ne se declenchait
--      pas correctement.
--      Apres : declenche sur UPDATE de private_course_requests, quand status passe
--      a 'confirmed', et insere une notification pour le user concerne uniquement.
--
-- Note importante :
--   Les triggers DB couvrent le canal in-app (table notifications, cloche).
--   Les push web (notifications sur le telephone) sont declenchees depuis l'edge
--   function admin-query qui appelle editorial-bundle-actions/send_push_batch
--   apres chaque action admin. Voir les modifs dans supabase/functions/admin-query/.

-- ============================================================================
-- A. handle_new_user — lit user_type et full_name depuis raw_user_meta_data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_type text;
  v_full_name text;
BEGIN
  -- Lecture du user_type depuis les metadata auth (passees par signUp options.data)
  v_user_type := COALESCE(NEW.raw_user_meta_data->>'user_type', 'external');
  IF v_user_type NOT IN ('member', 'external', 'admin') THEN
    v_user_type := 'external';
  END IF;

  -- Lecture du full_name depuis les metadata, fallback sur la partie locale de l'email
  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (
    id, email, full_name, role, user_type, member_since, onboarding_done
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    'member',                     -- role legacy (RLS) — le vrai discriminant est user_type
    v_user_type,
    extract(year from now())::int,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    user_type = EXCLUDED.user_type;

  RETURN NEW;
END;
$$;

-- Le trigger lui-meme existe deja (cf dashboard) — on le recree au cas ou il aurait
-- ete supprime ou si son nom est different.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- B. notify_new_group_course — notifie TOUS les members (sans filtre cotisation)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_new_group_course()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str text;
  v_time_str text;
  v_body text;
  v_title text;
BEGIN
  -- Ne notifie que pour les cours qui interessent les membres du club
  -- (collectif, theorique, evenement). Les lecons privees ont leur propre flux.
  IF NEW.course_type IS NULL OR NEW.course_type NOT IN ('collectif', 'theorique', 'evenement') THEN
    RETURN NEW;
  END IF;

  -- Format date FR (ex: "lundi 15 juin")
  BEGIN
    v_date_str := to_char(NEW.course_date, 'TMDay TMDD TMMonth');
  EXCEPTION WHEN others THEN
    v_date_str := to_char(NEW.course_date, 'YYYY-MM-DD');
  END;

  -- Heure si dispo
  v_time_str := COALESCE(to_char(NEW.start_time, 'HH24:MI'), '');

  -- Titre + corps selon type
  CASE NEW.course_type
    WHEN 'collectif' THEN
      v_title := 'Nouveau cours collectif';
      v_body  := 'Cours collectif le ' || v_date_str ||
                 CASE WHEN v_time_str <> '' THEN ' a ' || v_time_str ELSE '' END;
    WHEN 'theorique' THEN
      v_title := 'Nouveau cours theorique';
      v_body  := 'Cours theorique le ' || v_date_str ||
                 CASE WHEN v_time_str <> '' THEN ' a ' || v_time_str ELSE '' END;
    WHEN 'evenement' THEN
      v_title := 'Nouvel evenement au club';
      v_body  := 'Evenement le ' || v_date_str ||
                 CASE WHEN v_time_str <> '' THEN ' a ' || v_time_str ELSE '' END;
    ELSE
      v_title := 'Nouveau cours au planning';
      v_body  := 'Cours le ' || v_date_str;
  END CASE;

  -- Insert pour TOUS les profils membres du club, peu importe paiement cotisation
  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  SELECT
    p.id,
    'cours_cree',
    v_title,
    v_body,
    jsonb_build_object(
      'course_id', NEW.id,
      'course_date', NEW.course_date,
      'course_type', NEW.course_type,
      'link', '/planning'
    )
  FROM public.profiles p
  WHERE p.user_type = 'member';

  RETURN NEW;
END;
$$;

-- Recreate du trigger (au cas ou)
DROP TRIGGER IF EXISTS trg_notify_new_group_course ON public.courses;
CREATE TRIGGER trg_notify_new_group_course
  AFTER INSERT ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_group_course();


-- ============================================================================
-- C. notify_private_course_confirm — notifie le user concerne
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_private_course_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
  v_slot_date text;
  v_slot_start text;
BEGIN
  -- Ne se declenche que sur transition vers status='confirmed'
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM 'confirmed' THEN
    -- Deja confirmee, on ne renvoie pas de notif sur chaque update
    RETURN NEW;
  END IF;

  v_body := 'Ta lecon privee est confirmee';

  IF NEW.chosen_slot IS NOT NULL THEN
    v_slot_date  := NEW.chosen_slot->>'date';
    v_slot_start := NEW.chosen_slot->>'start';
    IF v_slot_date IS NOT NULL THEN
      v_body := v_body || ' pour le ' || v_slot_date;
      IF v_slot_start IS NOT NULL THEN
        v_body := v_body || ' a ' || v_slot_start;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  VALUES (
    NEW.user_id,
    'private_confirmed',
    'Lecon privee confirmee',
    v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'chosen_slot', NEW.chosen_slot,
      'link', '/profil'
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger sur UPDATE (pas INSERT — la requete est cree avec status='pending')
DROP TRIGGER IF EXISTS trg_notify_private_course_confirm ON public.private_course_requests;
CREATE TRIGGER trg_notify_private_course_confirm
  AFTER UPDATE ON public.private_course_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_private_course_confirm();


-- ============================================================================
-- Backfill optionnel (a executer manuellement si necessaire) :
-- ============================================================================
-- Si certains comptes recents sont coinces en 'external' alors que ce sont des
-- eleves du club, exemple pour les passer en 'member' :
--
--   UPDATE public.profiles
--      SET user_type = 'member'
--    WHERE created_at > '2026-04-15'
--      AND user_type = 'external'
--      AND email IN ('email1@example.com', 'email2@example.com', ...);
--
-- Ne pas executer cette UPDATE en aveugle — verifier la liste avec Tiffany d'abord.
