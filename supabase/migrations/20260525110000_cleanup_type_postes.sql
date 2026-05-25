-- ============================================================================
-- MIGRATION: Nettoyage des types de postes obsolètes et non reliés à des postes
-- ============================================================================

-- Supprimer tous les types de postes qui ne possèdent aucun créneau (shift) associé
DELETE FROM public.type_postes
WHERE id NOT IN (
    SELECT DISTINCT type_poste_id 
    FROM public.postes
);
