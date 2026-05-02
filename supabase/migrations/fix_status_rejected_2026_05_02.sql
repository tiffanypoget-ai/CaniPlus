-- Migration : autoriser le status 'rejected' pour les demandes de cours privé
-- Date : 2026-05-02
-- Contexte : le bouton "Refuser la demande" dans l'admin tentait de passer
-- status='rejected' mais la contrainte CHECK n'autorisait que pending/confirmed/cancelled.

ALTER TABLE private_course_requests
  DROP CONSTRAINT IF EXISTS private_course_requests_status_check;

ALTER TABLE private_course_requests
  ADD CONSTRAINT private_course_requests_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'rejected'::text]));
