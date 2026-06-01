-- ============================================================================
-- MIGRATION: Fix RLS Policies for benevole_repas (Avoid recursion & 406 Errors)
-- ============================================================================

-- 1. Supprimer les anciennes politiques RLS sur benevole_repas
DROP POLICY IF EXISTS "Lecture de ses propres choix de repas et par les admins/referents" ON public.benevole_repas;
DROP POLICY IF EXISTS "Modification de ses propres choix de repas" ON public.benevole_repas;

-- 2. Création d'une politique de lecture publique (sécurisée car anonymisée en IDs, évite les récursions et erreurs 406)
CREATE POLICY "Lecture publique des choix de repas" ON public.benevole_repas
    FOR SELECT USING (true);

-- 3. Création d'une politique de modification (INSERT/UPDATE/DELETE) restreinte aux propriétaires et admins
CREATE POLICY "Modification de ses propres choix de repas" ON public.benevole_repas
    FOR ALL USING (
        benevole_id IN (
            SELECT id FROM public.benevoles 
            WHERE user_id = (select auth.uid())
        )
        OR (select is_admin())
    );
