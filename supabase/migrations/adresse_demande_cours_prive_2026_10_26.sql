-- Adresse complète (rue et numéro) sur les demandes de cours privé à domicile.
--
-- Jusqu'ici la demande ne portait que le code postal et la localité : de quoi
-- calculer les frais de déplacement, mais pas de quoi se rendre chez la
-- personne ni lui adresser une facture. Tiffany devait redemander l'adresse
-- sur WhatsApp à chaque fois.
--
-- Pour un membre, l'adresse vit aussi dans profiles.street_address ; la carte
-- admin l'utilise en repli quand la demande n'en porte pas.
--
-- Ajout uniquement : aucune colonne modifiée, aucune donnée touchée.
-- Pour revenir en arrière : drop de la colonne.

alter table public.private_course_requests
  add column if not exists street_address text;

comment on column public.private_course_requests.street_address is
  'Rue et numéro du lieu du cours à domicile, complétés par postal_code et city. NULL pour la visio.';
