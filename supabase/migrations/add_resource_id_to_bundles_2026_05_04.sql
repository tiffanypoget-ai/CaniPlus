-- Migration : ajout resource_id sur editorial_bundles + dedup ressources
-- Date : 2026-05-04
--
-- Contexte : lors d'une publication de bundle, on insérait dans `resources`
-- sans tracker l'id retour côté `editorial_bundles`. Si la publication
-- plantait après l'INSERT mais avant la maj du status='published', un
-- re-clic créait un doublon. Ajout d'une colonne resource_id pour
-- l'idempotence + index pour rechercher rapidement.

-- 1. Ajout colonne
ALTER TABLE public.editorial_bundles
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_editorial_bundles_resource_id
  ON public.editorial_bundles(resource_id)
  WHERE resource_id IS NOT NULL;

-- 2. Backfill : pour chaque bundle published, retrouver la première resource
--    correspondante (par titre matching) et la lier. Best-effort.
UPDATE public.editorial_bundles eb
SET resource_id = r.id
FROM public.resources r
WHERE eb.resource_id IS NULL
  AND eb.status = 'published'
  AND r.title = (eb.content_premium->>'title')
  AND r.id = (
    SELECT id FROM public.resources r2
    WHERE r2.title = (eb.content_premium->>'title')
    ORDER BY r2.created_at ASC
    LIMIT 1
  );
