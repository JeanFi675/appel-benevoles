-- Migration: backfill benevoles.telephone NULL → 'INCONNU'
-- Phase: 2.3 (Contraintes)
-- Anomalie: H09 (décision mainteneur D2)
--
-- 12 lignes attendues sur 140 (snapshot 2026-05-25).
-- Doit être exécutée AVANT 20260526130100_add_not_null_constraints.sql.

DO $$
DECLARE
    updated_count integer;
BEGIN
    UPDATE public.benevoles
       SET telephone = 'INCONNU'
     WHERE telephone IS NULL;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '[H09] benevoles.telephone backfill: % lignes mises à jour avec ''INCONNU''', updated_count;
END$$;
