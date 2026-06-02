-- Migration: contrainte EXCLUDE pour interdire les chevauchements horaires de postes du même type
-- Phase: 2.3 (Contraintes)
-- Anomalie: B03 (UNIQUE postes.(periode_id, type_poste_id) revisité)
-- Décision mainteneur: D3 (2026-05-26)
--
-- Remplace l'idée d'un UNIQUE simple (periode_id, type_poste_id), qui aurait interdit
-- les créneaux consécutifs légitimes. La sémantique cible :
--   « pour un même type de poste, deux créneaux ne peuvent pas se chevaucher dans le temps ».
--
-- Note méthodologique : le check des chevauchements se fait sur tsrange(periode_debut, periode_fin)
-- indépendamment de periode_id (le chevauchement est temporel, pas par période).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.postes
    ADD CONSTRAINT postes_no_overlap_same_type
    EXCLUDE USING gist (
        type_poste_id WITH =,
        tstzrange(periode_debut, periode_fin) WITH &&
    );
