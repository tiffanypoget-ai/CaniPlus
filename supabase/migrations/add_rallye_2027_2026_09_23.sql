-- Rallye canin de Ballaigues : inscriptions en ligne (édition 2027).
--
-- Organisateur et encaisseur : l'association Club canin de Ballaigues, CaniPlus.
-- TWINT passe par le compte Stripe CLUB, les virements arrivent sur le compte
-- PostFinance du club. Rien ne transite par la raison individuelle.
--
-- Tout passe par les edge functions (service role) :
--   rallye-inscription  (site vitrine, public) : crée l'inscription
--   stripe-webhook-club                          : passe en payé après TWINT
--   rallye-admin        (app, admin)           : liste, virement reçu, export
-- RLS activé, aucune policy : ni anon ni authenticated ne lisent ni n'écrivent.

create table if not exists public.rallye_inscriptions (
  id                      uuid primary key default gen_random_uuid(),
  -- Numéro court et séquentiel : sert à fabriquer la référence SCOR du
  -- virement (RFxx R27 0001) et à retrouver une inscription au téléphone.
  numero                  integer generated always as identity unique,
  created_at              timestamptz not null default now(),
  edition                 smallint not null default 2027,
  -- Données personnelles : nullables, car la purge d'avril 2028 les efface
  -- en gardant la ligne comptable (voir purger_rallye_2027 plus bas).
  -- rallye-inscription refuse toute inscription où l'une d'elles manque.
  prenom                  text,
  nom                     text,
  email                   text,
  telephone               text,
  npa                     text,
  localite                text,
  parcours_prevu          text check (parcours_prevu in ('1km', '3.7km', '5.4km', 'indecis')),
  nb_chiens               smallint not null check (nb_chiens between 1 and 6),
  consignes_acceptees_le  timestamptz not null,
  -- À incrémenter (2027-v2, …) si le texte des consignes change : on sait
  -- ainsi quelle version chaque personne a acceptée.
  consignes_version       text not null,
  montant_chf             numeric(8, 2) not null check (montant_chf > 0),
  moyen_paiement          text not null check (moyen_paiement in ('twint', 'virement')),
  statut                  text not null default 'en_attente'
                            check (statut in ('en_attente', 'paye', 'annule')),
  reference_scor          text unique,
  stripe_session_id       text unique,
  stripe_payment_intent   text,
  paye_le                 timestamptz,
  note_admin              text
);

create index if not exists rallye_inscriptions_edition_statut_idx
  on public.rallye_inscriptions (edition, statut);

create table if not exists public.rallye_chiens (
  id              uuid primary key default gen_random_uuid(),
  inscription_id  uuid not null references public.rallye_inscriptions (id) on delete cascade,
  nom             text not null,
  race            text,
  ruban           text not null check (ruban in ('jaune', 'bleu'))
);

create index if not exists rallye_chiens_inscription_idx
  on public.rallye_chiens (inscription_id);

alter table public.rallye_inscriptions enable row level security;
alter table public.rallye_chiens enable row level security;
revoke all on public.rallye_inscriptions from anon, authenticated;
revoke all on public.rallye_chiens from anon, authenticated;

comment on table public.rallye_inscriptions is
  'Inscriptions au Rallye canin de Ballaigues (club). Accès uniquement par les edge functions en service role.';
comment on table public.rallye_chiens is
  'Chiens inscrits au Rallye canin, un par ligne, avec le ruban demandé (jaune = besoin d''espace, bleu = à l''aise).';

-- Catégorie comptable du club pour les inscriptions payées par TWINT.
-- Les virements arrivent par l'import PostFinance, comme les cotisations :
-- ils ne sont pas écrits ici, pour ne pas les compter deux fois.
insert into public.compta_categories (entity, nom, sens)
values ('club', 'Rallye canin (inscriptions)', 'recette')
on conflict (entity, nom) do nothing;

-- ─── Conservation ────────────────────────────────────────────────────────────
-- Annoncé dans la politique de confidentialité : les données d'inscription
-- sont supprimées 12 mois après le rallye (21 mars 2027). Les pièces
-- comptables sont conservées 10 ans (CO art. 958f).
--
-- CE QUI EST SUPPRIMÉ : les chiens, et sur chaque inscription le nom, l'email,
-- le téléphone, le NPA, la localité et la note admin.
-- CE QUI EST GARDÉ : numéro, montant, moyen de paiement, statut, date de
-- paiement, référence SCOR et identifiants Stripe. Les recettes TWINT sont en
-- plus dans compta_transactions, qui n'est pas touchée.
--
-- La fonction ne fait rien avant le 1er avril 2028, puis rien après le premier
-- passage (les champs sont déjà vides). Le cron tourne le 1er de chaque mois :
-- une édition 2028 pourra réutiliser la même mécanique en changeant l'année.
create or replace function public.purger_rallye_2027()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  purgees integer;
begin
  if now() < timestamptz '2028-04-01 00:00:00+02' then
    return 0;
  end if;

  delete from public.rallye_chiens c
  using public.rallye_inscriptions i
  where c.inscription_id = i.id and i.edition = 2027;

  with effacees as (
    update public.rallye_inscriptions
       set prenom = null, nom = null, email = null, telephone = null,
           npa = null, localite = null, note_admin = null
     where edition = 2027
       and (prenom is not null or email is not null or telephone is not null)
    returning 1
  )
  select count(*) into purgees from effacees;

  if purgees > 0 then
    raise log '[purge-rallye-2027] % inscription(s) anonymisee(s)', purgees;
  end if;
  return purgees;
end;
$fn$;

comment on function public.purger_rallye_2027() is
  'Applique la durée de conservation du Rallye 2027 : dès le 1er avril 2028, efface les chiens et les données personnelles des inscriptions, garde montant, date et référence de paiement.';

revoke all on function public.purger_rallye_2027() from public, anon, authenticated;

select cron.schedule(
  'purge-rallye-2027',
  '0 4 1 * *',
  $cron$ select public.purger_rallye_2027(); $cron$
);
