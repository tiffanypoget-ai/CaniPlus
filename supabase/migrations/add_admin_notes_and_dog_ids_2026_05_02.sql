-- Migration : profil membre admin enrichi + multi-chiens à l'inscription cours
-- Date : 2026-05-02
-- Contexte : refonte panel admin (notes admin libres) + permettre au membre
-- de choisir avec quel(s) chien(s) il vient à un cours collectif.

-- ─── 1. profiles.admin_notes ──────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

COMMENT ON COLUMN profiles.admin_notes IS
  'Notes libres de l''admin sur le membre/chien (santé, comportement, observations) — non visibles par le membre.';

-- ─── 2. course_attendance.dog_ids ─────────────────────────────────────
ALTER TABLE course_attendance
  ADD COLUMN IF NOT EXISTS dog_ids UUID[] DEFAULT '{}'::UUID[];

COMMENT ON COLUMN course_attendance.dog_ids IS
  'Liste des chiens présents au cours. Vide si membre sans chien ou inscription historique avant cette colonne.';
