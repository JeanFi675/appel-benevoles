-- Migration: harmonisation des conventions de nommage
-- Phase: 2.6 (Nommage)
-- Anomalie: B02 (audit_db.md) + détail dans audit/15_naming.md
-- Décision mainteneur 2026-05-26 : OPTION A pour les booléens (préfixes is_*/has_*).
--
-- Renommages réalisés :
--   - Table         : programme → programmes (+ index/contraintes associés)
--   - Colonnes      : benevole_repas.vegetarien → is_vegetarien
--                     benevoles.t_shirt_recupere → has_recupere_tshirt
--                     benevoles.cagnotte_forcee → is_cagnotte_forcee
--                     orphan_relances.auth_user_id → user_id
--                     public_planning.inscrits_actuels → nb_inscrits_actuels (via DROP/CREATE VIEW)
--   - Triggers      : check_role_change → trg_prevent_role_change
--                     trigger_check_capacity → trg_check_capacity
--                     trigger_check_time_conflict → trg_check_time_conflict
--   - Fonction      : public_debit_cagnotte → debit_cagnotte_public
--   - Contraintes/index : alignés sur les nouveaux noms (FK, PK, UNIQUE, index secondaires)
--
-- Note conservatoire : type_postes NON renommé (refactor coûteux, gain nul — audit 15 §1.2).
-- Note conservatoire : colonnes presence_samedi/dimanche déjà droppées en 20260526120200.
-- Note frontend     : les requêtes Supabase consommant ces noms doivent être migrées
--                     en Phase 5 (toast/`x-data`, services api.js, Edge Functions, RPC).

-- ===========================================================================
-- 1. Vues dépendantes : drop avant ALTER COLUMN (recréées en fin de migration)
-- ===========================================================================

DROP VIEW IF EXISTS public.admin_benevoles;
DROP VIEW IF EXISTS public.public_planning;

-- ===========================================================================
-- 2. Renommage de table : programme → programmes
-- ===========================================================================

ALTER TABLE public.programme RENAME TO programmes;
ALTER INDEX public.programme_pkey RENAME TO programmes_pkey;
ALTER INDEX public.idx_programme_date_ref RENAME TO idx_programmes_date_ref;
ALTER TABLE public.programmes
  RENAME CONSTRAINT programme_date_heure_uniq TO programmes_date_heure_uniq;

-- ===========================================================================
-- 3. Renommages de colonnes
-- ===========================================================================

-- 3.1 benevole_repas.vegetarien → is_vegetarien
ALTER TABLE public.benevole_repas RENAME COLUMN vegetarien TO is_vegetarien;

-- 3.2 benevoles.t_shirt_recupere → has_recupere_tshirt
ALTER TABLE public.benevoles RENAME COLUMN t_shirt_recupere TO has_recupere_tshirt;

-- 3.3 benevoles.cagnotte_forcee → is_cagnotte_forcee
--     Les CHECK constraints (benevoles_cagnotte_consistency, _journee_has_days)
--     sont stockées avec des references attnum-based : le rename est transparent.
ALTER TABLE public.benevoles RENAME COLUMN cagnotte_forcee TO is_cagnotte_forcee;

-- 3.4 orphan_relances.auth_user_id → user_id
ALTER TABLE public.orphan_relances RENAME COLUMN auth_user_id TO user_id;
ALTER TABLE public.orphan_relances
  RENAME CONSTRAINT orphan_relances_auth_user_id_fkey TO orphan_relances_user_id_fkey;

-- ===========================================================================
-- 4. Renommage des triggers (préfixe trg_*)
-- ===========================================================================

ALTER TRIGGER check_role_change ON public.benevoles RENAME TO trg_prevent_role_change;
ALTER TRIGGER trigger_check_capacity ON public.inscriptions RENAME TO trg_check_capacity;
ALTER TRIGGER trigger_check_time_conflict ON public.inscriptions RENAME TO trg_check_time_conflict;

-- ===========================================================================
-- 5. Renommage de fonction : public_debit_cagnotte → debit_cagnotte_public
-- ===========================================================================

ALTER FUNCTION public.public_debit_cagnotte(uuid, numeric, text)
  RENAME TO debit_cagnotte_public;

-- ===========================================================================
-- 6. Mise à jour des fonctions qui référencent les colonnes renommées
-- ===========================================================================

