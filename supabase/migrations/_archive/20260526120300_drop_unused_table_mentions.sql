-- Migration: suppression de la table morte mentions
-- Phase: 2.2 (Code mort)
-- Anomalies: C01 (sécurité — anon writes via policy "Allow all for anon") + B01 (table UNUSED)
-- Source: audit/09_table_usage.md (statut UNUSED, aucune référence code ni trigger)
--
-- Effet de bord : ferme définitivement la vulnérabilité C01.

DROP POLICY IF EXISTS "Allow all for anon" ON public.mentions;
DROP TABLE  IF EXISTS public.mentions CASCADE;

-- Enums orphelins (n'étaient utilisés que par mentions)
DROP TYPE IF EXISTS public.mention_platform;
DROP TYPE IF EXISTS public.mention_status;
