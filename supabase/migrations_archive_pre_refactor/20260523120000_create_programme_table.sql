-- Migration: Create programme table and populate with existing program events
CREATE TABLE IF NOT EXISTS public.programme (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_ref DATE NOT NULL,
    heure TIME NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.programme ENABLE ROW LEVEL SECURITY;

-- Read policy: public
DROP POLICY IF EXISTS "Lecture publique du programme" ON public.programme;
CREATE POLICY "Lecture publique du programme" ON public.programme
    FOR SELECT USING (true);

-- Admin policies: insert, update, delete
DROP POLICY IF EXISTS "Admins can insert programme events" ON public.programme;
CREATE POLICY "Admins can insert programme events" ON public.programme
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update programme events" ON public.programme;
CREATE POLICY "Admins can update programme events" ON public.programme
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE id = auth.uid() AND role = 'admin'
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can delete programme events" ON public.programme;
CREATE POLICY "Admins can delete programme events" ON public.programme
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Pre-populate existing program events from programme.md
INSERT INTO public.programme (date_ref, heure, description) VALUES
('2026-05-16', '07:00:00', 'Ouverture salle d''échauffement et pointage U15F, U15H, U17H'),
('2026-05-16', '08:00:00', 'Fin de pointage U15F, U15H, U17H'),
('2026-05-16', '09:00:00', 'Qualifications U15F, U15H, U17H'),
('2026-05-16', '12:30:00', 'Ouverture salle d''échauffement et pointage U17F, U19F, U19H'),
('2026-05-16', '13:30:00', 'Fin de Qualifications U15F, U15H, U17H & Fin de pointage U17F, U19F, U19H'),
('2026-05-16', '14:30:00', 'Qualifications U17F, U19F, U19H'),
('2026-05-16', '19:00:00', 'Fin de Qualifications U17F, U19F, U19H'),
('2026-05-17', '08:30:00', 'Ouverture de la salle d''isolement U15'),
('2026-05-17', '09:30:00', 'Fermeture de la salle d''isolement U15 – ouverture de la salle au public'),
('2026-05-17', '10:00:00', 'Ouverture de la salle d''isolement U17 & U19'),
('2026-05-17', '10:30:00', 'Présentation des finalistes et observation U15 et Fermeture de la salle d''isolement U17'),
('2026-05-17', '10:45:00', 'Finales U15'),
('2026-05-17', '11:30:00', 'Fermeture de la salle d''isolement U19'),
('2026-05-17', '11:45:00', 'Fin Finales U15'),
('2026-05-17', '12:00:00', 'Présentation des finalistes et observation U17'),
('2026-05-17', '12:15:00', 'Finales U17'),
('2026-05-17', '13:15:00', 'Fin Finales U17'),
('2026-05-17', '14:15:00', 'Présentation des finalistes et observation U19'),
('2026-05-17', '14:30:00', 'Finales U19'),
('2026-05-17', '15:30:00', 'Fin Finales U19 et Suivi par les podiums du Championnat de France 2026')
ON CONFLICT DO NOTHING;
