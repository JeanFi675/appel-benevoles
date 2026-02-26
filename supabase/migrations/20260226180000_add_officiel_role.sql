-- ============================================================================
-- MIGRATION: Add officiel role
-- ============================================================================

-- 1. Ajouter le rôle 'officiel' et mettre à jour la contrainte existante
ALTER TABLE benevoles DROP CONSTRAINT IF EXISTS benevoles_role_check;
ALTER TABLE benevoles ADD CONSTRAINT benevoles_role_check CHECK (role IN ('benevole', 'referent', 'admin', 'juge', 'admin-juge', 'officiel'));
