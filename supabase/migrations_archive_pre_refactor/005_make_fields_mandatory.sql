-- ============================================================================
-- MIGRATION : Rendre les champs téléphone et taille t-shirt obligatoires
-- ============================================================================

-- 1. Mettre à jour les enregistrements existants (si NULL) pour éviter les erreurs
UPDATE benevoles 
SET telephone = '' 
WHERE telephone IS NULL;

UPDATE benevoles 
SET taille_tshirt = 'M' 
WHERE taille_tshirt IS NULL;

-- 2. Ajouter la contrainte NOT NULL
ALTER TABLE benevoles 
ALTER COLUMN telephone SET NOT NULL;

ALTER TABLE benevoles 
ALTER COLUMN taille_tshirt SET NOT NULL;
