-- Migration: durcissement des fonctions SECURITY DEFINER (lints 0011/0028/0029)
--
-- Purpose:
--   Réduction de la surface d'attaque des fonctions definer exposées via PostgREST,
--   suite à l'audit des warnings du database linter Supabase.

-- ----------------------------------------------------------------------------
-- 1. function_search_path_mutable (lint 0011)
--    Seules ces deux fonctions n'avaient pas de search_path figé (anti-hijack).
ALTER FUNCTION public.get_user_balance(uuid)  SET search_path = public;
ALTER FUNCTION public.prevent_role_change()   SET search_path = public;

-- ----------------------------------------------------------------------------
-- 2. Helpers de présentation PII — retrait de l'accès RPC anon (lint 0028)
--    get_benevole_email/phone/full_name/name résolvent des données personnelles
--    (email, téléphone, nom complet, prénom+initiale) à partir d'un UUID arbitraire.
--    Le GRANT EXECUTE par défaut à PUBLIC les rendait appelables directement via
--    /rest/v1/rpc/get_benevole_email?b_id=<uuid> par anon → énumération de PII.
--
--    ⚠️ Subtilité PostgreSQL (vérifiée) : une VUE definer (public_planning, non
--    security_invoker) vérifie le droit EXECUTE des fonctions internes contre
--    l'APPELANT, pas contre le propriétaire. `authenticated` DOIT donc conserver
--    EXECUTE sinon la vue casse (« permission denied for function … »).
--    À l'inverse, une FONCTION definer (get_public_inscriptions) exécute ses appels
--    internes en tant que propriétaire → anon n'a pas besoin du grant direct.
--    Conclusion : on retire à PUBLIC/anon, on conserve explicitement authenticated.
--    (Le lint 0029 « authenticated peut exécuter » subsiste pour ces 4 fonctions :
--    c'est imposé par l'architecture en vue ; faux positif assumé.)
REVOKE EXECUTE ON FUNCTION public.get_benevole_email(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_benevole_phone(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_benevole_full_name(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_benevole_name(uuid)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_benevole_email(uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_benevole_phone(uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_benevole_full_name(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_benevole_name(uuid)      TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_auth_users_without_benevole — garde admin + retrait anon (lints 0028/0029)
--    Cette fonction expose les emails/téléphones des comptes auth.users SANS profil
--    bénévole (diagnostic admin de la page admin-connexions). Elle n'avait AUCUNE
--    garde interne et était exécutable par anon → fuite des coordonnées orphelines.
--    On ajoute un filtre `public.is_admin()` (renvoie 0 ligne hors admin) et on retire
--    l'EXECUTE à anon. L'admin l'appelle en tant qu'authenticated → inchangé pour lui.
CREATE OR REPLACE FUNCTION public.get_auth_users_without_benevole()
RETURNS TABLE(id uuid, email text, created_at timestamptz, telephone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT u.id, u.email::text, u.created_at, r.telephone
  FROM auth.users u
  LEFT JOIN public.benevoles b ON b.user_id = u.id
  LEFT JOIN public.orphan_relances r ON r.user_id = u.id
  WHERE b.id IS NULL AND public.is_admin()
  ORDER BY u.created_at DESC;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_auth_users_without_benevole() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_auth_users_without_benevole() TO authenticated;

-- ----------------------------------------------------------------------------
-- NOTE — warnings 0028/0029 volontairement NON traités (faux positifs / par design) :
--   * Helpers RLS (is_admin, auth_has_role, is_own_benevole, is_referent_for_poste,
--     is_referent_for_benevole) : référencés dans les policies, doivent rester
--     EXECUTE-ables par le rôle appelant. Le correctif « propre » serait de les
--     déplacer dans un schéma non exposé par PostgREST — refacto à part (réécriture
--     des ~37 policies). À ne pas faire à la légère.
--   * RPC QR publiques (debit_cagnotte_public, get_public_benevole_info,
--     get_public_inscriptions) : anon volontaire (scan commerçant / planning public).
--   * save_orphelin_phone : possède déjà une garde is_admin interne.
--
-- Le durcissement du scanner T-shirt (update_tshirt_status / get_family_tshirt_info_smart,
-- page non authentifiée) fait l'objet d'une décision produit séparée.
