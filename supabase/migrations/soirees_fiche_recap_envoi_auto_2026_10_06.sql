-- ============================================================================
-- Soirées CaniPlus — envoi automatique de la fiche récap et du replay
-- Branche soirees-envoi-auto. NON APPLIQUÉ en production au moment du commit :
-- attend le feu vert de Tiffany (objectif : avant la soirée du 16 novembre).
-- ----------------------------------------------------------------------------
-- Le problème corrigé : le lendemain d'une soirée, rien ne partait tout seul.
-- L'email de replay attendait un clic dans l'admin, et la fiche récap PDF
-- n'était envoyée par rien du tout — les 5 participantes de la soirée du
-- 14 septembre ne l'ont jamais reçue.
--
-- Ce que cette migration met en place :
--   1. un bucket privé soiree-fiches, où Tiffany dépose la fiche récap, et
--      webinar_access.fiche_path qui la rattache à la soirée ;
--   2. le kind 'lendemain' dans soiree_emails_sent, pour que le verrou
--      anti-doublon couvre aussi ce nouvel envoi ;
--   3. le kind 'soiree_fiche_manquante' dans admin_notifications, pour
--      l'alerte quand 08h00 arrive sans fiche déposée.
--
-- Les participantes reçoivent tout par email : ce bucket n'est jamais exposé,
-- ni en lecture publique, ni par URL signée vers une cliente. Seul le service
-- role (edge function soiree-emails) lit le PDF, pour le joindre au mail.
-- ============================================================================

-- ─── 1. Bucket privé pour les fiches récap ──────────────────────────────────
-- Séparé du bucket digital-products, qui sert aux produits téléchargeables
-- depuis l'app (get-product-download). Ici c'est une pièce jointe d'email :
-- le plafond de 10 Mo et le filtre PDF évitent qu'un fichier trop gros ou
-- d'un autre type fasse échouer l'appel Brevo au petit matin.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('soiree-fiches', 'soiree-fiches', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['application/pdf'];

-- Quatre policies réservées au rôle admin, sur le modèle exact du bucket
-- digital-products (cf. fix_digital_products_storage_policies_2026_08_19.sql).
-- Les quatre sont nécessaires : SoireesAdminTab uploade avec { upsert: true },
-- donc un INSERT ... ON CONFLICT DO UPDATE, que Postgres refuse sans les
-- policies UPDATE et SELECT.
DROP POLICY IF EXISTS "soiree_fiches_admin_upload" ON storage.objects;
CREATE POLICY "soiree_fiches_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'soiree-fiches'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "soiree_fiches_admin_update" ON storage.objects;
CREATE POLICY "soiree_fiches_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'soiree-fiches'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'soiree-fiches'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "soiree_fiches_admin_select" ON storage.objects;
CREATE POLICY "soiree_fiches_admin_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'soiree-fiches'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "soiree_fiches_admin_delete" ON storage.objects;
CREATE POLICY "soiree_fiches_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'soiree-fiches'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ─── 2. La fiche rattachée à la soirée ──────────────────────────────────────
-- Nullable : la fiche peut être déposée longtemps avant la soirée comme le
-- lendemain matin, et une soirée sans fiche reste une ligne valide.
ALTER TABLE public.webinar_access
  ADD COLUMN IF NOT EXISTS fiche_path TEXT;

COMMENT ON COLUMN public.webinar_access.fiche_path IS
  'Chemin de la fiche récap PDF dans le bucket privé soiree-fiches. Jointe à '
  'l''email du lendemain par soiree-emails (action lendemain). Jamais exposée '
  'par URL signée : les participantes la reçoivent en pièce jointe.';

-- ─── 3. Le nouveau kind d'email ─────────────────────────────────────────────
-- Même rôle que les quatre autres : la contrainte UNIQUE
-- (product_id, email, kind) sert de verrou anti-doublon, l'insert ayant lieu
-- avant l'envoi. Sans cette valeur autorisée, l'insert échouerait en 23514 et
-- aucun email du lendemain ne partirait.
ALTER TABLE public.soiree_emails_sent
  DROP CONSTRAINT IF EXISTS soiree_emails_sent_kind_check;
ALTER TABLE public.soiree_emails_sent
  ADD CONSTRAINT soiree_emails_sent_kind_check
  CHECK (kind = ANY (ARRAY[
    'confirmation'::text,
    'rappel_j1'::text,
    'rappel_jour_j'::text,
    'lendemain'::text,
    'replay'::text
  ]));

-- ─── 4. L'alerte « fiche manquante » ────────────────────────────────────────
-- Un kind dédié plutôt qu'un publish_reminder recyclé : la cloche admin et
-- l'email de notification affichent le kind tel quel, et « fiche manquante »
-- doit se lire sans ambiguïté un lundi soir. notify-admin porte la même
-- valeur dans ses deux listes (validKinds et userEventKinds).
ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_kind_check;
ALTER TABLE public.admin_notifications
  ADD CONSTRAINT admin_notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'payment_received'::text,
    'private_request'::text,
    'new_member'::text,
    'premium_canceled'::text,
    'course_canceled'::text,
    'publish_reminder'::text,
    'newsletter_signup'::text,
    'soiree_fiche_manquante'::text
  ]));

-- ============================================================================
-- Contrôles après application
-- ----------------------------------------------------------------------------
-- Le bucket est privé, plafonné, limité au PDF :
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'soiree-fiches';
--
-- Quatre policies, et rien de visible hors admin :
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='storage' AND tablename='objects'
--     AND policyname LIKE 'soiree_fiches%' ORDER BY cmd;
--
--   BEGIN; SET LOCAL ROLE anon;
--   SELECT count(*) FROM storage.objects WHERE bucket_id='soiree-fiches';
--   ROLLBACK;   -- doit renvoyer 0
--
-- La colonne existe :
--   SELECT fiche_path FROM public.webinar_access LIMIT 1;
--
-- Les deux contraintes acceptent les nouvelles valeurs :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname IN ('soiree_emails_sent_kind_check', 'admin_notifications_kind_check');
-- ============================================================================
