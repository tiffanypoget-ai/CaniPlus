-- Migration 2026-05-11 : paiement sur place pour cours collectifs/théoriques payants
--
-- Ajoute une colonne allow_cash sur group_courses pour permettre à l'admin
-- d'autoriser le paiement sur place (cash / SumUp / TWINT à la séance)
-- sur certains cours payants.

ALTER TABLE public.group_courses
  ADD COLUMN IF NOT EXISTS allow_cash BOOLEAN NOT NULL DEFAULT false;
