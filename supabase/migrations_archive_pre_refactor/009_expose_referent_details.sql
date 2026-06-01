-- ============================================================================
-- MIGRATION 009: Expose Referent Details in Public Planning
-- ============================================================================

-- 1. Helper functions to get Referent details (SECURITY DEFINER)
-- These allow public access to specific fields of BENEVOLES who are REFERENTS.
-- We assume that if a benevole is assigned as a referent, their contact info should be visible.

CREATE OR REPLACE FUNCTION get_benevole_full_name(b_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT prenom || ' ' || nom
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION get_benevole_email(b_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT email
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION get_benevole_phone(b_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT telephone
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION get_benevole_full_name TO public;
GRANT EXECUTE ON FUNCTION get_benevole_email TO public;
GRANT EXECUTE ON FUNCTION get_benevole_phone TO public;

-- 2. Update public_planning view to include referent details
DROP VIEW IF EXISTS public_planning;

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
  p.referent_id, -- Expose ID if needed for grouping

  -- Referent details (Full details for contact)
  CASE
    WHEN p.referent_id IS NOT NULL THEN
      get_benevole_full_name(p.referent_id)
    ELSE NULL
  END AS referent_nom,
  
  CASE
    WHEN p.referent_id IS NOT NULL THEN
      get_benevole_email(p.referent_id)
    ELSE NULL
  END AS referent_email,

  CASE
    WHEN p.referent_id IS NOT NULL THEN
      get_benevole_phone(p.referent_id)
    ELSE NULL
  END AS referent_telephone,

  -- Comptage des inscrits
  COUNT(i.id) AS inscrits_actuels,

  -- Liste anonymisée des bénévoles (Keep anonymized for general public)
  ARRAY_AGG(
    get_benevole_name(i.benevole_id)
    ORDER BY i.created_at
  ) FILTER (WHERE i.benevole_id IS NOT NULL) AS liste_benevoles

FROM postes p
LEFT JOIN periodes per ON p.periode_id = per.id
LEFT JOIN inscriptions i ON p.id = i.poste_id
GROUP BY p.id, per.nom, per.ordre, p.referent_id;
