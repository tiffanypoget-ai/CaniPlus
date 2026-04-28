-- Phase 3 de l'agent editorial : tracking des vues + evenements
-- 28 avril 2026

-- 1. views_count sur resources (existait deja sur articles)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS views_count integer DEFAULT 0;

-- 2. Table editorial_events : log brut des evenements pour analyses futures
CREATE TABLE IF NOT EXISTS public.editorial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('article_view', 'resource_view', 'push_click', 'push_received')),
  article_id uuid,
  resource_id uuid,
  bundle_id uuid,
  user_id uuid,
  user_agent text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_events_created_idx ON public.editorial_events(created_at DESC);
CREATE INDEX IF NOT EXISTS editorial_events_article_idx ON public.editorial_events(article_id) WHERE article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS editorial_events_resource_idx ON public.editorial_events(resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS editorial_events_bundle_idx ON public.editorial_events(bundle_id) WHERE bundle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS editorial_events_kind_idx ON public.editorial_events(kind);

ALTER TABLE public.editorial_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full" ON public.editorial_events;
CREATE POLICY "service role full" ON public.editorial_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Vue agregee pour le dashboard admin : stats par bundle publie
CREATE OR REPLACE VIEW public.editorial_bundle_stats AS
SELECT
  b.id AS bundle_id,
  b.theme,
  b.published_at,
  b.article_id,
  COALESCE(a.views_count, 0) AS article_views,
  COALESCE(a.slug, NULL) AS article_slug,
  (
    SELECT COUNT(*) FROM editorial_events e
    WHERE e.bundle_id = b.id AND e.kind = 'push_click'
  ) AS push_clicks,
  (
    SELECT COUNT(*) FROM editorial_events e
    WHERE e.bundle_id = b.id AND e.kind = 'push_received'
  ) AS push_received,
  (
    SELECT COALESCE(SUM(r.views_count), 0)::int FROM resources r
    WHERE r.title = (b.content_premium->>'title')
      AND r.created_at >= b.published_at - INTERVAL '5 minutes'
      AND r.created_at <= b.published_at + INTERVAL '5 minutes'
  ) AS resource_views
FROM editorial_bundles b
LEFT JOIN articles a ON a.id = b.article_id
WHERE b.status = 'published'
ORDER BY b.published_at DESC;

-- 4. RPC atomiques pour incrementer les compteurs
CREATE OR REPLACE FUNCTION public.increment_article_views(aid uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.articles SET views_count = COALESCE(views_count, 0) + 1 WHERE id = aid;
$$;

CREATE OR REPLACE FUNCTION public.increment_resource_views(rid uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.resources SET views_count = COALESCE(views_count, 0) + 1 WHERE id = rid;
$$;
