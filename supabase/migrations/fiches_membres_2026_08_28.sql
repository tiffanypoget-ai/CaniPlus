-- Fiches attribuées à un membre.
--
-- Tiffany veut pouvoir déposer une fiche à quelqu'un après son cours, et que
-- la personne la retrouve dans son espace, avec un mot facultatif. Rien de
-- tel n'existait : resources est un catalogue global (réservé aux premium
-- par RLS), et dog_notes est du texte libre attaché à un chien.
--
-- member_resources relie un membre à une ressource existante : le contenu
-- n'est jamais dupliqué, une même fiche peut être attribuée à dix personnes.
-- read_at se remplit quand le membre ouvre la fiche.

create table public.member_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  note text,                -- un mot de Tiffany à la personne, facultatif
  read_at timestamptz,      -- première ouverture par le membre
  unique (user_id, resource_id)
);

alter table public.member_resources enable row level security;

-- Le membre lit ce qui le concerne.
create policy "mr_select_own"
  on public.member_resources
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Le membre peut marquer sa fiche comme lue, et rien d'autre : la policy
-- UPDATE ne couvre que ses lignes, et les privilèges de colonne ci-dessous
-- limitent l'écriture à read_at pour tout le monde côté client. L'admin et
-- les éducatrices n'éditent pas une attribution : elles la retirent et la
-- recréent.
create policy "mr_update_own_read"
  on public.member_resources
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.member_resources from authenticated;
grant select, insert, delete on public.member_resources to authenticated;
grant update (read_at) on public.member_resources to authenticated;

-- L'admin et les éducatrices lisent et écrivent tout (is_educatrice()
-- accepte les deux rôles).
create policy "educatrice select member_resources"
  on public.member_resources for select to authenticated
  using (is_educatrice());

create policy "educatrice insert member_resources"
  on public.member_resources for insert to authenticated
  with check (is_educatrice());

create policy "educatrice delete member_resources"
  on public.member_resources for delete to authenticated
  using (is_educatrice());

-- Deux ouvertures de lecture sur resources, dont la seule policy SELECT
-- exige un premium actif :
--  1. la personne à qui une fiche est attribuée doit pouvoir la lire, même
--     sans abonnement premium (c'est « ce que Tiffany m'a donné, à moi ») ;
--  2. l'admin et les éducatrices doivent lister le catalogue pour choisir
--     la fiche à attribuer, sans dépendre d'un premium sur leur compte.
create policy "resources_select_assigned"
  on public.resources for select to authenticated
  using (exists (
    select 1 from public.member_resources mr
    where mr.resource_id = resources.id
      and mr.user_id = (select auth.uid())
  ));

create policy "educatrice select resources"
  on public.resources for select to authenticated
  using (is_educatrice());
