-- add_adhesion_client_fields_2026_08_17.sql
--
-- Le formulaire public caniplus.ch/adhesion devient la source unique de la
-- liste clients du club. Il lui manquait 5 informations qui figuraient dans le
-- fichier Excel tenu a la main :
--   - sexe du chien
--   - etat (entier / castre / sterilise…)
--   - date d'acquisition
--   - provenance (pays d'origine)
--   - mode d'envoi de la facture (mail / papier)
--
-- Ajoute aussi dogs.last_booster_date : le formulaire demande la date du
-- dernier rappel de vaccin, information qui se perdait a la validation (seul
-- le booleen dogs.vaccinated etait recopie).

-- ── Demande d'adhesion (proprietaire) ───────────────────────────────────────
alter table public.adhesions
  add column if not exists invoice_method text;

alter table public.adhesions
  drop constraint if exists adhesions_invoice_method_check;
alter table public.adhesions
  add constraint adhesions_invoice_method_check
  check (invoice_method is null or invoice_method in ('mail', 'papier'));

comment on column public.adhesions.invoice_method is 'Envoi de la facture : mail | papier';

-- ── Demande d'adhesion (chiens) ─────────────────────────────────────────────
alter table public.adhesion_chiens
  add column if not exists sexe             text,
  add column if not exists etat             text,
  add column if not exists date_acquisition date,
  add column if not exists provenance       text;

-- Memes valeurs que dogs.sex, dont la CHECK constraint n'accepte que M et F.
alter table public.adhesion_chiens
  drop constraint if exists adhesion_chiens_sexe_check;
alter table public.adhesion_chiens
  add constraint adhesion_chiens_sexe_check
  check (sexe is null or sexe in ('M', 'F'));

comment on column public.adhesion_chiens.sexe             is 'M | F — recopie dans dogs.sex a la validation';
comment on column public.adhesion_chiens.etat             is 'Entier, Castre, Entiere, Sterilisee… — recopie dans dogs.reproductive_status';
comment on column public.adhesion_chiens.date_acquisition is 'Date d''acquisition du chien';
comment on column public.adhesion_chiens.provenance       is 'Pays d''origine du chien';

-- ── Chien (app) ─────────────────────────────────────────────────────────────
alter table public.dogs
  add column if not exists last_booster_date date;

comment on column public.dogs.last_booster_date is 'Date du dernier rappel declaree a l''adhesion, quand le carnet detaille n''est pas rempli';
