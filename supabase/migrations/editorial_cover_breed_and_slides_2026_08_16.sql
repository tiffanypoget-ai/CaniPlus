-- Images editoriales CaniPlus (16.08.2026)
-- Rotation des races de chien sur les couvertures d'articles editoriaux
-- + horodatage du rendu des slides Instagram.
--
-- Applique en production le 16.08.2026 (migration
-- `editorial_cover_breed_and_slides`).

-- cover_breed : race (texte libre, choisie par le modele) utilisee pour la
-- couverture du bundle. Sert de liste d'exclusion pour les bundles suivants.
alter table public.editorial_bundles
  add column if not exists cover_breed text;

-- Horodatage du dernier rendu des slides Instagram (PNG brandes).
alter table public.editorial_bundles
  add column if not exists slides_rendered_at timestamptz;

comment on column public.editorial_bundles.cover_breed is
  'Race de chien utilisee pour l''image de couverture. Sert d''exclusion pour les 10 bundles suivants (rotation).';
comment on column public.editorial_bundles.slides_rendered_at is
  'Date du dernier rendu PNG des slides Instagram (content_instagram.image_urls).';

-- Index partiel pour la requete de rotation (10 derniers cover_breed non rejetes).
create index if not exists editorial_bundles_cover_breed_idx
  on public.editorial_bundles (created_at desc)
  where cover_breed is not null;
