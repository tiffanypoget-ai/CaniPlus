-- Le nom du chien sur une demande de réservation.
--
-- Pour un membre, le chien vit dans son profil : Tiffany le retrouve depuis
-- son compte. Pour quelqu'un qui réserve depuis le site, il n'y avait nulle
-- part où le mettre, et le formulaire ne le demandait pas. Tiffany recevait
-- donc une demande de cours sans savoir pour quel chien.
--
-- Colonne ajoutée, rien de modifié. Elle reste nullable : les demandes
-- existantes n'en ont pas, et un membre continue de passer par son profil.

alter table public.private_course_requests
  add column if not exists dog_name text;

comment on column public.private_course_requests.dog_name is
  'Nom du chien, saisi par un demandeur sans compte. NULL pour un membre : ses chiens vivent dans son profil.';
