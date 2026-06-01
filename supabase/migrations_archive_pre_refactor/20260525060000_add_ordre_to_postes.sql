-- ============================================================================
-- MIGRATION: Ajout de la colonne ordre à la table postes
-- ============================================================================

ALTER TABLE public.postes
ADD COLUMN IF NOT EXISTS ordre INTEGER DEFAULT 0;

COMMENT ON COLUMN public.postes.ordre IS 'Ordre d''affichage de la ligne du type de poste sur le planning interactif';
