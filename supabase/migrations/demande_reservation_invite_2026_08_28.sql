-- Demande de cours privé ou de coaching depuis le site, sans compte.
--
-- La table identifiait les demandeurs par leur compte : user_id pointait vers
-- profiles, qui porte l'email. Quelqu'un qui arrive sur caniplus.ch sans être
-- membre n'a ni l'un ni l'autre, et on n'avait donc nulle part où écrire ses
-- coordonnées.
--
-- user_id était déjà nullable, les trois colonnes ci-dessous complètent le
-- couple manquant. Tout le reste du parcours existe déjà : availability_slots
-- porte les créneaux proposés, postal_code / city / road_km / travel_extra_chf
-- portent l'adresse et les frais de déplacement, chosen_slot et payment_status
-- portent la confirmation et le paiement.
--
-- Ajout uniquement : aucune colonne modifiée, aucune donnée touchée.
-- Pour revenir en arrière : drop des trois colonnes et de la contrainte.

alter table public.private_course_requests
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists guest_name  text;

comment on column public.private_course_requests.guest_email is
  'Email du demandeur sans compte. NULL pour un membre : son email vit dans profiles.';
comment on column public.private_course_requests.guest_phone is
  'Téléphone du demandeur sans compte, saisi au format libre. Sert à ouvrir WhatsApp depuis la notification admin.';
comment on column public.private_course_requests.guest_name is
  'Prénom et nom du demandeur sans compte, tels qu''il les a saisis.';

-- Une demande appartient soit à un membre, soit à un invité joignable.
-- Sans cette garde, une insertion ratée créerait une demande que personne ne
-- peut recontacter, et qui resterait en attente sans qu'on sache de qui elle
-- vient. Les 22 demandes existantes ont toutes un user_id, la contrainte
-- s'applique donc sans rien invalider.
alter table public.private_course_requests
  drop constraint if exists private_course_requests_demandeur_joignable;

alter table public.private_course_requests
  add constraint private_course_requests_demandeur_joignable
  check (user_id is not null or guest_email is not null);
