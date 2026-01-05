-- Fix function_search_path_mutable warnings from Supabase Linter
-- Setting a fixed search_path protects against search path injection attacks for SECURITY DEFINER functions.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

ALTER FUNCTION public.get_family_tshirt_info_smart(uuid) SET search_path = public;
ALTER FUNCTION public.get_family_tshirt_info(uuid) SET search_path = public;
ALTER FUNCTION public.get_public_tshirt_info(uuid) SET search_path = public;
ALTER FUNCTION public.update_tshirt_status(uuid, text, boolean) SET search_path = public;
