-- ============================================================================
-- MIGRATION 008: Fix RLS Recursion
-- ============================================================================

-- The previous migration introduced infinite recursion because the policies
-- on 'benevoles' and 'inscriptions' were querying 'benevoles' directly to check for admin status.
-- This caused the 'benevoles' RLS policies to trigger themselves in a loop.
--
-- The fix is to use the `is_admin()` function, which is defined as SECURITY DEFINER.
-- This allows the check to run with the privileges of the function creator (postgres),
-- bypassing the RLS recursion loop.

-- 1. Fix 'benevoles' policy
DROP POLICY IF EXISTS "Admins can view all benevoles" ON benevoles;
CREATE POLICY "Admins can view all benevoles"
  ON benevoles FOR SELECT
  USING (is_admin());

-- 2. Fix 'inscriptions' policy
DROP POLICY IF EXISTS "Admins can view all inscriptions" ON inscriptions;
CREATE POLICY "Admins can view all inscriptions"
  ON inscriptions FOR SELECT
  USING (is_admin());

-- 3. Fix 'postes' policies (for consistency and safety)
DROP POLICY IF EXISTS "Admins can insert postes" ON postes;
CREATE POLICY "Admins can insert postes"
  ON postes FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update postes" ON postes;
CREATE POLICY "Admins can update postes"
  ON postes FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete postes" ON postes;
CREATE POLICY "Admins can delete postes"
  ON postes FOR DELETE
  USING (is_admin());

-- 4. Fix 'periodes' policies (for consistency and safety)
DROP POLICY IF EXISTS "Admins can insert periodes" ON periodes;
CREATE POLICY "Admins can insert periodes"
  ON periodes FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update periodes" ON periodes;
CREATE POLICY "Admins can update periodes"
  ON periodes FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete periodes" ON periodes;
CREATE POLICY "Admins can delete periodes"
  ON periodes FOR DELETE
  USING (is_admin());
