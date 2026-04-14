-- Migration : ajouter la colonne image_url à la table news
-- À exécuter dans Supabase Dashboard > SQL Editor

ALTER TABLE news ADD COLUMN IF NOT EXISTS image_url TEXT;
