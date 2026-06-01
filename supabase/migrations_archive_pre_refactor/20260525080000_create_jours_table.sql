-- ============================================================================
-- MIGRATION: Création de la table jours et de la table type_postes_ordre
-- ============================================================================

-- 1. Créer la table jours
CREATE TABLE IF NOT EXISTS public.jours (
    date_ref DATE PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.jours IS 'Table de référence pour les jours de compétition créés';
COMMENT ON COLUMN public.jours.date_ref IS 'Date unique identifiant le jour (ex: 2026-05-16)';

-- 2. Créer la table type_postes_ordre
CREATE TABLE IF NOT EXISTS public.type_postes_ordre (
    date_ref DATE REFERENCES public.jours(date_ref) ON DELETE CASCADE,
    type_poste_id UUID REFERENCES public.type_postes(id) ON DELETE CASCADE,
    ordre INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (date_ref, type_poste_id)
);

COMMENT ON TABLE public.type_postes_ordre IS 'Ordre d''affichage spécifique pour chaque type de poste par jour';
COMMENT ON COLUMN public.type_postes_ordre.date_ref IS 'Référence au jour de compétition';
COMMENT ON COLUMN public.type_postes_ordre.type_poste_id IS 'Référence au type de poste';
COMMENT ON COLUMN public.type_postes_ordre.ordre IS 'Position (index) d''affichage du type de poste pour ce jour-là';

-- 3. Activer RLS sur les nouvelles tables
ALTER TABLE public.jours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.type_postes_ordre ENABLE ROW LEVEL SECURITY;

-- 4. Créer les politiques RLS pour jours
DROP POLICY IF EXISTS "Lecture publique des jours" ON public.jours;
CREATE POLICY "Lecture publique des jours" ON public.jours
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modification des jours par les admins" ON public.jours;
CREATE POLICY "Modification des jours par les admins" ON public.jours
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 5. Créer les politiques RLS pour type_postes_ordre
DROP POLICY IF EXISTS "Lecture publique de type_postes_ordre" ON public.type_postes_ordre;
CREATE POLICY "Lecture publique de type_postes_ordre" ON public.type_postes_ordre
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modification de type_postes_ordre par les admins" ON public.type_postes_ordre;
CREATE POLICY "Modification de type_postes_ordre par les admins" ON public.type_postes_ordre
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 6. Initialiser/Migrer les jours existants depuis postes et programme
INSERT INTO public.jours (date_ref)
SELECT DISTINCT (periode_debut::date) FROM public.postes WHERE periode_debut IS NOT NULL
UNION
SELECT DISTINCT (date_ref::date) FROM public.programme WHERE date_ref IS NOT NULL
ON CONFLICT (date_ref) DO NOTHING;

-- 7. Migrer l'ordre actuel des types de postes vers type_postes_ordre pour tous les jours existants
INSERT INTO public.type_postes_ordre (date_ref, type_poste_id, ordre)
SELECT DISTINCT j.date_ref, tp.id, tp.ordre
FROM public.jours j
CROSS JOIN public.type_postes tp
ON CONFLICT DO NOTHING;
