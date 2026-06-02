-- Migration: ajout des contraintes UNIQUE
-- Phase: 2.3 (Contraintes)
-- Anomalies: B04 (2 UNIQUE safe) + B03/D4 (programme.(date_ref, heure))
--
-- Pré-requis programme : audit/notes.md (2026-05-26) « Divergence D4 vs réalité » —
--   la prod contient 20 doublons exactement identiques sur (date_ref, heure).
--   Bloc DELETE préalable, idempotent, traçable via RAISE NOTICE.

-- 1. Déduplication préalable de programme (20 doublons → 20 lignes en trop à supprimer).
DO $$
DECLARE
    deleted_count integer;
BEGIN
    WITH dedup AS (
        SELECT id
          FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY date_ref, heure ORDER BY id) AS rn
              FROM public.programme
          ) ranked
         WHERE rn > 1
    )
    DELETE FROM public.programme
     WHERE id IN (SELECT id FROM dedup);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[D4] programme dedup: % lignes en doublon supprimées', deleted_count;
END$$;

-- 2. UNIQUE benevoles.(user_id, prenom, nom) — patron famille (M01), 0 violation en base.
ALTER TABLE public.benevoles
    ADD CONSTRAINT benevoles_user_prenom_nom_uniq
    UNIQUE (user_id, prenom, nom);

-- 3. UNIQUE repas.nom — 0 doublon en base.
ALTER TABLE public.repas
    ADD CONSTRAINT repas_nom_uniq
    UNIQUE (nom);

-- 4. UNIQUE programme.(date_ref, heure) — décision D4 (après dédup).
ALTER TABLE public.programme
    ADD CONSTRAINT programme_date_heure_uniq
    UNIQUE (date_ref, heure);
