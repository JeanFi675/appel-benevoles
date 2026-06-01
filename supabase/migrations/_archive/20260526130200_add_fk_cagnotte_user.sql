-- Migration: ajout de la FK cagnotte_transactions.user_id → auth.users(id)
-- Phase: 2.3 (Contraintes)
-- Anomalie: H02
--
-- 0 ligne orpheline confirmée dans le dump 2026-05-25 (audit/11_missing_fk.md Partie 3).
-- Choix ON DELETE CASCADE cohérent avec benevoles.user_id (même cible auth.users).

ALTER TABLE public.cagnotte_transactions
    ADD CONSTRAINT cagnotte_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
