-- Migration: suppression de la fonctionnalité de relance par email
--
-- Purpose:
--   La fonctionnalité d'envoi de mail de relance (depuis admin-connexions.html)
--   est retirée au profit d'un simple "copier le mail" côté frontend. On supprime
--   donc la colonne de suivi `relance_sent_at` devenue inutile :
--     - public.benevoles.relance_sent_at
--     - public.orphan_relances.relance_sent_at
--
--   La table `orphan_relances` est conservée : elle stocke encore le téléphone
--   des comptes orphelins (via la RPC save_orphelin_phone). Seule la colonne de
--   relance disparaît.
--
--   La vue admin_benevoles et la RPC get_auth_users_without_benevole projettent
--   relance_sent_at : elles sont recréées sans cette colonne.
--
-- Idempotent : DROP ... IF EXISTS + CREATE OR REPLACE.

BEGIN;

-- 1) Recréer admin_benevoles SANS relance_sent_at.
--    CREATE OR REPLACE VIEW ne peut pas retirer une colonne -> DROP + CREATE.
--    La vue dépend de benevoles.relance_sent_at : il faut la supprimer avant le
--    DROP COLUMN.
DROP VIEW IF EXISTS public.admin_benevoles;

-- 2) Supprimer les colonnes de relance.
ALTER TABLE public.benevoles DROP COLUMN IF EXISTS relance_sent_at;
ALTER TABLE public.orphan_relances DROP COLUMN IF EXISTS relance_sent_at;

-- 3) Recréer la vue admin_benevoles (définition identique, sans relance_sent_at).
CREATE VIEW public.admin_benevoles AS
 SELECT b.id,
    b.user_id,
    b.email,
    b.prenom,
    b.nom,
    b.telephone,
    b.taille_tshirt,
    b.role,
    b.created_at,
    b.updated_at,
    b.is_cagnotte_forcee,
    b.cagnotte_forcee_type,
    b.cagnotte_forcee_jours,
    COALESCE(( SELECT jsonb_agg(bcp.periode_id) AS jsonb_agg
           FROM public.benevole_cagnotte_periodes bcp
          WHERE (bcp.benevole_id = b.id)), '[]'::jsonb) AS cagnotte_forcee_periodes_ids,
    count(DISTINCT i.id) AS nb_inscriptions,
    count(DISTINCT p.id) AS nb_postes_referent,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('repas_id', br.repas_id, 'nom', r.nom, 'is_vegetarien', br.is_vegetarien) ORDER BY r.created_at) AS jsonb_agg
           FROM (public.benevole_repas br
             JOIN public.repas r ON ((br.repas_id = r.id)))
          WHERE (br.benevole_id = b.id)), '[]'::jsonb) AS repas
   FROM ((public.benevoles b
     LEFT JOIN public.inscriptions i ON ((b.id = i.benevole_id)))
     LEFT JOIN public.postes p ON ((b.id = p.referent_id)))
  GROUP BY b.id;

-- 4) Restaurer les GRANTs PostgREST sur la vue recréée (cf. migration
--    20260527120000_restore_postgrest_grants.sql).
GRANT ALL ON TABLE public.admin_benevoles TO anon, authenticated, service_role;

-- 5) Recréer la RPC sans relance_sent_at (le type de retour change -> DROP + CREATE).
DROP FUNCTION IF EXISTS public.get_auth_users_without_benevole();
CREATE FUNCTION public.get_auth_users_without_benevole() RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, telephone text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    r.telephone
  FROM auth.users u
  LEFT JOIN benevoles b ON b.user_id = u.id
  LEFT JOIN orphan_relances r ON r.user_id = u.id
  WHERE b.id IS NULL
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_users_without_benevole() TO anon, authenticated, service_role;

COMMIT;
