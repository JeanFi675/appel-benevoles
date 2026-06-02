-- Migration: refactor des vues admin pour supprimer les colonnes mortes
-- Phase: 2.2 (Code mort)
-- Anomalie: B01
-- Source: audit/10_column_usage.md (REFACTOR VIEW)

-- 1. admin_inscriptions : retirer benevole_nom, benevole_email, poste_periode
DROP VIEW IF EXISTS public.admin_inscriptions;

CREATE VIEW public.admin_inscriptions AS
SELECT
    i.id,
    i.created_at,
    tp.titre        AS poste_titre,
    p.periode_debut,
    p.periode_fin
FROM public.inscriptions i
JOIN public.benevoles    b  ON i.benevole_id = b.id
JOIN public.postes       p  ON i.poste_id    = p.id
JOIN public.type_postes  tp ON p.type_poste_id = tp.id
LEFT JOIN public.periodes per ON p.periode_id = per.id
ORDER BY p.periode_debut, b.nom;

-- 2. admin_periodes : retirer nb_postes (UNUSED)
DROP VIEW IF EXISTS public.admin_periodes;

CREATE VIEW public.admin_periodes AS
SELECT
    per.id,
    per.nom,
    per.ordre
FROM public.periodes per
ORDER BY per.ordre;
