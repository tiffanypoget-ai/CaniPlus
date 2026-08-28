-- Pointage des présences : l'admin et les éducatrices peuvent écrire
-- pour n'importe quel membre.
--
-- État des lieux du 28 août 2026 : 85 cours donnés sur 90 jours, presque
-- aucune ligne de présence en base. Le module côté membre est désactivé,
-- et personne ne peut rien enregistrer à sa place : la policy INSERT
-- « ca_write » impose user_id = auth.uid(), on ne peut donc créer une
-- présence QUE pour soi-même. Ni l'admin ni une éducatrice ne peuvent
-- pointer un membre. C'est la seule chose qui manque : la lecture est
-- ouverte (ca_read), et la mise à jour par une éducatrice existe déjà
-- (« educatrice update attendance »).
--
-- Cette migration ajoute :
--   - une policy INSERT autorisée par is_educatrice(), qui accepte les
--     rôles educatrice ET admin ;
--   - une policy DELETE équivalente, car « ca_delete » a la même limite
--     (chacun ne peut supprimer que ses propres lignes). L'écran Présences
--     ne supprime jamais (décocher passe present à false), mais sans cette
--     policy l'admin ne pourrait pas corriger une ligne créée par erreur.
--
-- Les policies existantes ne sont pas touchées : un membre peut toujours
-- pointer sa propre présence si le module côté membre rouvre un jour.

create policy "educatrice insert attendance"
  on public.course_attendance
  for insert
  to authenticated
  with check (is_educatrice());

create policy "educatrice delete attendance"
  on public.course_attendance
  for delete
  to authenticated
  using (is_educatrice());
