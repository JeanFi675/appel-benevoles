-- ============================================================================
-- MIGRATION: Add user_id to admin_benevoles view
-- ============================================================================

-- Fix Admin view for all volunteers to include user_id
-- (Needed for family grouping logic in Admin UI)

DROP VIEW IF EXISTS admin_benevoles;

CREATE OR REPLACE VIEW admin_benevoles WITH (security_invoker = true) AS
SELECT
  b.id,
  b.user_id, -- Added field
  b.email,
  b.prenom,
  b.nom,
  b.telephone,
  b.taille_tshirt,
  b.role,
  b.created_at,
  b.updated_at,
  COUNT(i.id) AS nb_inscriptions,
  COUNT(p.id) AS nb_postes_referent,
  -- Meal Info (Used in Admin Stats) - Ensure they are passed through if they exist in benevoles table
  b.repas_vendredi,
  b.repas_samedi
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
LEFT JOIN postes p ON b.id = p.referent_id
GROUP BY b.id;
