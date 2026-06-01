-- ============================================================================
-- MIGRATION: Ajout de l'option de repas végétarien
-- ============================================================================

-- 1. Ajouter la colonne 'vegetarien' à la table benevoles
ALTER TABLE benevoles 
  ADD COLUMN IF NOT EXISTS vegetarien BOOLEAN DEFAULT false;

-- 2. Mettre à jour la vue admin_benevoles pour exposer la colonne
DROP VIEW IF EXISTS admin_benevoles;

CREATE OR REPLACE VIEW admin_benevoles WITH (security_invoker = true) AS
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
  COUNT(i.id) AS nb_inscriptions,
  COUNT(p.id) AS nb_postes_referent,
  -- Infos de repas
  b.repas_vendredi,
  b.repas_samedi,
  b.vegetarien
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
LEFT JOIN postes p ON b.id = p.referent_id
GROUP BY b.id;
