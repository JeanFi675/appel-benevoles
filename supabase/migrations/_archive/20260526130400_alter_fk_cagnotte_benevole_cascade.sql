-- Migration: durcir la FK cagnotte_transactions.benevole_id en ON DELETE CASCADE
-- Phase: 2.3 (Contraintes)
-- Anomalie: M03 (#7)
-- Décision mainteneur: D6.b (2026-05-26)
--
-- Avant : ON DELETE SET NULL (laisse des transactions orphelines à la suppression d'un bénévole).
-- Après : ON DELETE CASCADE (suppression d'un bénévole = suppression de son historique).
-- 0 ligne orpheline en base (audit/11_missing_fk.md Partie 3).

ALTER TABLE public.cagnotte_transactions
    DROP CONSTRAINT IF EXISTS cagnotte_transactions_benevole_id_fkey;

ALTER TABLE public.cagnotte_transactions
    ADD CONSTRAINT cagnotte_transactions_benevole_id_fkey
    FOREIGN KEY (benevole_id) REFERENCES public.benevoles(id) ON DELETE CASCADE;
