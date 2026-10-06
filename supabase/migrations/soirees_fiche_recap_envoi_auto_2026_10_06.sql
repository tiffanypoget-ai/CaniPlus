-- ============================================================================
-- Soirées CaniPlus — envoi automatique de la fiche récap et du replay
-- ----------------------------------------------------------------------------
-- Le problème corrigé : le lendemain d'une soirée, rien ne partait tout seul.
-- L'email de replay attendait un clic dans l'admin, et le PDF de la soirée
-- n'était envoyé par rien du tout — les 5 participantes de la soirée du
-- 14 septembre ne l'ont jamais reçu.
--
-- Ce que cette migration met en place, et c'est tout :
--   1. le kind 'lendemain' dans soiree_emails_sent, pour que le verrou
--      anti-doublon couvre aussi ce nouvel envoi ;
--   2. le kind 'soiree_fiche_manquante' dans admin_notifications, pour
--      l'alerte quand 08h00 arrive sans PDF déposé.
--
-- Pas de nouveau bucket, pas de nouvelle colonne. La fiche récap est le PDF
-- déjà porté par digital_products.file_path, dans le bucket privé
-- digital-products, que l'onglet Soirées sait déposer depuis août. Une
-- première version de cette migration créait un bucket soiree-fiches et une
-- colonne webinar_access.fiche_path dédiés ; Tiffany a tranché le 06.10 — le
-- PDF de support et la fiche récap sont le même document, et il doit partir le
-- lendemain du cours. Un seul fichier, un seul endroit où le déposer.
--
-- Les participantes reçoivent ce PDF en pièce jointe d'un email. Le bucket
-- reste privé : seul le service role (edge function soiree-emails) le lit pour
-- le joindre au mail, et get-product-download continue de le servir en
-- téléchargement aux inscrites payées qui passent par l'app.
-- ============================================================================

-- ─── 1. Le nouveau kind d'email ─────────────────────────────────────────────
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

-- ─── 2. L'alerte « fiche manquante » ────────────────────────────────────────
-- Un kind dédié plutôt qu'un publish_reminder recyclé : la cloche admin et
-- l'email de notification affichent le kind tel quel, et « fiche manquante »
-- doit se lire sans ambiguïté un mardi matin. notify-admin porte la même
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
-- Les deux contraintes acceptent les nouvelles valeurs :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname IN ('soiree_emails_sent_kind_check', 'admin_notifications_kind_check');
--
-- Aucune ligne existante n'a été rejetée (les deux ALTER auraient échoué
-- sinon) : on n'ajoute que des valeurs, on n'en retire aucune.
-- ============================================================================
