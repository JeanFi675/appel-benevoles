-- ============================================================================
-- MIGRATION 004: Add referent role
-- ============================================================================

-- 1. Update role check constraint to include referent
ALTER TABLE benevoles
DROP CONSTRAINT IF EXISTS benevoles_role_check;

ALTER TABLE benevoles
ADD CONSTRAINT benevoles_role_check
CHECK (role IN ('benevole', 'referent', 'admin'));

-- 2. Update admin_benevoles view to show role
DROP VIEW IF EXISTS admin_benevoles;

CREATE OR REPLACE VIEW admin_benevoles AS
SELECT
  b.id,
  b.email,
  b.prenom,
  b.nom,
  b.telephone,
  b.taille_tshirt,
  b.role,
  b.created_at,
  b.updated_at,
  COUNT(i.id) AS nb_inscriptions,
  COUNT(p.id) AS nb_postes_referent
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
LEFT JOIN postes p ON b.id = p.referent_id
GROUP BY b.id;

-- 3. Add comment
COMMENT ON CONSTRAINT benevoles_role_check ON benevoles IS 'User role: benevole (default), referent (shift supervisor), or admin (full access)';