-- 6.1 get_user_balance : utilise benevoles.cagnotte_forcee → is_cagnotte_forcee
CREATE OR REPLACE FUNCTION public.get_user_balance(target_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    total_credits    DECIMAL(10,2) := 0;
    forced_credits   DECIMAL(10,2) := 0;
    total_debits     DECIMAL(10,2) := 0;
    tarif_journee    DECIMAL(10,2) := 0;
    rec              RECORD;
BEGIN
    SELECT COALESCE((value::text)::decimal, 15.00)
    INTO tarif_journee
    FROM public.config
    WHERE key = 'tarif_cagnotte_journee';

    SELECT COALESCE(SUM(per.montant_credit), 0)
    INTO total_credits
    FROM public.inscriptions i
    JOIN public.benevoles b ON i.benevole_id = b.id
    JOIN public.postes p ON i.poste_id = p.id
    JOIN public.periodes per ON p.periode_id = per.id
    WHERE b.user_id = target_user_id
      AND b.is_cagnotte_forcee = false;

    FOR rec IN
        SELECT id, cagnotte_forcee_type, cagnotte_forcee_jours
        FROM public.benevoles
        WHERE user_id = target_user_id AND is_cagnotte_forcee = true
    LOOP
        IF rec.cagnotte_forcee_type = 'journee' THEN
            forced_credits := forced_credits + (COALESCE(cardinality(rec.cagnotte_forcee_jours), 0) * tarif_journee);
        ELSIF rec.cagnotte_forcee_type = 'periode' THEN
            forced_credits := forced_credits + COALESCE((
                SELECT SUM(per.montant_credit)
                FROM public.benevole_cagnotte_periodes bcp
                JOIN public.periodes per ON bcp.periode_id = per.id
                WHERE bcp.benevole_id = rec.id
            ), 0.00);
        END IF;
    END LOOP;

    SELECT COALESCE(SUM(t.montant), 0)
    INTO total_debits
    FROM public.cagnotte_transactions t
    WHERE t.user_id = target_user_id;

    RETURN total_credits + forced_credits + total_debits;
END;
$function$;

-- 6.2 get_family_tshirt_info : retour t_shirt_recupere → has_recupere_tshirt
--     DROP requis : le rename d'un OUT param change la signature.
DROP FUNCTION IF EXISTS public.get_family_tshirt_info(uuid);
CREATE OR REPLACE FUNCTION public.get_family_tshirt_info(target_user_id uuid)
 RETURNS TABLE(benevole_id uuid, prenom text, nom text, taille_tshirt text, has_recupere_tshirt boolean, has_registrations boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.prenom,
        b.nom,
        b.taille_tshirt::text,
        b.has_recupere_tshirt,
        (SELECT COUNT(*) FROM inscriptions i WHERE i.benevole_id = b.id) > 0
    FROM benevoles b
    WHERE b.user_id = target_user_id;
END;
$function$;

-- 6.3 get_family_tshirt_info_smart : retour t_shirt_recupere → has_recupere_tshirt
DROP FUNCTION IF EXISTS public.get_family_tshirt_info_smart(uuid);
CREATE OR REPLACE FUNCTION public.get_family_tshirt_info_smart(scan_id uuid)
 RETURNS TABLE(benevole_id uuid, prenom text, nom text, taille_tshirt text, has_recupere_tshirt boolean, has_registrations boolean)
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
        b.taille_tshirt::text,
        b.has_recupere_tshirt,
        ((SELECT COUNT(*) FROM inscriptions i WHERE i.benevole_id = b.id) > 0 OR b.role = 'admin')
    FROM benevoles b
    WHERE b.user_id = found_user_id;
END;
$function$;

-- 6.4 get_public_tshirt_info : retour t_shirt_recupere → has_recupere_tshirt
DROP FUNCTION IF EXISTS public.get_public_tshirt_info(uuid);
CREATE OR REPLACE FUNCTION public.get_public_tshirt_info(target_id uuid)
 RETURNS TABLE(prenom text, nom text, taille_tshirt text, has_recupere_tshirt boolean, has_registrations boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    count_regs INTEGER;
BEGIN
    SELECT COUNT(*) INTO count_regs FROM inscriptions WHERE benevole_id = target_id;

    SELECT b.prenom, b.nom, b.taille_tshirt::text, b.has_recupere_tshirt
    INTO prenom, nom, taille_tshirt, has_recupere_tshirt
    FROM benevoles b
    WHERE b.id = target_id;

    has_registrations := count_regs > 0;

    IF prenom IS NULL THEN
        RETURN;
    END IF;

    RETURN NEXT;
END;
$function$;

-- 6.5 update_tshirt_status : SET t_shirt_recupere → has_recupere_tshirt
CREATE OR REPLACE FUNCTION public.update_tshirt_status(target_id uuid, new_taille text, mark_collected boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE benevoles
    SET
        taille_tshirt = COALESCE(new_taille::tshirt_size, taille_tshirt),
        has_recupere_tshirt = mark_collected,
        updated_at = now()
    WHERE id = target_id;

    RETURN TRUE;
END;
$function$;

-- 6.6 get_auth_users_without_benevole : LEFT JOIN sur orphan_relances.auth_user_id → user_id
CREATE OR REPLACE FUNCTION public.get_auth_users_without_benevole()
 RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, relance_sent_at timestamp with time zone, telephone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    r.relance_sent_at,
    r.telephone
  FROM auth.users u
  LEFT JOIN benevoles b ON b.user_id = u.id
  LEFT JOIN orphan_relances r ON r.user_id = u.id
  WHERE b.id IS NULL
  ORDER BY u.created_at DESC;
$function$;

-- 6.7 save_orphelin_phone : INSERT sur orphan_relances.auth_user_id → user_id
--     Le paramètre p_auth_user_id reste pour ne pas casser les appels rpc() actuels
--     (mise à jour côté front en Phase 5).
CREATE OR REPLACE FUNCTION public.save_orphelin_phone(p_auth_user_id uuid, p_telephone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM benevoles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  INSERT INTO orphan_relances (user_id, telephone)
  VALUES (p_auth_user_id, p_telephone)
  ON CONFLICT (user_id) DO UPDATE SET telephone = EXCLUDED.telephone;
END;
$function$;

-- ===========================================================================
-- 7. Recréation des vues avec les nouveaux noms de colonnes
-- ===========================================================================

-- 7.1 admin_benevoles (cagnotte_forcee → is_cagnotte_forcee, vegetarien → is_vegetarien)
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
    b.relance_sent_at,
    b.is_cagnotte_forcee,
    b.cagnotte_forcee_type,
    b.cagnotte_forcee_jours,
    COALESCE(( SELECT jsonb_agg(bcp.periode_id) AS jsonb_agg
           FROM benevole_cagnotte_periodes bcp
          WHERE bcp.benevole_id = b.id), '[]'::jsonb) AS cagnotte_forcee_periodes_ids,
    count(DISTINCT i.id) AS nb_inscriptions,
    count(DISTINCT p.id) AS nb_postes_referent,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('repas_id', br.repas_id, 'nom', r.nom, 'is_vegetarien', br.is_vegetarien) ORDER BY r.created_at) AS jsonb_agg
           FROM benevole_repas br
             JOIN repas r ON br.repas_id = r.id
          WHERE br.benevole_id = b.id), '[]'::jsonb) AS repas
   FROM benevoles b
     LEFT JOIN inscriptions i ON b.id = i.benevole_id
     LEFT JOIN postes p ON b.id = p.referent_id
  GROUP BY b.id;

-- 7.2 public_planning (inscrits_actuels → nb_inscrits_actuels)
CREATE VIEW public.public_planning AS
 SELECT p.id AS poste_id,
    tp.titre,
    p.periode_debut,
    p.periode_fin,
    p.nb_max,
    p.nb_min,
    per.nom AS periode,
    per.ordre AS periode_ordre,
    tp.description,
    p.referent_id,
    tp.ordre AS type_poste_ordre,
        CASE
            WHEN p.referent_id IS NOT NULL THEN get_benevole_full_name(p.referent_id)
            ELSE NULL::text
        END AS referent_nom,
        CASE
            WHEN p.referent_id IS NOT NULL THEN get_benevole_email(p.referent_id)
            ELSE NULL::text
        END AS referent_email,
        CASE
            WHEN p.referent_id IS NOT NULL THEN get_benevole_phone(p.referent_id)
            ELSE NULL::text
        END AS referent_telephone,
    count(i.id) AS nb_inscrits_actuels,
    array_agg(get_benevole_name(i.benevole_id) ORDER BY i.created_at) FILTER (WHERE i.benevole_id IS NOT NULL) AS liste_benevoles
   FROM postes p
     JOIN type_postes tp ON p.type_poste_id = tp.id
     LEFT JOIN periodes per ON p.periode_id = per.id
     LEFT JOIN inscriptions i ON p.id = i.poste_id
  GROUP BY p.id, tp.titre, p.periode_debut, p.periode_fin, p.nb_max, p.nb_min, per.nom, per.ordre, tp.description, p.referent_id, tp.ordre;
