-- Migration 2026-07-13 : présence des utilisateurs + photos de l'app
--
-- 1. profiles.last_seen_at : horodaté par l'app à chaque ouverture (throttlé
--    5 min côté client). Affiché dans l'admin → Membres (« En ligne », « Vu·e
--    il y a … ») avec un compteur de personnes en ligne.
-- 2. Bucket public app-images : vraies photos pour les visuels de l'app
--    (défis, cartes, couvertures). Lecture publique, écriture admin.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public)
VALUES ('app-images', 'app-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS app_images_public_read ON storage.objects;
CREATE POLICY app_images_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'app-images');

DROP POLICY IF EXISTS app_images_admin_insert ON storage.objects;
CREATE POLICY app_images_admin_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'app-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS app_images_admin_update ON storage.objects;
CREATE POLICY app_images_admin_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'app-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS app_images_admin_delete ON storage.objects;
CREATE POLICY app_images_admin_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'app-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
