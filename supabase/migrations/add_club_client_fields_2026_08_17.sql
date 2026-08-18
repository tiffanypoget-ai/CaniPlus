-- add_club_client_fields_2026_08_17.sql
--
-- Champs manquants pour que la liste clients du club (jusqu'ici tenue dans un
-- fichier Excel) sorte directement de l'app.
--
-- Colonnes du fichier de Tiffany et leur equivalent en base :
--   Nom et prenom          -> profiles.full_name          (existait)
--   Adresse                -> profiles.street_address + postal_code + city
--   Telephone              -> profiles.phone              (nouveau)
--   Email                  -> profiles.email              (existait)
--   Nom du chien           -> dogs.name                   (existait)
--   Race                   -> dogs.breed                  (existait)
--   Sexe                   -> dogs.sex                    (existait)
--   Etat                   -> dogs.reproductive_status    (existait)
--   Numero de puce         -> dogs.chip_number            (existait)
--   Date d'acquisition     -> dogs.acquisition_date       (nouveau)
--   Date de naissance      -> dogs.birth_date             (existait)
--   Provenance             -> dogs.origin_country         (nouveau)
--   Droit a l'image        -> profiles.image_rights       (nouveau)
--   Facture                -> profiles.invoice_method     (nouveau)
--   Cotisation <annee>     -> derive de subscriptions (type='cotisation_annuelle')
--   Present l'annee proch. -> profiles.renewal_next_year  (nouveau, cote admin)
--   Assurance RC privee    -> profiles.has_rc_insurance   (nouveau)
--   Vaccins a jour         -> calcule depuis dogs.vaccines (next_due_date)
--
-- Tout est nullable : aucun compte existant n'est casse, et les comptes grand
-- public (user_type='external') ne remplissent jamais ces champs.

-- ── Proprietaire ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists phone            text,
  add column if not exists street_address   text,
  add column if not exists has_rc_insurance boolean,
  add column if not exists image_rights     boolean,
  add column if not exists invoice_method   text,
  add column if not exists renewal_next_year boolean;

-- 'mail' = facture envoyee par e-mail, 'papier' = remise en main propre.
alter table public.profiles
  drop constraint if exists profiles_invoice_method_check;
alter table public.profiles
  add constraint profiles_invoice_method_check
  check (invoice_method is null or invoice_method in ('mail', 'papier'));

comment on column public.profiles.phone             is 'Telephone du proprietaire (club)';
comment on column public.profiles.street_address    is 'Rue et numero — completes par postal_code et city';
comment on column public.profiles.has_rc_insurance  is 'Assurance responsabilite civile privee : true/false, null = pas encore repondu';
comment on column public.profiles.image_rights      is 'Droit a l''image : true = autorise, false = refuse, null = pas encore repondu';
comment on column public.profiles.invoice_method    is 'Envoi de la facture : mail | papier';
comment on column public.profiles.renewal_next_year is 'Present l''annee prochaine — renseigne par l''admin';

-- ── Chien ───────────────────────────────────────────────────────────────────
alter table public.dogs
  add column if not exists acquisition_date date,
  add column if not exists origin_country   text;

comment on column public.dogs.acquisition_date is 'Date d''acquisition du chien';
comment on column public.dogs.origin_country   is 'Provenance du chien (pays) : Suisse, France, Roumanie…';
