-- La notification in-app ne vaut que pour quelqu'un qui a un compte.
--
-- trg_notify_private_course insère une notification au moment où une demande
-- passe à 'confirmed'. Elle écrit NEW.user_id dans notifications.user_id, qui
-- est NOT NULL. Tant que toutes les demandes venaient de membres, user_id était
-- toujours renseigné et le problème n'existait pas.
--
-- Depuis que le site accepte des demandes sans compte, user_id peut être NULL.
-- La confirmation échouait alors entièrement :
--
--   ERROR: 23502 null value in column "user_id" of relation "notifications"
--          violates not-null constraint
--
-- Ce n'est pas un email manqué, c'est la confirmation elle-même qui est
-- annulée : le déclencheur est AFTER UPDATE, donc son échec fait tomber toute
-- la transaction. Tiffany cliquait « confirmer » et la demande restait en
-- attente.
--
-- Correctif minimal : une garde de plus, à côté des trois qui existent déjà.
-- Rien d'autre ne change. Un invité n'a pas d'écran où lire une notification
-- in-app de toute façon ; il reçoit l'email de notify-guest-confirmed, envoyé
-- par le déclencheur trg_notifier_invite_creneau_confirme.

CREATE OR REPLACE FUNCTION public.notify_private_course_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  -- Demande sans compte : pas de destinataire pour une notification in-app.
  IF NEW.user_id IS NULL THEN
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
$fn$;
