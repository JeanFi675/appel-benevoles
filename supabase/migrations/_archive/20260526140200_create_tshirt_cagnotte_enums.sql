-- Migration: text -> enums tshirt_size + cagnotte_forced_type
-- Phase: 2.4 (Typages)
-- Anomalie: M07
--
-- tshirt_size  : 7 valeurs (SANS, XS, S, M, L, XL, XXL) -- cf. CHECK existant.
-- cagnotte_forced_type : 2 valeurs (journee, periode) -- cf. CHECK existant.
--
-- Dependances :
--   - vue admin_benevoles (projette les 2 colonnes)
--   - CHECK benevoles_cagnotte_journee_has_days (compare cagnotte_forcee_type
--     a 'journee'::text -> doit etre recree apres conversion).

CREATE TYPE public.tshirt_size AS ENUM ('SANS', 'XS', 'S', 'M', 'L', 'XL', 'XXL');
CREATE TYPE public.cagnotte_forced_type AS ENUM ('journee', 'periode');

DROP VIEW IF EXISTS public.admin_benevoles;

-- Drop CHECK qui referencent les colonnes a convertir
ALTER TABLE public.benevoles DROP CONSTRAINT IF EXISTS benevoles_taille_tshirt_check;
ALTER TABLE public.benevoles DROP CONSTRAINT IF EXISTS benevoles_cagnotte_forcee_type_check;
ALTER TABLE public.benevoles DROP CONSTRAINT IF EXISTS benevoles_cagnotte_journee_has_days;

-- Conversion tshirt_size
ALTER TABLE public.benevoles
  ALTER COLUMN taille_tshirt TYPE public.tshirt_size
  USING taille_tshirt::public.tshirt_size;

-- Conversion cagnotte_forced_type
ALTER TABLE public.benevoles
  ALTER COLUMN cagnotte_forcee_type TYPE public.cagnotte_forced_type
  USING cagnotte_forcee_type::public.cagnotte_forced_type;

-- Recreate CHECK benevoles_cagnotte_journee_has_days avec cast enum
ALTER TABLE public.benevoles
  ADD CONSTRAINT benevoles_cagnotte_journee_has_days
  CHECK (
    cagnotte_forcee_type IS DISTINCT FROM 'journee'::public.cagnotte_forced_type
    OR cardinality(cagnotte_forcee_jours) > 0
  );

-- Recreate view
CREATE VIEW public.admin_benevoles AS
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
  b.cagnotte_forcee,
  b.cagnotte_forcee_type,
  b.cagnotte_forcee_jours,
  COALESCE(
    (SELECT jsonb_agg(bcp.periode_id)
       FROM public.benevole_cagnotte_periodes bcp
       WHERE bcp.benevole_id = b.id),
    '[]'::jsonb
  ) AS cagnotte_forcee_periodes_ids,
  COUNT(DISTINCT i.id) AS nb_inscriptions,
  COUNT(DISTINCT p.id) AS nb_postes_referent,
  COALESCE(
    (SELECT jsonb_agg(
              jsonb_build_object(
                'repas_id', br.repas_id,
                'nom', r.nom,
                'vegetarien', br.vegetarien
              )
              ORDER BY r.created_at
            )
       FROM public.benevole_repas br
       JOIN public.repas r ON br.repas_id = r.id
       WHERE br.benevole_id = b.id),
    '[]'::jsonb
  ) AS repas
FROM public.benevoles b
LEFT JOIN public.inscriptions i ON b.id = i.benevole_id
LEFT JOIN public.postes p ON b.id = p.referent_id
GROUP BY b.id;
