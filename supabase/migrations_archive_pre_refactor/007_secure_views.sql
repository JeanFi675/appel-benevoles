-- ============================================================================
-- MIGRATION 007: Secure Views and Fix Admin Access
-- ============================================================================

-- 1. Helper function for anonymized names (SECURITY DEFINER)
-- This allows public access to anonymized names without exposing the benevoles table
CREATE OR REPLACE FUNCTION get_benevole_name(b_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT prenom || ' ' || SUBSTRING(nom FROM 1 FOR 1) || '.'
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION get_benevole_name TO public;

-- 2. Ensure Admins can view ALL benevoles
-- (We use user_id to identify the admin user)
CREATE POLICY "Admins can view all benevoles"
  ON benevoles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Ensure Admins can view ALL inscriptions
CREATE POLICY "Admins can view all inscriptions"
  ON inscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Update existing Admin policies on 'postes' and 'periodes' to use user_id instead of id
-- (If they were relying on id = auth.uid(), they might be broken now if id != user_id)

-- Postes
DROP POLICY IF EXISTS "Admins can insert postes" ON postes;
DROP POLICY IF EXISTS "Admins can update postes" ON postes;
DROP POLICY IF EXISTS "Admins can delete postes" ON postes;

CREATE POLICY "Admins can insert postes"
  ON postes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update postes"
  ON postes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete postes"
  ON postes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Periodes
DROP POLICY IF EXISTS "Admins can insert periodes" ON periodes;
DROP POLICY IF EXISTS "Admins can update periodes" ON periodes;
DROP POLICY IF EXISTS "Admins can delete periodes" ON periodes;

CREATE POLICY "Admins can insert periodes"
  ON periodes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update periodes"
  ON periodes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete periodes"
  ON periodes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Recreate public_planning view using the function and security_invoker
CREATE OR REPLACE VIEW public_planning WITH (security_invoker = true) AS
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

  -- Référent anonymisé via function
  CASE
    WHEN p.referent_id IS NOT NULL THEN
      get_benevole_name(p.referent_id)
    ELSE NULL
  END AS referent_nom,

  -- Comptage des inscrits
  COUNT(i.id) AS inscrits_actuels,

  -- Liste anonymisée des bénévoles via function
  ARRAY_AGG(
    get_benevole_name(i.benevole_id)
    ORDER BY i.created_at
  ) FILTER (WHERE i.benevole_id IS NOT NULL) AS liste_benevoles

FROM postes p
LEFT JOIN periodes per ON p.periode_id = per.id
LEFT JOIN inscriptions i ON p.id = i.poste_id
-- No join to benevoles needed anymore
GROUP BY p.id, per.nom, per.ordre;

-- 6. Secure Admin views
ALTER VIEW admin_benevoles SET (security_invoker = true);
ALTER VIEW admin_inscriptions SET (security_invoker = true);
ALTER VIEW admin_periodes SET (security_invoker = true);

-- 7. Update is_admin function to use user_id
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM benevoles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
