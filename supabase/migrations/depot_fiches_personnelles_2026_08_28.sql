-- Dépôt de documents personnels dans l'espace d'un membre.
--
-- La partie G (fiches_membres_2026_08_28) permet de donner une fiche du
-- catalogue premium. Tiffany veut aussi déposer SES propres PDF (un bilan,
-- un plan de travail fait pour une personne) : ces documents ne sont pas du
-- catalogue, ils sont privés, pour une seule personne.
--
-- Deux colonnes sur resources :
--   - personnelle : true = document personnel, jamais affiché dans le
--     catalogue premium ni proposé dans le sélecteur d'attribution ;
--   - storage_path : chemin du fichier dans le bucket privé
--     fiches-personnelles (à la place d'un file_url public).
--
-- Le bucket est privé : l'app génère une URL signée à l'ouverture, et les
-- policies de storage ne laissent lire un fichier qu'à l'admin, aux
-- éducatrices, et à la personne à qui la fiche est attribuée
-- (member_resources fait foi).

ALTER TABLE public.resources ADD COLUMN personnelle boolean NOT NULL DEFAULT false;
ALTER TABLE public.resources ADD COLUMN storage_path text;

INSERT INTO storage.buckets (id, name, public) VALUES ('fiches-personnelles', 'fiches-personnelles', false);

CREATE POLICY "educatrice upload fiches perso"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fiches-personnelles' AND is_educatrice());

CREATE POLICY "educatrice read fiches perso"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fiches-personnelles' AND is_educatrice());

CREATE POLICY "educatrice delete fiches perso"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fiches-personnelles' AND is_educatrice());

CREATE POLICY "membre lit ses fiches perso"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fiches-personnelles' AND EXISTS (
    SELECT 1 FROM public.member_resources mr
    JOIN public.resources r ON r.id = mr.resource_id
    WHERE mr.user_id = (SELECT auth.uid()) AND r.storage_path = storage.objects.name
  ));

-- L'admin et les éducatrices créent et retirent des ressources, mais
-- UNIQUEMENT personnelles : le catalogue premium ne se modifie pas par ce
-- chemin.
CREATE POLICY "educatrice insert resources perso"
  ON public.resources FOR INSERT TO authenticated
  WITH CHECK (is_educatrice() AND personnelle = true);

CREATE POLICY "educatrice delete resources perso"
  ON public.resources FOR DELETE TO authenticated
  USING (is_educatrice() AND personnelle = true);
