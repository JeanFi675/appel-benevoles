-- Migration: optimisation perf RLS — auth.uid() en initplan (lint 0003 auth_rls_initplan)
--
-- Purpose:
--   Deux policies comparent `auth.uid() = user_id` EN DIRECT dans leur expression.
--   PostgreSQL ré-évalue alors auth.uid() pour CHAQUE ligne scannée (perf sous-optimale
--   à grande échelle). En enveloppant l'appel dans `(select auth.uid())`, le planner le
--   traite comme un InitPlan évalué UNE seule fois par requête. Sémantique inchangée.
--
--   Les autres policies ne sont pas concernées : elles passent par les helpers STABLE
--   SECURITY DEFINER (is_own_benevole, auth_has_role) qui encapsulent auth.uid().
--
--   On utilise ALTER POLICY (et non DROP/CREATE) : modification atomique de l'expression,
--   aucune fenêtre où la table serait sans policy.
--
-- NOTE — les 18 warnings `multiple_permissive_policies` (duo *_admin_all + *_self_*/
--   *_public_select par table/rôle/action) sont volontairement NON traités : c'est le
--   pattern structurant de l'architecture RLS (lisible, auditable, anti-récursion via
--   helpers DEFINER). Les fusionner en policies OR uniques dégraderait l'auditabilité
--   d'un code critique pour un gain négligeable à l'échelle d'un évènement. Faux positif
--   assumé (cf. CLAUDE.md « ne pas modifier les policies RLS sans nécessité »).

ALTER POLICY benevoles_self_all
  ON public.benevoles
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY cagnotte_transactions_self_select
  ON public.cagnotte_transactions
  USING ((select auth.uid()) = user_id);
