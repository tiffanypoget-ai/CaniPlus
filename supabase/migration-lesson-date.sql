-- Migration : ajouter les colonnes pour les cours privés planifiés
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS lesson_date timestamptz,
  ADD COLUMN IF NOT EXISTS lesson_notes text;
