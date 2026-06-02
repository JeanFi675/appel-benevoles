-- Migration: ajout des contraintes NOT NULL manquantes
-- Phase: 2.3 (Contraintes)
-- Anomalies: H08 (14 colonnes safe + 2 extras audit) + H09 (telephone post-backfill)
-- Source: audit/13_constraints.md §1.6.1 (synthèse 14 ✅ NOT NULL safe + 1 backfill).
--
-- Toutes les colonnes ciblées ont 0 NULL en base (snapshot 2026-05-25).
-- Prérequis : 20260526130000_backfill_telephone_inconnu.sql appliquée (12 lignes backfillées).

-- Audit columns (created_at / updated_at) — défaut now() en place.
ALTER TABLE public.benevoles              ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.benevoles              ALTER COLUMN updated_at        SET NOT NULL;
ALTER TABLE public.cagnotte_transactions  ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.config                 ALTER COLUMN updated_at        SET NOT NULL;
ALTER TABLE public.inscriptions           ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.jours                  ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.periodes               ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.postes                 ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.programme              ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.repas                  ALTER COLUMN created_at        SET NOT NULL;
ALTER TABLE public.type_postes            ALTER COLUMN created_at        SET NOT NULL;

-- Booléens à default false (sémantique tri-état NULL non utilisée).
ALTER TABLE public.benevoles              ALTER COLUMN t_shirt_recupere  SET NOT NULL;

-- Array avec default '{}' (cohérent avec cagnotte_forcee = false).
ALTER TABLE public.benevoles              ALTER COLUMN cagnotte_forcee_jours SET NOT NULL;

-- FK obligatoires métier.
ALTER TABLE public.cagnotte_transactions  ALTER COLUMN benevole_id       SET NOT NULL;
ALTER TABLE public.postes                 ALTER COLUMN periode_id        SET NOT NULL;

-- Libellé requis métier.
ALTER TABLE public.cagnotte_transactions  ALTER COLUMN description       SET NOT NULL;

-- Téléphone (H09, post-backfill).
ALTER TABLE public.benevoles              ALTER COLUMN telephone         SET NOT NULL;
