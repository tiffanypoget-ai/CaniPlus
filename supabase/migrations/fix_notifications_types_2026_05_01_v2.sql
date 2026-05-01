-- Migration : fix CHECK constraint notifications.type + restauration triggers
-- Date : 2026-05-01 (v2, midi)
-- Auteur : trouve pendant audit avant lancement
--
-- PROBLEME :
--   La table public.notifications a une CHECK constraint qui n'autorise que :
--     ('cours_confirme', 'cours_semaine', 'nouvelle_actualite', 'info', 'rappel')
--
--   Mais le code et les triggers en place inserent des types non autorises :
--     - admin-query notifyCourseMembers : 'cours_cree', 'cours_modifie', 'cours_annule'
--     - admin-query send_manual_notification : 'admin_manuelle'
--     - mon trigger du matin notify_new_group_course : 'cours_cree'
--     - mon trigger du matin notify_private_course_confirm : 'private_confirmed'
--
--   → toutes ces notifs plantent silencieusement avec
--     "violates check constraint notifications_type_check"
--
-- FIX :
--   1. Elargir la CHECK constraint pour inclure tous les types utilises
--   2. Re-creer les 2 triggers (notify_new_group_course et notify_private_course_confirmed)
--      avec :
--      - Types compatibles ('cours_semaine' / 'cours_confirme' = legacy)
--      - Filtre user_type='member' (= mon fix du matin pour ne plus filtrer cotisation)
--      - Nom de fonction et de trigger compatibles avec ce qui existe deja en DB
--
--   Le code admin-query continue d'utiliser ses types ('cours_cree', 'admin_manuelle' etc)
--   qui sont maintenant tous accepted par la check elargie.

-- ============================================================================
-- 1. ELARGIR LA CHECK CONSTRAINT
-- ============================================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- Types historiques (notifications_table.sql)
    'cours_confirme', 'cours_semaine', 'nouvelle_actualite', 'info', 'rappel',
    -- Types ajoutes par admin-query
    'cours_cree', 'cours_modifie', 'cours_annule',
    'private_confirmed',
    'admin_manuelle'
  ));


-- ============================================================================
-- 2. NETTOYER LES ARTEFACTS DE MON FIX DU MATIN
-- ============================================================================

-- Mon trigger du matin avait pour nom 'trg_notify_private_course_confirm'
-- L'original s'appelle 'trg_notify_private_course'. On garde l'original.
DROP TRIGGER IF EXISTS trg_notify_private_course_confirm ON public.private_course_requests;

-- Idem pour la fonction du matin (orthographe sans 'd')
DROP FUNCTION IF EXISTS public.notify_private_course_confirm() CASCADE;


-- ============================================================================
-- 3. RECREER notify_new_group_course (type compatible + filtre user_type)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_new_group_course()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_body text;
BEGIN
  -- Notifie uniquement les types qui interessent les membres du club
  IF NEW.course_type IS NULL OR NEW.course_type NOT IN ('collectif', 'theorique', 'evenement') THEN
    RETURN NEW;
  END IF;

  CASE NEW.course_type
    WHEN 'collectif' THEN v_label := 'Cours collectif';
    WHEN 'theorique' THEN v_label := 'Cours theorique';
    WHEN 'evenement' THEN v_label := 'Evenement';
    ELSE                  v_label := 'Cours';
  END CASE;

  v_body := v_label || ' le ' || to_char(NEW.course_date, 'DD.MM.YYYY')
    || CASE WHEN NEW.start_time IS NOT NULL
            THEN ' a ' || to_char(NEW.start_time, 'HH24:MI')
            ELSE '' END;

  -- Insert pour TOUS les membres du club (user_type='member', sans filtre cotisation)
  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  SELECT
    p.id,
    'cours_semaine',                      -- type historique, compatible CHECK
    v_label || ' ajoute',
    v_body,
    jsonb_build_object(
      'course_id', NEW.id,
      'course_type', NEW.course_type,
      'date', NEW.course_date::text,
      'link', '/planning'
    )
  FROM public.profiles p
  WHERE p.user_type = 'member';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_group_course ON public.group_courses;
CREATE TRIGGER trg_notify_new_group_course
  AFTER INSERT ON public.group_courses
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_group_course();


-- ============================================================================
-- 4. RECREER notify_private_course_confirmed (type compatible + nettoyage)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_private_course_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_date text;
  v_slot_start text;
  v_body text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF NEW.chosen_slot IS NULL THEN
    RETURN NEW;
  END IF;

  v_slot_date  := NEW.chosen_slot->>'date';
  v_slot_start := NEW.chosen_slot->>'start';

  BEGIN
    v_body := 'Ton cours prive du ' || to_char(v_slot_date::date, 'DD.MM.YYYY')
              || COALESCE(' a ' || v_slot_start, '') || ' a ete confirme.';
  EXCEPTION WHEN others THEN
    v_body := 'Ton cours prive ' || COALESCE(v_slot_date, '') || COALESCE(' a ' || v_slot_start, '') || ' a ete confirme.';
  END;

  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  VALUES (
    NEW.user_id,
    'cours_confirme',                     -- type historique, compatible CHECK
    'Cours prive confirme',
    v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'date', v_slot_date,
      'link', '/profil'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_private_course ON public.private_course_requests;
CREATE TRIGGER trg_notify_private_course
  AFTER UPDATE ON public.private_course_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_private_course_confirmed();
