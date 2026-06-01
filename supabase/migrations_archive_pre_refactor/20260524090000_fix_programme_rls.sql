-- Migration: Fix programme table RLS policies to use is_admin()

-- 1. Supprimer les anciennes politiques RLS incorrectes
DROP POLICY IF EXISTS "Admins can insert programme events" ON public.programme;
DROP POLICY IF EXISTS "Admins can update programme events" ON public.programme;
DROP POLICY IF EXISTS "Admins can delete programme events" ON public.programme;

-- 2. Créer des politiques robustes et sécurisées utilisant la fonction is_admin()
CREATE POLICY "Admins can insert programme events" ON public.programme
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update programme events" ON public.programme
    FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins can delete programme events" ON public.programme
    FOR DELETE USING (is_admin());
