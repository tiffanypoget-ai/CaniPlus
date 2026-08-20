-- ============================================================================
-- Bucket digital-products : policies UPDATE et SELECT manquantes pour l'admin
-- Appliqué en production le 19 août 2026.
-- ----------------------------------------------------------------------------
-- Symptôme : « Upload du PDF impossible : new row violates row-level security
-- policy » au dépôt d'une fiche depuis l'onglet Soirées de l'admin, alors que
-- le compte a bien profiles.role = 'admin'.
--
-- Cause : add_boutique_tables.sql n'avait créé que les policies INSERT et
-- DELETE sur ce bucket. Or SoireesAdminTab (comme la boutique) uploade avec
-- supabase.storage.upload(..., { upsert: true }), ce qui exécute un
-- INSERT ... ON CONFLICT DO UPDATE. Postgres exige alors aussi les policies
-- UPDATE et SELECT ; sans elles, il rejette l'insertion.
--
-- Pourquoi si tard : personne n'avait encore déposé de fichier depuis l'app.
-- Les PDF de la boutique avaient été mis à la main dans le dashboard Supabase,
-- en service_role, qui contourne la RLS.
--
-- On reprend exactement le modèle des autres buckets d'administration
-- (app_images_admin_update, editorial_images_admin_update).
--
-- Le bucket reste privé. Ces deux policies sont réservées au rôle 'admin' :
-- vérifié après application, un visiteur (anon) comme un membre connecté
-- (authenticated) voient 0 fichier. Les clientes n'y accèdent que par une URL
-- signée délivrée par get-webinar-access ou get-product-download, après
-- vérification de l'achat payé.
-- ============================================================================

DROP POLICY IF EXISTS "digital_products_admin_update" ON storage.objects;
CREATE POLICY "digital_products_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'digital-products'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'digital-products'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "digital_products_admin_select" ON storage.objects;
CREATE POLICY "digital_products_admin_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'digital-products'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Contrôle : quatre policies sur le bucket, et rien de visible hors admin.
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='storage' AND tablename='objects'
--     AND policyname LIKE 'digital_products%' ORDER BY cmd;
--
--   BEGIN; SET LOCAL ROLE anon;
--   SELECT count(*) FROM storage.objects WHERE bucket_id='digital-products';
--   ROLLBACK;   -- doit renvoyer 0
