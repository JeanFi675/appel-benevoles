-- Migration: activation citext + conversion benevoles.email -> citext
-- Phase: 2.4 (Typages)
-- Anomalie: M08
--
-- Effet : connexions deviennent case-insensitive (User@x === user@x).
-- Pre-requis verifies en amont : aucune collision case-only (les 18 emails
-- partages le sont en case exacte = patron famille M01, OK).
--
-- La vue admin_benevoles depend de email -> drop + recreate en fin de migration.

CREATE EXTENSION IF NOT EXISTS citext;

-- Garde-fou idempotent : refus si collision case-only existe.
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT lower(email) AS e
    FROM public.benevoles
    GROUP BY lower(email)
    HAVING COUNT(DISTINCT email) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'citext conversion blocked: % case-only email duplicates found', dup_count;
  END IF;
END$$;

DROP VIEW IF EXISTS public.admin_benevoles;

ALTER TABLE public.benevoles
  ALTER COLUMN email TYPE citext USING email::citext;

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
