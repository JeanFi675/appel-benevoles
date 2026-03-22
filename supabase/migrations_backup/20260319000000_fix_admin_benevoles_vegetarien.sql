-- Migration: Restore vegetarien column in admin_benevoles view
-- This column was accidentally dropped in 20260317000000_fix_admin_benevoles_count.sql

DROP VIEW IF EXISTS admin_benevoles;

CREATE VIEW admin_benevoles WITH (security_invoker = true) AS
SELECT
  b.id,
  b.user_id,
  b.email,
  b.prenom,
  b.nom,
  b.telephone,
  b.taille_tshirt,
  b.role,
  b.created_at,
  b.updated_at,
  COUNT(DISTINCT i.id) AS nb_inscriptions,
  COUNT(DISTINCT p.id) AS nb_postes_referent,
  b.repas_vendredi,
  b.repas_samedi,
  b.vegetarien
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
LEFT JOIN postes p ON b.id = p.referent_id
GROUP BY b.id;
