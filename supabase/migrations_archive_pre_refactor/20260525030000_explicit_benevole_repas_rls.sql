-- ============================================================================
-- MIGRATION: Explicit RLS Policies for benevole_repas (Solve 406 Error)
-- ============================================================================

-- 1. Nettoyage des anciennes politiques RLS globales (FOR ALL)
DROP POLICY IF EXISTS "Lecture de ses propres choix de repas et par les admins/referents" ON public.benevole_repas;
DROP POLICY IF EXISTS "Modification de ses propres choix de repas" ON public.benevole_repas;
DROP POLICY IF EXISTS "Lecture publique des choix de repas" ON public.benevole_repas;
DROP POLICY IF EXISTS "Insertion de ses propres choix de repas" ON public.benevole_repas;
DROP POLICY IF EXISTS "Suppression de ses propres choix de repas" ON public.benevole_repas;

-- 2. Lecture publique sécurisée (FOR SELECT)
CREATE POLICY "Lecture publique des choix de repas" ON public.benevole_repas
    FOR SELECT USING (true);

-- 3. Politique d'insertion explicite (FOR INSERT) avec WITH CHECK
CREATE POLICY "Insertion de ses propres choix de repas" ON public.benevole_repas
    FOR INSERT WITH CHECK (
        benevole_id IN (
            SELECT id FROM public.benevoles 
            WHERE user_id = (select auth.uid())
        )
        OR (select is_admin())
    );

-- 4. Politique de suppression explicite (FOR DELETE) avec USING
CREATE POLICY "Suppression de ses propres choix de repas" ON public.benevole_repas
    FOR DELETE USING (
        benevole_id IN (
            SELECT id FROM public.benevoles 
            WHERE user_id = (select auth.uid())
        )
        OR (select is_admin())
    );
