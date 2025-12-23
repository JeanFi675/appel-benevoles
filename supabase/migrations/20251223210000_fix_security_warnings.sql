-- ============================================================================
-- MIGRATION: Fix Security Warnings (Search Path & Security Invoker)
-- ============================================================================

-- 1. Fix "Function Search Path Mutable"
-- Security Definer functions should have a fixed search_path to prevent hijacking
ALTER FUNCTION get_user_balance(UUID) SET search_path = public;
ALTER FUNCTION get_public_benevole_info(UUID) SET search_path = public;
ALTER FUNCTION public_debit_cagnotte(UUID, DECIMAL, TEXT) SET search_path = public;

-- 2. Fix "Security Definer View"
-- Views should normally be security_invoker = true to enforce RLS of the actual user
-- (Unless explicitly designed to bypass RLS, which these admin views might have been, 
-- but 'security_definer' on a view is deprecated/discouraged in favor of distinct policies)
ALTER VIEW admin_benevoles SET (security_invoker = true);
ALTER VIEW admin_inscriptions SET (security_invoker = true);
ALTER VIEW admin_periodes SET (security_invoker = true);
