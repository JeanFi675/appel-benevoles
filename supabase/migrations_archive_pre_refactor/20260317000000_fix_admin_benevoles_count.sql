-- Migration: Fix nb_inscriptions count in admin_benevoles view
-- The double LEFT JOIN (inscriptions + postes) created a cartesian product,
-- causing nb_inscriptions to be multiplied by nb_postes_referent.
-- Fix: use COUNT(DISTINCT ...) for both counts.

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
  b.repas_samedi
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
LEFT JOIN postes p ON b.id = p.referent_id
GROUP BY b.id;
