-- Catalogue public de la bibliothèque premium (espace membre du site, lot 1).
--
-- Décision de Tiffany du 14.11.2026 : un visiteur non abonné voit la liste
-- des fiches et des articles (titre, résumé, thème) avec un cadenas, pour
-- savoir ce que l'abonnement contient. Le texte complet reste réservé au
-- premium : la règle resources_select_premium ne change pas.
--
-- La fonction est security definer pour passer outre la RLS, mais elle ne
-- renvoie AUCUNE colonne de contenu (content, file_url, storage_path) :
-- seulement de quoi afficher une carte verrouillée. Les documents personnels
-- (personnelle = true) en sont exclus, comme les ressources sans texte.

create or replace function public.catalogue_bibliotheque()
returns table (
  id uuid,
  title text,
  description text,
  type text,
  category text,
  created_at timestamptz,
  a_pdf boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.title, r.description, r.type, r.category, r.created_at,
         (r.storage_path is not null) as a_pdf
  from public.resources r
  where coalesce(r.personnelle, false) = false
    and r.type in ('article', 'fiche')
    and r.content is not null
    and length(trim(r.content)) > 0
  order by r.created_at desc;
$$;

revoke all on function public.catalogue_bibliotheque() from public;
grant execute on function public.catalogue_bibliotheque() to anon, authenticated;
