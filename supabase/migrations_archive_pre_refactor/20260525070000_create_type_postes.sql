-- ============================================================================
-- MIGRATION: Création de la table de référence type_postes et normalisation de postes
-- ============================================================================

-- 1. Créer la table type_postes
CREATE TABLE IF NOT EXISTS public.type_postes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titre TEXT NOT NULL UNIQUE,
    description TEXT,
    ordre INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.type_postes IS 'Table de référence pour les types de postes (rôles) avec leur titre unique et ordre d''affichage';
COMMENT ON COLUMN public.type_postes.titre IS 'Titre unique du type de poste (ex: Juge, Accueil)';
COMMENT ON COLUMN public.type_postes.description IS 'Description par défaut du type de poste';
COMMENT ON COLUMN public.type_postes.ordre IS 'Ordre d''affichage général du type de poste';

-- 2. Activer RLS sur la table type_postes
ALTER TABLE public.type_postes ENABLE ROW LEVEL SECURITY;

-- 3. Créer les politiques RLS pour type_postes
CREATE POLICY "Lecture publique des types de postes" ON public.type_postes
    FOR SELECT USING (true);

CREATE POLICY "Modification des types de postes par les admins" ON public.type_postes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 4. Extraire et migrer les types de postes existants depuis la table postes
INSERT INTO public.type_postes (titre, description, ordre)
SELECT DISTINCT ON (TRIM(titre)) TRIM(titre), COALESCE(description, ''), COALESCE(ordre, 0)
FROM public.postes
ON CONFLICT (titre) DO NOTHING;

-- 5. Ajouter la colonne type_poste_id à la table postes
ALTER TABLE public.postes
ADD COLUMN IF NOT EXISTS type_poste_id UUID REFERENCES public.type_postes(id) ON DELETE SET NULL;

-- 6. Mettre à jour postes.type_poste_id en fonction du titre
UPDATE public.postes p
SET type_poste_id = tp.id
FROM public.type_postes tp
WHERE TRIM(p.titre) = tp.titre;

-- 7. Droper les anciennes vues dépendantes de postes.titre et postes.description pour pouvoir modifier la table
DROP VIEW IF EXISTS public.public_planning CASCADE;
DROP VIEW IF EXISTS public.admin_inscriptions CASCADE;

-- 8. Supprimer les colonnes obsolètes de la table postes
ALTER TABLE public.postes
DROP COLUMN IF EXISTS titre,
DROP COLUMN IF EXISTS description,
DROP COLUMN IF EXISTS ordre;

-- 9. Recréer la vue public_planning avec la jointure vers type_postes
CREATE OR REPLACE VIEW public.public_planning WITH (security_invoker = true) AS
SELECT
  p.id AS poste_id,
  tp.titre,
  p.periode_debut,
  p.periode_fin,
  p.nb_max,
  p.nb_min,
  per.nom AS periode,
  per.ordre AS periode_ordre,
  tp.description,
  p.referent_id,

  -- Referent details
  CASE
    WHEN p.referent_id IS NOT NULL THEN
      get_benevole_full_name(p.referent_id)
    ELSE NULL
  END AS referent_nom,
  
  CASE
    WHEN p.referent_id IS NOT NULL THEN
      get_benevole_email(p.referent_id)
    ELSE NULL
  END AS referent_email,

  CASE
    WHEN p.referent_id IS NOT NULL THEN
      get_benevole_phone(p.referent_id)
    ELSE NULL
  END AS referent_telephone,

  -- Comptage des inscrits
  COUNT(i.id) AS inscrits_actuels,

  -- Liste anonymisée des bénévoles
  ARRAY_AGG(
    get_benevole_name(i.benevole_id)
    ORDER BY i.created_at
  ) FILTER (WHERE i.benevole_id IS NOT NULL) AS liste_benevoles

FROM public.postes p
JOIN public.type_postes tp ON p.type_poste_id = tp.id
LEFT JOIN public.periodes per ON p.periode_id = per.id
LEFT JOIN public.inscriptions i ON p.id = i.poste_id
GROUP BY p.id, tp.titre, p.periode_debut, p.periode_fin, p.nb_max, p.nb_min, per.nom, per.ordre, tp.description, p.referent_id;

-- 10. Recréer la vue admin_inscriptions avec la jointure vers type_postes
CREATE OR REPLACE VIEW public.admin_inscriptions WITH (security_invoker = true) AS
SELECT
  i.id,
  i.created_at,
  b.prenom || ' ' || b.nom AS benevole_nom,
  b.email AS benevole_email,
  tp.titre AS poste_titre,
  per.nom AS poste_periode,
  p.periode_debut,
  p.periode_fin
FROM public.inscriptions i
JOIN public.benevoles b ON i.benevole_id = b.id
JOIN public.postes p ON i.poste_id = p.id
JOIN public.type_postes tp ON p.type_poste_id = tp.id
LEFT JOIN public.periodes per ON p.periode_id = per.id
ORDER BY p.periode_debut, b.nom;
