-- ============================================================================
-- MIGRATION: Add 'SANS' option to taille_tshirt
-- ============================================================================

-- 1. Relâcher la contrainte existante sur la colonne taille_tshirt
ALTER TABLE benevoles DROP CONSTRAINT IF EXISTS benevoles_taille_tshirt_check;

-- 2. Ajouter la nouvelle contrainte incluant 'SANS'
ALTER TABLE benevoles ADD CONSTRAINT benevoles_taille_tshirt_check 
  CHECK (taille_tshirt IN ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'SANS'));
