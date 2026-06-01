-- ============================================================================
-- MIGRATION: Architecture en cascade pure Jours -> Type_Postes -> Postes
-- ============================================================================

-- 1. Créer la nouvelle table temporaire type_postes_new
CREATE TABLE IF NOT EXISTS public.type_postes_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_ref DATE NOT NULL REFERENCES public.jours(date_ref) ON DELETE CASCADE,
    titre TEXT NOT NULL,
    description TEXT,
    ordre INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (date_ref, titre)
);

COMMENT ON TABLE public.type_postes_new IS 'Table hiérarchique pour les types de postes par jour';

-- 2. Migrer les données vers type_postes_new
-- A. Depuis type_postes_ordre
INSERT INTO public.type_postes_new (date_ref, titre, description, ordre)
SELECT DISTINCT tpo.date_ref, tp.titre, tp.description, tpo.ordre
FROM public.type_postes_ordre tpo
JOIN public.type_postes tp ON tpo.type_poste_id = tp.id
ON CONFLICT (date_ref, titre) DO NOTHING;

-- B. Depuis postes (au cas où certains créneaux n'avaient pas d'ordre enregistré)
INSERT INTO public.type_postes_new (date_ref, titre, description, ordre)
SELECT DISTINCT (p.periode_debut::date), tp.titre, tp.description, 0
FROM public.postes p
JOIN public.type_postes tp ON p.type_poste_id = tp.id
WHERE p.periode_debut IS NOT NULL
ON CONFLICT (date_ref, titre) DO NOTHING;

-- 3. Ajouter la colonne new_type_poste_id à la table postes
ALTER TABLE public.postes
ADD COLUMN IF NOT EXISTS new_type_poste_id UUID REFERENCES public.type_postes_new(id) ON DELETE CASCADE;

-- 4. Associer postes.new_type_poste_id aux nouveaux IDs de type_postes_new
UPDATE public.postes p
SET new_type_poste_id = tpn.id
FROM public.type_postes tpold, public.type_postes_new tpn
WHERE p.type_poste_id = tpold.id
  AND tpn.date_ref = (p.periode_debut::date)
  AND tpn.titre = tpold.titre;

-- 5. Supprimer les vues dépendantes pour pouvoir faire le ménage
DROP VIEW IF EXISTS public.public_planning CASCADE;
DROP VIEW IF EXISTS public.admin_inscriptions CASCADE;

-- 6. Supprimer les tables obsolètes
DROP TABLE IF EXISTS public.type_postes_ordre CASCADE;
DROP TABLE IF EXISTS public.type_postes CASCADE;

-- 7. Renommer la nouvelle table type_postes_new en type_postes
ALTER TABLE public.type_postes_new RENAME TO type_postes;

-- 8. Supprimer l'ancienne colonne type_poste_id de la table postes et renommer la nouvelle
ALTER TABLE public.postes DROP COLUMN IF EXISTS type_poste_id;
ALTER TABLE public.postes RENAME COLUMN new_type_poste_id TO type_poste_id;

-- 9. Rendre type_poste_id NON NULL
ALTER TABLE public.postes ALTER COLUMN type_poste_id SET NOT NULL;

-- 10. Activer RLS sur la nouvelle table type_postes
ALTER TABLE public.type_postes ENABLE ROW LEVEL SECURITY;

-- 11. Créer les politiques RLS pour la nouvelle table type_postes
CREATE POLICY "Lecture publique des types de postes" ON public.type_postes
    FOR SELECT USING (true);

CREATE POLICY "Modification des types de postes par les admins" ON public.type_postes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 12. Recréer la vue public_planning simplifiée avec tri direct
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
  tp.ordre AS type_poste_ordre, -- Tri direct et propre !

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
GROUP BY 
  p.id, 
  tp.titre, 
  p.periode_debut, 
  p.periode_fin, 
  p.nb_max, 
  p.nb_min, 
  per.nom, 
  per.ordre, 
  tp.description, 
  p.referent_id,
  tp.ordre;

-- 13. Recréer la vue admin_inscriptions simplifiée
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
