-- Migration: add relance_sent_at to benevoles and update admin_benevoles view

ALTER TABLE benevoles ADD COLUMN IF NOT EXISTS relance_sent_at TIMESTAMPTZ;

-- Mise à jour de la vue admin_benevoles pour inclure relance_sent_at
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
  b.relance_sent_at,
  COUNT(DISTINCT i.id) AS nb_inscriptions,
  COUNT(DISTINCT p.id) AS nb_postes_referent,
  b.repas_vendredi,
  b.repas_samedi,
  b.vegetarien
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
LEFT JOIN postes p ON b.id = p.referent_id
GROUP BY b.id;
