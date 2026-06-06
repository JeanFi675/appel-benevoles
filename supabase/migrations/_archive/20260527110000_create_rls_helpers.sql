-- Migration: helpers RLS (Phase 3.3.1)
-- Crée les fonctions SECURITY DEFINER utilisées par toutes les policies RLS
-- de la Phase 3.3.2 pour éviter récursion et standardiser le contrôle d'accès.
--
-- Helpers :
--   - auth_has_role(role_type)    : test du rôle applicatif depuis auth.uid()
--   - is_admin()                  : alias de auth_has_role('admin')
--   - is_own_benevole(uuid)       : test d'appartenance d'une ligne benevole_id à l'utilisateur courant
--   - is_referent_for_poste(uuid) : test "auth.uid() est le référent de ce poste"
--
-- Convention : STABLE SECURITY DEFINER SET search_path = public (cf. matrice §1.3).

-- =========================================================================
-- 1) auth_has_role(role_type) : remplace les EXISTS(SELECT 1 FROM benevoles ...) inline
-- =========================================================================

CREATE OR REPLACE FUNCTION public.auth_has_role(target_role role_type)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM benevoles
    WHERE user_id = auth.uid()
      AND role = target_role
  );
$$;

COMMENT ON FUNCTION public.auth_has_role(role_type) IS
  'Phase 3.3 : test du rôle applicatif courant via auth.uid(). SECURITY DEFINER -> bypass RLS de benevoles, pas de récursion.';

-- =========================================================================
-- 2) is_admin() : refactoré en alias de auth_has_role('admin') (R09)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_has_role('admin'::role_type);
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Phase 3.3 : alias conservé pour compatibilité (vue admin_*, RPC). Délègue à auth_has_role.';

-- =========================================================================
-- 3) is_own_benevole(uuid) : test d'appartenance d'une ligne benevole_id
-- =========================================================================
-- Utilisé par les policies OWN_ROW_ONLY sur inscriptions, benevole_repas,
-- benevole_cagnotte_periodes (cf. matrice §1.2).
-- Note : un même auth.uid() peut posséder plusieurs benevoles (support famille),
-- d'où la sémantique "le benevole_id ciblé appartient à l'utilisateur courant".

CREATE OR REPLACE FUNCTION public.is_own_benevole(target_benevole_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM benevoles
    WHERE id = target_benevole_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_own_benevole(uuid) IS
  'Phase 3.3 : test d''appartenance d''une ligne par benevole_id (support famille = plusieurs benevoles par auth.uid()).';

-- =========================================================================
-- 4) is_referent_for_poste(uuid) : test du rôle référent sur un poste
-- =========================================================================
-- Utilisé par la policy inscriptions_referent_select_managed (arbitrage
-- mainteneur 2026-05-27 point 2 : un référent voit les inscriptions sur SES postes).

CREATE OR REPLACE FUNCTION public.is_referent_for_poste(target_poste_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM postes p
    JOIN benevoles ref ON p.referent_id = ref.id
    WHERE p.id = target_poste_id
      AND ref.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_referent_for_poste(uuid) IS
  'Phase 3.3 : test "auth.uid() est le référent de ce poste". Cf. matrice §2.2.';
