-- ============================================================================
-- MIGRATION 003: Create periodes table with display order
-- ============================================================================

-- 1. Drop views that depend on the categorie column
DROP VIEW IF EXISTS public_planning;
DROP VIEW IF EXISTS admin_inscriptions;

-- 2. Create periodes table
CREATE TABLE IF NOT EXISTS periodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL UNIQUE,
  ordre INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Insert existing periods from postes table
INSERT INTO periodes (nom, ordre)
SELECT DISTINCT categorie, ROW_NUMBER() OVER (ORDER BY MIN(periode_debut))
FROM postes
WHERE categorie IS NOT NULL
GROUP BY categorie
ON CONFLICT (nom) DO NOTHING;

-- 4. Add periode_id column to postes table
ALTER TABLE postes
ADD COLUMN periode_id UUID REFERENCES periodes(id) ON DELETE SET NULL;

-- 5. Populate periode_id from existing categorie values
UPDATE postes p
SET periode_id = (SELECT id FROM periodes WHERE nom = p.categorie);

-- 6. Drop old categorie column
ALTER TABLE postes
DROP COLUMN categorie;

-- 7. Recreate index
DROP INDEX IF EXISTS idx_postes_categorie;
CREATE INDEX IF NOT EXISTS idx_postes_periode ON postes(periode_id);

-- 8. Enable RLS on periodes table
ALTER TABLE periodes ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies for periodes table
-- Public read
CREATE POLICY "Lecture publique des periodes"
  ON periodes FOR SELECT
  USING (true);

-- Admin insert
CREATE POLICY "Admins can insert periodes"
  ON periodes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admin update
CREATE POLICY "Admins can update periodes"
  ON periodes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admin delete
CREATE POLICY "Admins can delete periodes"
  ON periodes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 10. Recreate public_planning view with periode join
CREATE OR REPLACE VIEW public_planning AS
SELECT
  p.id AS poste_id,
  p.titre,
  p.periode_debut,
  p.periode_fin,
  p.nb_max,
  p.nb_min,
  per.nom AS periode,
  per.ordre AS periode_ordre,
  p.description,

  -- Référent anonymisé (Prénom + Initiale)
  CASE
    WHEN p.referent_id IS NOT NULL THEN
      (SELECT b.prenom || ' ' || SUBSTRING(b.nom FROM 1 FOR 1) || '.'
       FROM benevoles b
       WHERE b.id = p.referent_id)
    ELSE NULL
  END AS referent_nom,

  -- Comptage des inscrits
  COUNT(i.id) AS inscrits_actuels,

  -- Liste anonymisée des bénévoles (Prénom + Initiale)
  ARRAY_AGG(
    b.prenom || ' ' || SUBSTRING(b.nom FROM 1 FOR 1) || '.'
    ORDER BY i.created_at
  ) FILTER (WHERE b.id IS NOT NULL) AS liste_benevoles

FROM postes p
LEFT JOIN periodes per ON p.periode_id = per.id
LEFT JOIN inscriptions i ON p.id = i.poste_id
LEFT JOIN benevoles b ON i.benevole_id = b.id
GROUP BY p.id, per.nom, per.ordre;

-- 11. Recreate admin_inscriptions view
CREATE OR REPLACE VIEW admin_inscriptions AS
SELECT
  i.id,
  i.created_at,
  b.prenom || ' ' || b.nom AS benevole_nom,
  b.email AS benevole_email,
  p.titre AS poste_titre,
  per.nom AS poste_periode,
  p.periode_debut,
  p.periode_fin
FROM inscriptions i
JOIN benevoles b ON i.benevole_id = b.id
JOIN postes p ON i.poste_id = p.id
LEFT JOIN periodes per ON p.periode_id = per.id
ORDER BY p.periode_debut, b.nom;

-- 12. Create admin view for periodes management
CREATE OR REPLACE VIEW admin_periodes AS
SELECT
  per.id,
  per.nom,
  per.ordre,
  COUNT(p.id) AS nb_postes
FROM periodes per
LEFT JOIN postes p ON p.periode_id = per.id
GROUP BY per.id
ORDER BY per.ordre;

-- 13. Add comments for documentation
COMMENT ON TABLE periodes IS 'Competition periods with display order';
COMMENT ON COLUMN periodes.nom IS 'Period name (e.g., "Qualifications Samedi", "Finales Dimanche")';
COMMENT ON COLUMN periodes.ordre IS 'Display order (lower numbers appear first)';
COMMENT ON COLUMN postes.periode_id IS 'Reference to the period this shift belongs to';
COMMENT ON VIEW admin_periodes IS 'Admin view showing all periods with shift counts';
