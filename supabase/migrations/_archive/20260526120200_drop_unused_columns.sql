-- Migration: suppression des colonnes mortes
-- Phase: 2.2 (Code mort)
-- Anomalie: B01
-- Source: audit/10_column_usage.md (DROP COLUMN)
--
-- Prérequis : 20260526120100_update_debit_cagnotte_drop_auteur.sql doit être appliquée
--             (sinon l'INSERT dans cagnotte_transactions casse).

ALTER TABLE public.benevoles
    DROP COLUMN IF EXISTS presence_samedi,
    DROP COLUMN IF EXISTS presence_dimanche;

ALTER TABLE public.config
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE public.cagnotte_transactions
    DROP COLUMN IF EXISTS auteur_id;
