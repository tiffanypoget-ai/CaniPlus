-- ============================================================================
-- Rattacher les achats invités au compte créé après coup
-- 21.08.2026
--
-- Depuis l'ouverture du paiement invité aux soirées, quelqu'un peut payer sa
-- soirée sans compte (le lien Zoom part par email), puis créer un compte plus
-- tard. Sans ce rattachement, son inscription resterait invisible dans l'app.
--
-- La correspondance se fait sur l'email, en minuscules, et uniquement dans ce
-- sens : un achat invité prend le user_id du profil qui porte la même adresse.
-- On ne touche jamais à un achat qui a déjà un user_id.
--
-- user_purchases porte une contrainte UNIQUE (user_id, product_id) : si la
-- personne possède déjà un achat de ce produit sous son compte, l'achat invité
-- est laissé tel quel plutôt que de faire échouer la création du profil.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_guest_purchases()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.user_purchases up
     SET user_id = NEW.id
   WHERE up.user_id IS NULL
     AND up.guest_email IS NOT NULL
     AND lower(btrim(up.guest_email)) = lower(btrim(NEW.email))
     AND NOT EXISTS (
       SELECT 1 FROM public.user_purchases autre
        WHERE autre.user_id = NEW.id
          AND autre.product_id = up.product_id
     );

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.claim_guest_purchases() IS
  'Rattache les achats invités (guest_email) au profil qui porte la même adresse email.';

DROP TRIGGER IF EXISTS claim_guest_purchases_on_profile ON public.profiles;

CREATE TRIGGER claim_guest_purchases_on_profile
  AFTER INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_guest_purchases();

-- Rattrapage sur l'existant : les achats invités déjà en base dont l'adresse
-- correspond à un profil existant.
UPDATE public.user_purchases up
   SET user_id = p.id
  FROM public.profiles p
 WHERE up.user_id IS NULL
   AND up.guest_email IS NOT NULL
   AND lower(btrim(up.guest_email)) = lower(btrim(p.email))
   AND NOT EXISTS (
     SELECT 1 FROM public.user_purchases autre
      WHERE autre.user_id = p.id
        AND autre.product_id = up.product_id
   );
