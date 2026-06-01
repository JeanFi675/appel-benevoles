-- ============================================================================
-- MIGRATION: Configuration dynamique du formulaire d'inscription (T-Shirt & Repas)
-- ============================================================================

-- 1. Insertion de la clé de configuration tshirt_question_active par défaut
INSERT INTO public.config (key, value)
VALUES ('tshirt_question_active', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Création de la table de configuration des repas
CREATE TABLE IF NOT EXISTS public.repas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Activation de RLS sur la table repas
ALTER TABLE public.repas ENABLE ROW LEVEL SECURITY;

-- Policies pour repas
DROP POLICY IF EXISTS "Lecture publique des repas" ON public.repas;
CREATE POLICY "Lecture publique des repas" ON public.repas
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modification des repas par les admins" ON public.repas;
CREATE POLICY "Modification des repas par les admins" ON public.repas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 4. Création de la table de liaison benevole_repas
CREATE TABLE IF NOT EXISTS public.benevole_repas (
    benevole_id UUID REFERENCES public.benevoles(id) ON DELETE CASCADE,
    repas_id UUID REFERENCES public.repas(id) ON DELETE CASCADE,
    vegetarien BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (benevole_id, repas_id)
);

-- 5. Activation de RLS sur la table benevole_repas
ALTER TABLE public.benevole_repas ENABLE ROW LEVEL SECURITY;

-- Policies pour benevole_repas
DROP POLICY IF EXISTS "Lecture de ses propres choix de repas et par les admins/referents" ON public.benevole_repas;
CREATE POLICY "Lecture de ses propres choix de repas et par les admins/referents" ON public.benevole_repas
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM public.benevoles WHERE id = benevole_id)
        OR EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role IN ('admin', 'referent', 'admin-juge')
        )
    );

DROP POLICY IF EXISTS "Modification de ses propres choix de repas" ON public.benevole_repas;
CREATE POLICY "Modification de ses propres choix de repas" ON public.benevole_repas
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM public.benevoles WHERE id = benevole_id)
        OR EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 6. Insertion des deux repas par défaut (avec des UUIDs fixes pour préserver les relations existantes)
INSERT INTO public.repas (id, nom) VALUES
('11111111-1111-1111-1111-111111111111', 'Vendredi soir'),
('22222222-2222-2222-2222-222222222222', 'Samedi soir')
ON CONFLICT (id) DO NOTHING;

-- 7. Migration des données existantes depuis les anciennes colonnes
INSERT INTO public.benevole_repas (benevole_id, repas_id, vegetarien)
SELECT id, '11111111-1111-1111-1111-111111111111'::uuid, COALESCE(vegetarien, false)
FROM public.benevoles
WHERE repas_vendredi = true
ON CONFLICT (benevole_id, repas_id) DO NOTHING;

INSERT INTO public.benevole_repas (benevole_id, repas_id, vegetarien)
SELECT id, '22222222-2222-2222-2222-222222222222'::uuid, COALESCE(vegetarien, false)
FROM public.benevoles
WHERE repas_samedi = true
ON CONFLICT (benevole_id, repas_id) DO NOTHING;

-- 8. Mise à jour de la vue admin_benevoles
DROP VIEW IF EXISTS public.admin_benevoles;

CREATE OR REPLACE VIEW public.admin_benevoles WITH (security_invoker = true) AS
SELECT
  b.id,
  b.user_id,
  b.email,
  b.prenom,
  b.nom,
  b.telephone,
  b.taille_tshirt,
  b.role,
  b.created_at,
  b.updated_at,
  b.relance_sent_at,
  b.benevole_or,
  COUNT(DISTINCT i.id) AS nb_inscriptions,
  COUNT(DISTINCT p.id) AS nb_postes_referent,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('repas_id', br.repas_id, 'nom', r.nom, 'vegetarien', br.vegetarien) ORDER BY r.created_at)
     FROM public.benevole_repas br
     JOIN public.repas r ON br.repas_id = r.id
     WHERE br.benevole_id = b.id),
    '[]'::jsonb
  ) AS repas
FROM public.benevoles b
LEFT JOIN public.inscriptions i ON b.id = i.benevole_id
LEFT JOIN public.postes p ON b.id = p.referent_id
GROUP BY b.id;

-- 9. Suppression des anciennes colonnes repas et végétarien de la table benevoles
ALTER TABLE public.benevoles
  DROP COLUMN IF EXISTS repas_vendredi,
  DROP COLUMN IF EXISTS repas_samedi,
  DROP COLUMN IF EXISTS vegetarien;
