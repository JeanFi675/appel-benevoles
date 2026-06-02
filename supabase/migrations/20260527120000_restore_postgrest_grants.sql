-- ============================================================================
-- Migration : restore_postgrest_grants
-- Phase    : 3.4 (préalable aux tests RLS)
-- Date     : 2026-05-27
-- Auteur   : refactor/production-hardening
--
-- CONTEXTE
-- --------
-- `supabase/migrations/00000000000000_init.sql` (généré en Phase 2.8 via
-- `pg_dump --no-privileges`) ne contient AUCUN `GRANT`. Conséquence : les
-- rôles `anon` et `authenticated` (et `service_role`) n'ont aucune permission
-- table-level sur `public.*` → toute requête PostgREST échoue avec
-- `permission denied for table ...`, AVANT même que les policies RLS soient
-- évaluées.
--
-- Le dump prod d'origine (`backups/20260525_schema.sql`) contient les
-- 135 GRANT manquants. Cette migration les ré-applique en mode "loop"
-- idempotent, et ajoute les DEFAULT PRIVILEGES pour que les futurs objets
-- créés dans `public` héritent automatiquement des bonnes permissions.
--
-- SÉCURITÉ
-- --------
-- Accorder `ALL` à `anon`/`authenticated` n'est PAS une faille : c'est la
-- convention Supabase. La sécurité est entièrement portée par les policies
-- RLS (Phase 3.1-3.3). Sans ces GRANTs, RLS n'est même pas évalué — c'est
-- pire qu'une politique permissive.
--
-- IDEMPOTENCE
-- -----------
-- Tous les blocs sont rejouables sans erreur :
--   - `GRANT` est idempotent par nature (pas d'erreur si déjà accordé) ;
--   - les boucles DO itèrent sur l'état courant de `pg_class`/`pg_proc` ;
--   - `ALTER DEFAULT PRIVILEGES` est idempotent.
--
-- POST-CONDITION
-- --------------
-- À intégrer lors de la prochaine régénération d'init.sql (NE PAS utiliser
-- `--no-privileges`). Cf. `audit/notes.md` § 2026-05-27.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schéma : USAGE
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Tables et vues : ALL (RLS filtre)
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS qualified
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')  -- ordinary + partitioned tables
      AND c.relname NOT LIKE '\_%'  -- exclure tables techniques (_rls_test_results etc.)
  LOOP
    EXECUTE format('GRANT ALL ON TABLE %s TO anon, authenticated, service_role', r.qualified);
  END LOOP;

  FOR r IN
    SELECT c.oid::regclass::text AS qualified
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')  -- views + materialized views
  LOOP
    EXECUTE format('GRANT ALL ON TABLE %s TO anon, authenticated, service_role', r.qualified);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Sequences : USAGE, SELECT, UPDATE
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS qualified
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname NOT LIKE '\_%'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %s TO anon, authenticated, service_role', r.qualified);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Fonctions : EXECUTE
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'  -- regular functions (exclut procédures, agrégats, fenêtres)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. DEFAULT PRIVILEGES : pour les objets futurs créés dans public
-- ----------------------------------------------------------------------------
-- Note : `ALTER DEFAULT PRIVILEGES` s'applique aux objets créés *par le rôle
-- exécutant cette commande*. On l'exécute en tant que `postgres` (rôle
-- propriétaire du schéma public dans Supabase local) pour couvrir les futurs
-- objets créés via les migrations Supabase CLI.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
