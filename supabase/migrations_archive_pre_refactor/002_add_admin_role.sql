-- ============================================================================
-- MIGRATION 002: Add Admin Role System
-- ============================================================================

-- 1. Add role column to benevoles table
ALTER TABLE benevoles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'benevole'
CHECK (role IN ('benevole', 'admin'));

-- 2. Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_benevoles_role ON benevoles(role);

-- 3. Update RLS policies for admin access to postes table

-- Allow admins to insert postes
CREATE POLICY "Admins can insert postes"
  ON postes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Allow admins to update postes
CREATE POLICY "Admins can update postes"
  ON postes FOR UPDATE
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

-- Allow admins to delete postes
CREATE POLICY "Admins can delete postes"
  ON postes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Create admin view for managing all data

-- Admin view for all volunteers with full details
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
  COUNT(i.id) AS nb_inscriptions
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
GROUP BY b.id;

-- Admin view for detailed inscriptions
CREATE OR REPLACE VIEW admin_inscriptions AS
SELECT
  i.id,
  i.created_at,
  b.prenom || ' ' || b.nom AS benevole_nom,
  b.email AS benevole_email,
  p.titre AS poste_titre,
  p.categorie AS poste_categorie,
  p.periode_debut,
  p.periode_fin
FROM inscriptions i
JOIN benevoles b ON i.benevole_id = b.id
JOIN postes p ON i.poste_id = p.id
ORDER BY p.periode_debut, b.nom;

-- 5. Grant access to admin views (RLS will control who can query them)

-- Enable RLS on views is not needed as they inherit from base tables
-- But we can add helper function to check if user is admin

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM benevoles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Comments for documentation
COMMENT ON COLUMN benevoles.role IS 'User role: benevole (default) or admin. Set manually in Supabase dashboard.';
COMMENT ON FUNCTION is_admin() IS 'Returns true if current user has admin role.';
COMMENT ON VIEW admin_benevoles IS 'Admin-only view showing all volunteers with full details and inscription counts.';
COMMENT ON VIEW admin_inscriptions IS 'Admin-only view showing all registrations with full volunteer details.';
