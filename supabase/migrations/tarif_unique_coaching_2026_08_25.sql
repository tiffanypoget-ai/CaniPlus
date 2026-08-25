-- supabase/migrations/tarif_unique_coaching_2026_08_25.sql
-- Tarif unique « Coaching personnalisé » : 60 CHF l'heure, à domicile comme en visio.
--
-- Aucun montant n'est stocké en base : les tarifs vivent dans le code
-- (CoachingRequestModal, edge functions pay-coaching-request et
-- create-coaching-checkout). Cette migration met seulement à jour le commentaire
-- de colonne, devenu faux depuis l'abandon du tarif visio décoté à 50 CHF.

COMMENT ON COLUMN private_course_requests.price_chf IS
  'Prix facturé : 60 CHF l''heure (visio comme à domicile) + frais de déplacement éventuels (valeur calculée côté front)';
