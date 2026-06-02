-- Migration: policies RLS uniformisées (Phase 3.3.2)
-- Spec : security/rls_matrix.md §2
-- Convention de nommage : <table>_<role>_<op>[_<scope>]
--
-- Cette migration :
--   1) DROP toutes les policies existantes sur public.*
--   2) DROP la fonction obsolète check_referent_access (D7 - R06)
--   3) CREATE les ~37 policies cibles selon la matrice
--
-- Toutes les policies n'utilisent que :
--   - des comparaisons directes auth.uid() = col
--   - des helpers SECURITY DEFINER (auth_has_role, is_admin, is_own_benevole,
--     is_referent_for_benevole, is_referent_for_poste)
-- => aucune sous-requête sur une table à RLS dans une expression de policy
--    (cf. revue récursion Phase 3.3.3).

-- =========================================================================
-- 1) Drop des policies existantes (idempotent)
-- =========================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END
$$;

-- =========================================================================
-- 2) Drop de check_referent_access (D7 / R06)
-- =========================================================================

DROP FUNCTION IF EXISTS public.check_referent_access(uuid);

-- =========================================================================
-- 3) Policies par table
-- =========================================================================

-- -------------------------------------------------------------------------
-- 3.1) benevoles
-- -------------------------------------------------------------------------
-- self : own row (4 op) ; referent : SELECT managed ; admin : ALL

CREATE POLICY benevoles_self_all
  ON public.benevoles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY benevoles_referent_select_managed
  ON public.benevoles
  FOR SELECT
  TO authenticated
  USING (public.is_referent_for_benevole(id));

CREATE POLICY benevoles_admin_all
  ON public.benevoles
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.2) inscriptions  (UPDATE = DENY pour tous - aucune policy UPDATE)
-- -------------------------------------------------------------------------

CREATE POLICY inscriptions_self_select
  ON public.inscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_own_benevole(benevole_id));

CREATE POLICY inscriptions_self_insert
  ON public.inscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_own_benevole(benevole_id));

CREATE POLICY inscriptions_self_delete
  ON public.inscriptions
  FOR DELETE
  TO authenticated
  USING (public.is_own_benevole(benevole_id));

CREATE POLICY inscriptions_referent_select_managed
  ON public.inscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_referent_for_poste(poste_id));

CREATE POLICY inscriptions_admin_select
  ON public.inscriptions
  FOR SELECT
  TO authenticated
  USING (public.auth_has_role('admin'::role_type));

CREATE POLICY inscriptions_admin_insert
  ON public.inscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_has_role('admin'::role_type));

CREATE POLICY inscriptions_admin_delete
  ON public.inscriptions
  FOR DELETE
  TO authenticated
  USING (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.3) postes
-- -------------------------------------------------------------------------

CREATE POLICY postes_public_select
  ON public.postes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY postes_admin_all
  ON public.postes
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.4) periodes
-- -------------------------------------------------------------------------

CREATE POLICY periodes_public_select
  ON public.periodes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY periodes_admin_all
  ON public.periodes
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.5) type_postes
-- -------------------------------------------------------------------------

CREATE POLICY type_postes_public_select
  ON public.type_postes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY type_postes_admin_all
  ON public.type_postes
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.6) programmes
-- -------------------------------------------------------------------------

CREATE POLICY programmes_public_select
  ON public.programmes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY programmes_admin_all
  ON public.programmes
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.7) jours
-- -------------------------------------------------------------------------

CREATE POLICY jours_public_select
  ON public.jours
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY jours_admin_all
  ON public.jours
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.8) repas
-- -------------------------------------------------------------------------

CREATE POLICY repas_public_select
  ON public.repas
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY repas_admin_all
  ON public.repas
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.9) benevole_repas  (UPDATE = DENY pour tous)
-- -------------------------------------------------------------------------

CREATE POLICY benevole_repas_self_select
  ON public.benevole_repas
  FOR SELECT
  TO authenticated
  USING (public.is_own_benevole(benevole_id));

CREATE POLICY benevole_repas_self_insert
  ON public.benevole_repas
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_own_benevole(benevole_id));

CREATE POLICY benevole_repas_self_delete
  ON public.benevole_repas
  FOR DELETE
  TO authenticated
  USING (public.is_own_benevole(benevole_id));

CREATE POLICY benevole_repas_admin_select
  ON public.benevole_repas
  FOR SELECT
  TO authenticated
  USING (public.auth_has_role('admin'::role_type));

CREATE POLICY benevole_repas_admin_insert
  ON public.benevole_repas
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_has_role('admin'::role_type));

CREATE POLICY benevole_repas_admin_delete
  ON public.benevole_repas
  FOR DELETE
  TO authenticated
  USING (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.10) benevole_cagnotte_periodes
-- -------------------------------------------------------------------------

CREATE POLICY benevole_cagnotte_periodes_self_select
  ON public.benevole_cagnotte_periodes
  FOR SELECT
  TO authenticated
  USING (public.is_own_benevole(benevole_id));

CREATE POLICY benevole_cagnotte_periodes_admin_all
  ON public.benevole_cagnotte_periodes
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.11) cagnotte_transactions  (UPDATE/DELETE = DENY pour tous y compris admin)
-- -------------------------------------------------------------------------
-- Note : INSERT côté bénévole se fait via RPC debit_cagnotte_public (SECURITY DEFINER, bypass RLS)

CREATE POLICY cagnotte_transactions_self_select
  ON public.cagnotte_transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY cagnotte_transactions_admin_select
  ON public.cagnotte_transactions
  FOR SELECT
  TO authenticated
  USING (public.auth_has_role('admin'::role_type));

CREATE POLICY cagnotte_transactions_admin_insert
  ON public.cagnotte_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.12) orphan_relances  (admin only)
-- -------------------------------------------------------------------------

CREATE POLICY orphan_relances_admin_all
  ON public.orphan_relances
  FOR ALL
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));

-- -------------------------------------------------------------------------
-- 3.13) config  (SELECT public, INSERT/UPDATE admin, DELETE = DENY pour tous)
-- -------------------------------------------------------------------------

CREATE POLICY config_public_select
  ON public.config
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY config_admin_insert
  ON public.config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_has_role('admin'::role_type));

CREATE POLICY config_admin_update
  ON public.config
  FOR UPDATE
  TO authenticated
  USING (public.auth_has_role('admin'::role_type))
  WITH CHECK (public.auth_has_role('admin'::role_type));
