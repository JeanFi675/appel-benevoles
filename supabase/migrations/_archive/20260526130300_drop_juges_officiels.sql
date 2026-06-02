-- Migration: suppression des rôles juge / admin-juge / officiel et de leur infra
-- Phase: 2.3 (Contraintes — prérequis enum role)
-- Anomalies: M07 (réduction enum à 3 valeurs) + H04 (is_admin_juge devient caduque)
-- Décision mainteneur: D1 (2026-05-26)
--
-- État audit/notes.md (2026-05-26) : 0 user 'juge', 0 user 'officiel', 1 user 'admin-juge'.
-- Reclassement : 'admin-juge' → 'admin'.

-- 1. Reclasser le user 'admin-juge' en 'admin' (et filet de sécurité pour 'juge'/'officiel' si réapparus).
UPDATE public.benevoles SET role = 'admin'    WHERE role = 'admin-juge';
UPDATE public.benevoles SET role = 'benevole' WHERE role IN ('juge', 'officiel');

-- 2. Drop des policies spécifiques admin-juge (noms exacts vérifiés sur le dump 2026-05-25).
DROP POLICY IF EXISTS "Admin-juges can view all benevoles"          ON public.benevoles;
DROP POLICY IF EXISTS "Admin-juges can update juges"                ON public.benevoles;
DROP POLICY IF EXISTS "Admin-juges can update tarif_degaines_juge"  ON public.config;

-- 3. Drop de la fonction is_admin_juge() (sans CASCADE — toutes les policies l'utilisant sont DROP au-dessus).
DROP FUNCTION IF EXISTS public.is_admin_juge();

-- 4. Mise à jour de get_family_tshirt_info_smart pour retirer juge/admin-juge/officiel du test de rôle.
CREATE OR REPLACE FUNCTION public.get_family_tshirt_info_smart(scan_id uuid)
 RETURNS TABLE(benevole_id uuid, prenom text, nom text, taille_tshirt text, t_shirt_recupere boolean, has_registrations boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    found_user_id UUID;
BEGIN
    SELECT user_id INTO found_user_id FROM benevoles WHERE id = scan_id;
    IF found_user_id IS NULL THEN
        PERFORM 1 FROM benevoles WHERE user_id = scan_id LIMIT 1;
        IF FOUND THEN
            found_user_id := scan_id;
        END IF;
    END IF;
    IF found_user_id IS NULL THEN
        RETURN;
    END IF;
    RETURN QUERY
    SELECT
        b.id,
        b.prenom,
        b.nom,
        b.taille_tshirt,
        b.t_shirt_recupere,
        ((SELECT COUNT(*) FROM inscriptions i WHERE i.benevole_id = b.id) > 0 OR b.role = 'admin')
    FROM benevoles b
    WHERE b.user_id = found_user_id;
END;
$function$;

-- 5. Mise à jour du CHECK constraint role → 3 valeurs uniquement (sera remplacé par ENUM en Phase 2.4).
ALTER TABLE public.benevoles DROP CONSTRAINT IF EXISTS benevoles_role_check;
ALTER TABLE public.benevoles ADD  CONSTRAINT benevoles_role_check
    CHECK (role IN ('benevole', 'referent', 'admin'));

-- 6. Drop des feature flags spécifiques juges.
DELETE FROM public.config WHERE key IN ('tarif_degaines_juge', 'tarif_degaines_officiel');
