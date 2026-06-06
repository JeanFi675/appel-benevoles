-- Migration: Phase 3.1 — Activation RLS universelle
-- Date: 2026-05-27
-- Objectif:
--   1. ENABLE ROW LEVEL SECURITY sur toutes les tables du schema `public`
--      (idempotent : audit 1.9 a constate 13/13 deja activees, mais on
--       formalise la garantie a l'echelle du schema).
--   2. FORCE ROW LEVEL SECURITY sur toutes les tables du schema `public`
--      pour appliquer les policies meme aux roles proprietaires (postgres),
--      empechant tout bypass implicite. Les fonctions SECURITY DEFINER
--      restent autorisees a contourner via leur propre privilege.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', r.schema_name, r.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;', r.schema_name, r.table_name);
  END LOOP;
END $$;
