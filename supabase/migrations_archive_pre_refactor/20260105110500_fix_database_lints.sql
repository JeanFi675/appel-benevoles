-- Fix function_search_path_mutable warnings from Supabase Linter
-- Setting a fixed search_path protects against search path injection attacks for SECURITY DEFINER functions.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

ALTER FUNCTION public.get_family_tshirt_info_smart(uuid) SET search_path = public;
ALTER FUNCTION public.get_family_tshirt_info(uuid) SET search_path = public;
ALTER FUNCTION public.get_public_tshirt_info(uuid) SET search_path = public;
ALTER FUNCTION public.update_tshirt_status(uuid, text, boolean) SET search_path = public;


-- Fix auth_rls_initplan and multiple_permissive_policies warnings
-- Optimizes RLS policies by wrapping auth calls in (select ...) and removing redundant policies.
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

-- Table: public.benevoles
DROP POLICY IF EXISTS "Admins can view all benevoles" ON "public"."benevoles";
DROP POLICY IF EXISTS "Création de ses bénévoles" ON "public"."benevoles";
DROP POLICY IF EXISTS "Lecture de ses bénévoles" ON "public"."benevoles";
DROP POLICY IF EXISTS "Mise à jour de ses bénévoles" ON "public"."benevoles";

ALTER POLICY "Users can delete own profiles" ON "public"."benevoles" USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can insert own profiles" ON "public"."benevoles" WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can update own profiles" ON "public"."benevoles" USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can view own profiles" ON "public"."benevoles" USING ((select auth.uid()) = user_id);

-- Table: public.inscriptions
DROP POLICY IF EXISTS "Admins can view all inscriptions" ON "public"."inscriptions";
DROP POLICY IF EXISTS "Users can view managed inscriptions" ON "public"."inscriptions";
DROP POLICY IF EXISTS "Inscription pour soi-même" ON "public"."inscriptions";
DROP POLICY IF EXISTS "Suppression de ses inscriptions" ON "public"."inscriptions";

ALTER POLICY "Users can insert managed inscriptions" ON "public"."inscriptions" WITH CHECK (benevole_id IN ( SELECT benevoles.id FROM benevoles WHERE (benevoles.user_id = (select auth.uid())) ));
ALTER POLICY "Users can delete managed inscriptions" ON "public"."inscriptions" USING (benevole_id IN ( SELECT benevoles.id FROM benevoles WHERE (benevoles.user_id = (select auth.uid())) ));

-- Table: public.postes
DROP POLICY IF EXISTS "Admins can manage postes" ON "public"."postes";
DROP POLICY IF EXISTS "Lecture publique des postes" ON "public"."postes";

-- Table: public.periodes
DROP POLICY IF EXISTS "Admins can manage periodes" ON "public"."periodes";
DROP POLICY IF EXISTS "Lecture publique des periodes" ON "public"."periodes";

-- Table: public.cagnotte_transactions
ALTER POLICY "Lecture de ses transactions" ON "public"."cagnotte_transactions" USING (((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1 FROM benevoles WHERE ((benevoles.user_id = (select auth.uid())) AND (benevoles.role = 'admin'::text)))));
ALTER POLICY "Admins can insert transactions" ON "public"."cagnotte_transactions" WITH CHECK ((EXISTS ( SELECT 1 FROM benevoles WHERE ((benevoles.user_id = (select auth.uid())) AND (benevoles.role = 'admin'::text)))));

-- Table: public.config
ALTER POLICY "Enable update for authenticated users only" ON "public"."config" USING ((select auth.role()) = 'authenticated'::text) WITH CHECK ((select auth.role()) = 'authenticated'::text);
