-- ============================================================================
-- MIGRATION: Ajout de type_poste_ordre dans la vue public_planning
-- ============================================================================

-- Droper la vue existante pour pouvoir la recréer avec la nouvelle colonne
DROP VIEW IF EXISTS public.public_planning CASCADE;

-- Recréer la vue public_planning avec la colonne type_poste_ordre
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

  -- Ordre d'affichage spécifique pour chaque type de poste par jour
  COALESCE(
    (
      SELECT tpo.ordre 
      FROM public.type_postes_ordre tpo 
      WHERE tpo.date_ref = (p.periode_debut::date) AND tpo.type_poste_id = p.type_poste_id
    ),
    tp.ordre,
    999999
  ) AS type_poste_ordre,

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
  tp.ordre,
  p.type_poste_id;
