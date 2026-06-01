-- Migration: Allow referents to view benevoles inscribed on their postes
-- Without this policy, the benevoles(*) join in loadReferentInscriptions()
-- returns null for all volunteers (RLS blocks cross-user reads), causing
-- getReferentViewData() to skip every row and show an empty list.

-- SECURITY DEFINER avoids RLS recursion (the function runs with postgres
-- privileges so it can freely query benevoles/inscriptions/postes internally).
CREATE OR REPLACE FUNCTION public.is_referent_for_benevole(target_benevole_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM inscriptions i
    JOIN postes p ON i.poste_id = p.id
    JOIN benevoles ref ON p.referent_id = ref.id
    WHERE i.benevole_id = target_benevole_id
      AND ref.user_id = auth.uid()
  );
$$;

-- Allow referents to read benevoles inscribed on their postes
DROP POLICY IF EXISTS "Referents can view benevoles on their postes" ON benevoles;
CREATE POLICY "Referents can view benevoles on their postes"
  ON benevoles FOR SELECT
  USING (is_referent_for_benevole(id));
