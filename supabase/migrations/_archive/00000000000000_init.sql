-- ============================================================================
-- Appel Bénévoles — Schéma de base de données consolidé (init.sql)
-- ============================================================================
-- Date de consolidation : 2026-05-27
-- Origine               : dump pg_dump --schema-only de l'instance Supabase
--                         locale (postgresql://postgres:postgres@127.0.0.1:54322/postgres)
--                         après application des migrations Phase 2.2 → 3.3
--                         (archivées dans supabase/migrations/_archive/).
-- Phase                 : Refactoring 2026-05 — Phase 2.8 (consolidation).
--
-- Caractéristiques :
--   - Idempotent : peut être ré-exécuté sans erreur (CREATE … IF NOT EXISTS,
--     CREATE OR REPLACE, DROP … IF EXISTS, wrappers DO blocks pour contraintes
--     et types ENUM).
--   - Schéma : public uniquement (auth.*, storage.*, etc. sont gérés par
--     Supabase).
--   - Extensions : btree_gist + citext sont créées au début (ajoutées par les
--     migrations 20260526130700 et 20260526140000 respectivement).
--   - SET check_function_bodies = false : permet de créer les fonctions avant
--     les tables qu'elles référencent (Postgres valide à l'exécution, lazy
--     binding).
-- ============================================================================

SET check_function_bodies = false;

-- ============================================================================
-- SECTION 1 — EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS citext     WITH SCHEMA public;

--
-- Name: cagnotte_forced_type; Type: TYPE; Schema: public; Owner: -
--

-- ============================================================================
-- SECTION 2 — TYPES (ENUMs)
-- ============================================================================

DO $idem$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cagnotte_forced_type') THEN
    CREATE TYPE public.cagnotte_forced_type AS ENUM (
    'journee',
    'periode'
);
  END IF;
END$idem$;


--
-- Name: role_type; Type: TYPE; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_type') THEN
    CREATE TYPE public.role_type AS ENUM (
    'benevole',
    'referent',
    'admin'
);
  END IF;
END$idem$;


--
-- Name: tshirt_size; Type: TYPE; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tshirt_size') THEN
    CREATE TYPE public.tshirt_size AS ENUM (
    'SANS',
    'XS',
    'S',
    'M',
    'L',
    'XL',
    'XXL'
);
  END IF;
END$idem$;


-- ============================================================================
-- SECTION 3 — FONCTIONS
-- ============================================================================

--
-- Name: check_capacity(); Type: FUNCTION; Schema: public; Owner: -
--
-- Purpose: Trigger BEFORE INSERT sur `inscriptions`. Compte les inscriptions
-- existantes du poste et refuse l'insertion si `nb_max` est atteint.
-- Source de vérité de la capacité (jamais dupliquée côté frontend).
--

CREATE OR REPLACE FUNCTION public.check_capacity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  current_count INTEGER;
  max_capacity INTEGER;
BEGIN
  SELECT nb_max INTO max_capacity FROM postes WHERE id = NEW.poste_id;
  SELECT COUNT(*) INTO current_count FROM inscriptions WHERE poste_id = NEW.poste_id;
  
  IF current_count >= max_capacity THEN
    RAISE EXCEPTION 'Ce créneau est complet (% / %)', current_count, max_capacity;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: check_referent_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.check_referent_access(target_benevole_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM inscriptions i
    JOIN postes p ON i.poste_id = p.id
    WHERE i.benevole_id = target_benevole_id
    AND p.referent_id = auth.uid()
  );
END;
$$;


--
-- Name: check_time_conflict(); Type: FUNCTION; Schema: public; Owner: -
--
-- Purpose: Trigger BEFORE INSERT/UPDATE sur `inscriptions`. Refuse l'opération
-- si le bénévole est déjà inscrit sur un autre poste dont la plage horaire
-- (`periode_debut`, `periode_fin`) chevauche celle du poste cible.
-- Règle métier critique — ne pas dupliquer côté frontend.
--

CREATE OR REPLACE FUNCTION public.check_time_conflict() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  conflict_count INTEGER;
  poste_debut TIMESTAMPTZ;
  poste_fin TIMESTAMPTZ;
BEGIN
  SELECT periode_debut, periode_fin INTO poste_debut, poste_fin
  FROM postes WHERE id = NEW.poste_id;
  
  SELECT COUNT(*) INTO conflict_count
  FROM inscriptions i
  JOIN postes p ON i.poste_id = p.id
  WHERE i.benevole_id = NEW.benevole_id
    AND i.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND ((p.periode_debut < poste_fin) AND (p.periode_fin > poste_debut));
  
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Vous êtes déjà inscrit(e) sur un créneau qui chevauche cette période';
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: debit_cagnotte_public(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--
-- Purpose: RPC publique (SECURITY DEFINER) appelée par `debit.html` après scan QR
-- d'un bénévole. Smart Debit : débite ce qui est disponible sur le solde famille
-- (`get_user_balance(user_id)`), insère une transaction négative dans
-- `cagnotte_transactions`, et retourne JSON {success, debited_amount, new_balance,
-- remainder_to_pay, message}. Refuse si solde ≤ 0. Le rôle `anon` peut l'exécuter ;
-- les contrôles sont internes à la fonction.
--

CREATE OR REPLACE FUNCTION public.debit_cagnotte_public(target_benevole_id uuid, montant_input numeric, description_input text DEFAULT 'Debit Public'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    benevole_pk      UUID;
    target_user_id   UUID;
    current_balance  DECIMAL(10,2);
    debit_amount     DECIMAL(10,2);
    remainder        DECIMAL(10,2);
    new_balance      DECIMAL(10,2);
BEGIN
    -- 1. Validation
    IF montant_input <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Le montant doit être positif.'
        );
    END IF;

    -- 2. Cherche la famille par user_id (pas benevoles.id)
    --    Récupère un benevole_pk valide pour la FK de cagnotte_transactions
    SELECT b.id, b.user_id, get_user_balance(b.user_id)
    INTO benevole_pk, target_user_id, current_balance
    FROM benevoles b
    WHERE b.user_id = target_benevole_id
    ORDER BY b.created_at
    LIMIT 1;

    IF target_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Bénévole introuvable.'
        );
    END IF;

    -- 3. Smart Debit

    -- Cas A : Solde déjà négatif ou nul → Refus
    IF current_balance <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Solde insuffisant (Déjà à 0 ou négatif).',
            'debited_amount', 0,
            'new_balance', current_balance,
            'remainder_to_pay', montant_input
        );
    END IF;

    -- Cas B : Solde suffisant
    IF current_balance >= montant_input THEN
        debit_amount := montant_input;
        remainder    := 0;
        new_balance  := current_balance - montant_input;
    ELSE
    -- Cas C : Paiement partiel → vide le compte
        debit_amount := current_balance;
        remainder    := montant_input - current_balance;
        new_balance  := 0;
    END IF;

    -- 4. Insertion transaction (montant négatif)
    --    auteur_id retiré : colonne morte, sera supprimée dans la migration suivante
    IF debit_amount > 0 THEN
        INSERT INTO cagnotte_transactions (user_id, benevole_id, montant, description)
        VALUES (target_user_id, benevole_pk, -debit_amount, description_input || ' (Smart Debit)');
    END IF;

    -- 5. Résultat
    RETURN jsonb_build_object(
        'success', true,
        'debited_amount', debit_amount,
        'new_balance', new_balance,
        'remainder_to_pay', remainder,
        'message', CASE WHEN remainder > 0 THEN 'Paiement Partiel' ELSE 'Paiement Validé' END
    );
END;
$$;


--
-- Name: get_auth_users_without_benevole(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_auth_users_without_benevole() RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, relance_sent_at timestamp with time zone, telephone text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_benevole_email(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_benevole_email(b_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT email
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;


--
-- Name: get_benevole_full_name(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_benevole_full_name(b_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT prenom || ' ' || nom
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;


--
-- Name: get_benevole_name(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_benevole_name(b_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT prenom || ' ' || SUBSTRING(nom FROM 1 FOR 1) || '.'
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;


--
-- Name: get_benevole_phone(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_benevole_phone(b_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  res TEXT;
BEGIN
  SELECT telephone
  INTO res
  FROM benevoles
  WHERE id = b_id;
  RETURN res;
END;
$$;


--
-- Name: get_family_tshirt_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_family_tshirt_info(target_user_id uuid) RETURNS TABLE(benevole_id uuid, prenom text, nom text, taille_tshirt text, has_recupere_tshirt boolean, has_registrations boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_family_tshirt_info_smart(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_family_tshirt_info_smart(scan_id uuid) RETURNS TABLE(benevole_id uuid, prenom text, nom text, taille_tshirt text, has_recupere_tshirt boolean, has_registrations boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_public_benevole_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_public_benevole_info(target_id uuid) RETURNS TABLE(prenom text, nom text, solde numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Cherche par user_id (l'UUID auth passé dans les QR codes)
    SELECT b.prenom, b.nom, b.user_id
    INTO prenom, nom, target_user_id
    FROM benevoles b
    WHERE b.user_id = target_id
    ORDER BY b.created_at
    LIMIT 1;

    IF prenom IS NULL THEN
        RETURN; -- Aucun résultat
    END IF;

    -- Calcule le solde famille via la fonction sécurisée existante
    SELECT get_user_balance(target_user_id) INTO solde;

    RETURN NEXT;
END;
$$;


--
-- Name: get_public_inscriptions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_public_inscriptions() RETURNS TABLE(poste_id uuid, formatted_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.poste_id, 
        (b.prenom || ' ' || SUBSTRING(b.nom, 1, 2) || '.')::TEXT as formatted_name
    FROM inscriptions i
    JOIN benevoles b ON i.benevole_id = b.id;
END;
$$;


--
-- Name: get_public_tshirt_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_public_tshirt_info(target_id uuid) RETURNS TABLE(prenom text, nom text, taille_tshirt text, has_recupere_tshirt boolean, has_registrations boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: get_user_balance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_user_balance(target_user_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM benevoles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;


--
-- Name: FUNCTION is_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_admin() IS 'Returns true if current user has admin role.';


--
-- Name: is_referent_for_benevole(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_referent_for_benevole(target_benevole_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM inscriptions i
    JOIN postes p ON i.poste_id = p.id
    JOIN benevoles ref ON p.referent_id = ref.id
    WHERE i.benevole_id = target_benevole_id
      AND ref.user_id = auth.uid()
  );
$$;


--
-- Name: manage_inscriptions_transaction(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--
-- Purpose: RPC SECURITY DEFINER appelée par le wizard d'inscription. Applique en
-- une seule transaction atomique un batch JSONB d'actions `{action: 'add'|'remove',
-- poste_id, benevole_id}`. Verrouille chaque poste cible (`SELECT ... FOR UPDATE`)
-- pour éviter les race conditions sur la capacité, re-vérifie capacité + conflit
-- horaire (défense en profondeur vs triggers), et refuse toute action ne portant
-- pas sur les bénévoles du `user_id` appelant (sauf admin). Rollback total au
-- moindre échec. Timeout statement = 30s.
--

CREATE OR REPLACE FUNCTION public.manage_inscriptions_transaction(target_user_id uuid, modifications jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET statement_timeout TO '30s'
    AS $$
DECLARE
    mod RECORD;
    target_benevole_id UUID;
    target_poste_id UUID;
    current_inscriptions INTEGER;
    max_capacity INTEGER;
    poste_record RECORD;
    conflict_count INTEGER;
    caller_id UUID;
    is_admin BOOLEAN;
    benevole_user_id UUID;
    result_log JSONB := '[]'::jsonb;
BEGIN
    caller_id := auth.uid();

    -- SECURITE: Check session active IMMEDIATEMENT (Fail Fast)
    -- Evite les timeouts silencieux quand le token est expiré/révoqué
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Session expirée. Veuillez recharger la page.';
    END IF;
    
    -- 1. Vérification des permissions globales
    -- Est-ce que l'appelant est admin ?
    SELECT EXISTS (
        SELECT 1 FROM benevoles 
        WHERE user_id = caller_id AND role = 'admin'
    ) INTO is_admin;

    -- Pour chaque modification demandée
    FOR mod IN SELECT * FROM jsonb_to_recordset(modifications) AS x(action text, poste_id uuid, benevole_id uuid)
    LOOP
        target_poste_id := mod.poste_id;
        target_benevole_id := mod.benevole_id;

        -- 1.1 Vérification de la propriété du bénévole
        SELECT user_id INTO benevole_user_id FROM benevoles WHERE id = target_benevole_id;
        
        IF benevole_user_id IS NULL THEN
            RAISE EXCEPTION 'Bénévole introuvable : %', target_benevole_id;
        END IF;

        IF (benevole_user_id != caller_id) AND (NOT is_admin) THEN
            RAISE EXCEPTION 'Permission refusée : Vous ne pouvez modifier que vos propres inscriptions.';
        END IF;

        -- 2. Traitement des suppressions (DELETE)
        IF mod.action = 'remove' THEN
            DELETE FROM inscriptions 
            WHERE poste_id = target_poste_id AND benevole_id = target_benevole_id;
            
            result_log := result_log || jsonb_build_object('status', 'removed', 'poste', target_poste_id);
        
        -- 3. Traitement des ajouts (ADD)
        ELSIF mod.action = 'add' THEN
            -- 3.1 Verrouillage du poste pour éviter Race Condition (FOR UPDATE)
            -- On verrouille la ligne du poste pour être sûr que le compteur ne bouge pas pendant notre check
            SELECT * INTO poste_record FROM postes WHERE id = target_poste_id FOR UPDATE;
            
            IF poste_record IS NULL THEN
                RAISE EXCEPTION 'Poste introuvable : %', target_poste_id;
            END IF;

            -- 3.2 Vérification Capacité (Check manuel pour être sûr, même si trigger existe)
            SELECT COUNT(*) INTO current_inscriptions FROM inscriptions WHERE poste_id = target_poste_id;
            
            IF current_inscriptions >= poste_record.nb_max THEN
                RAISE EXCEPTION 'Le poste est complet (% / %)', current_inscriptions, poste_record.nb_max;
            END IF;

            -- 3.3 Vérification Conflit Horaire
            -- On vérifie s'il y a déjà une inscription sur un créneau qui chevauche
            SELECT COUNT(*) INTO conflict_count
            FROM inscriptions i
            JOIN postes p ON i.poste_id = p.id
            WHERE i.benevole_id = target_benevole_id
              AND (
                  (p.periode_debut < poste_record.periode_fin) AND 
                  (p.periode_fin > poste_record.periode_debut)
              );
            
            IF conflict_count > 0 THEN
                RAISE EXCEPTION 'Conflit horaire détecté pour ce bénévole.';
            END IF;

            -- 3.4 Insertion
            INSERT INTO inscriptions (poste_id, benevole_id)
            VALUES (target_poste_id, target_benevole_id)
            ON CONFLICT (poste_id, benevole_id) DO NOTHING; -- Idempotence

            result_log := result_log || jsonb_build_object('status', 'added', 'poste', target_poste_id);
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'log', result_log);

EXCEPTION WHEN OTHERS THEN
    -- En cas d'erreur, tout est annulé (Rollback automatique de la transaction RPC)
    RAISE EXCEPTION 'Opération échouée : %', SQLERRM;
END;
$$;


--
-- Name: prevent_role_change(); Type: FUNCTION; Schema: public; Owner: -
--
-- Purpose: Trigger BEFORE UPDATE sur `benevoles`. Empêche tout utilisateur
-- authentifié de modifier sa propre colonne `role` (anti privilege escalation).
-- Un admin reste libre de changer le rôle d'autres bénévoles via les policies.
--

CREATE OR REPLACE FUNCTION public.prevent_role_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Check if the role is actually changing
  -- AND the user is authenticated
  -- AND the user is trying to change their own record (auth.uid() matches the record's user_id)
  IF NEW.role IS DISTINCT FROM OLD.role 
     AND auth.role() = 'authenticated' 
     AND auth.uid() = OLD.user_id THEN
    RAISE EXCEPTION 'You cannot change your own role.';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: save_orphelin_phone(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.save_orphelin_phone(p_auth_user_id uuid, p_telephone text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: update_tshirt_status(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_tshirt_status(target_id uuid, new_taille text, mark_collected boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE benevoles
    SET
        taille_tshirt = COALESCE(new_taille::tshirt_size, taille_tshirt),
        has_recupere_tshirt = mark_collected,
        updated_at = now()
    WHERE id = target_id;

    RETURN TRUE;
END;
$$;


-- ============================================================================
-- SECTION 4 — TABLES et VUES
-- (pg_dump intercale tables et vues pour gérer les dépendances ;
--  les définitions complètes des vues figurent en section RULES plus bas.)
-- ============================================================================

--
-- Name: admin_benevoles; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.admin_benevoles AS
SELECT
    NULL::uuid AS id,
    NULL::uuid AS user_id,
    NULL::public.citext AS email,
    NULL::text AS prenom,
    NULL::text AS nom,
    NULL::text AS telephone,
    NULL::public.tshirt_size AS taille_tshirt,
    NULL::public.role_type AS role,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::timestamp with time zone AS relance_sent_at,
    NULL::boolean AS is_cagnotte_forcee,
    NULL::public.cagnotte_forced_type AS cagnotte_forcee_type,
    NULL::text[] AS cagnotte_forcee_jours,
    NULL::jsonb AS cagnotte_forcee_periodes_ids,
    NULL::bigint AS nb_inscriptions,
    NULL::bigint AS nb_postes_referent,
    NULL::jsonb AS repas;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: benevoles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.benevoles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    prenom text NOT NULL,
    nom text NOT NULL,
    telephone text NOT NULL,
    taille_tshirt public.tshirt_size,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role public.role_type DEFAULT 'benevole'::public.role_type NOT NULL,
    user_id uuid NOT NULL,
    has_recupere_tshirt boolean DEFAULT false NOT NULL,
    relance_sent_at timestamp with time zone,
    is_cagnotte_forcee boolean DEFAULT false NOT NULL,
    cagnotte_forcee_type public.cagnotte_forced_type,
    cagnotte_forcee_jours text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT benevoles_cagnotte_consistency CHECK ((((is_cagnotte_forcee = false) AND (cagnotte_forcee_type IS NULL)) OR ((is_cagnotte_forcee = true) AND (cagnotte_forcee_type IS NOT NULL)))),
    CONSTRAINT benevoles_cagnotte_journee_has_days CHECK (((cagnotte_forcee_type IS DISTINCT FROM 'journee'::public.cagnotte_forced_type) OR (cardinality(cagnotte_forcee_jours) > 0))),
    CONSTRAINT benevoles_email_format_chk CHECK (((email)::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)),
    CONSTRAINT benevoles_nom_nonempty CHECK ((length(TRIM(BOTH FROM nom)) > 0)),
    CONSTRAINT benevoles_prenom_nonempty CHECK ((length(TRIM(BOTH FROM prenom)) > 0)),
    CONSTRAINT benevoles_telephone_format_chk CHECK (((telephone = 'INCONNU'::text) OR (telephone ~ '^[+0-9 ().-]{6,}$'::text)))
);


--
-- Name: COLUMN benevoles.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.benevoles.role IS 'User role: benevole (default) or admin. Set manually in Supabase dashboard.';


--
-- Name: COLUMN benevoles.is_cagnotte_forcee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.benevoles.is_cagnotte_forcee IS 'Indique si la cagnotte du bénévole est forcée (outrepasse les inscriptions).';


--
-- Name: COLUMN benevoles.cagnotte_forcee_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.benevoles.cagnotte_forcee_type IS 'Mode de forçage : ''journee'' (montant par jour) ou ''periode'' (périodes sélectionnées).';


--
-- Name: COLUMN benevoles.cagnotte_forcee_jours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.benevoles.cagnotte_forcee_jours IS 'Tableau de chaînes représentant les dates des jours cochés pour le forfait journée.';


--
-- Name: inscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.inscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poste_id uuid NOT NULL,
    benevole_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: periodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.periodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text NOT NULL,
    ordre integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    montant_credit numeric(10,2) DEFAULT 0.00 NOT NULL,
    CONSTRAINT periodes_montant_credit_positive CHECK ((montant_credit >= (0)::numeric)),
    CONSTRAINT periodes_nom_nonempty CHECK ((length(TRIM(BOTH FROM nom)) > 0)),
    CONSTRAINT periodes_ordre_positive CHECK ((ordre > 0))
);


--
-- Name: TABLE periodes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.periodes IS 'Competition periods with display order';


--
-- Name: COLUMN periodes.nom; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.periodes.nom IS 'Period name (e.g., "Qualifications Samedi", "Finales Dimanche")';


--
-- Name: COLUMN periodes.ordre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.periodes.ordre IS 'Display order (lower numbers appear first)';


--
-- Name: COLUMN periodes.montant_credit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.periodes.montant_credit IS 'Crédit (en €) généré par une inscription validée sur cette période';


--
-- Name: postes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.postes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    periode_debut timestamp with time zone NOT NULL,
    periode_fin timestamp with time zone NOT NULL,
    referent_id uuid,
    nb_min integer DEFAULT 1 NOT NULL,
    nb_max integer DEFAULT 10 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    periode_id uuid NOT NULL,
    type_poste_id uuid NOT NULL,
    CONSTRAINT capacite_valide CHECK (((nb_max >= nb_min) AND (nb_min > 0))),
    CONSTRAINT periode_valide CHECK ((periode_fin > periode_debut)),
    CONSTRAINT postes_nb_max_bound CHECK ((nb_max <= 200))
);


--
-- Name: COLUMN postes.periode_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.postes.periode_id IS 'Reference to the period this shift belongs to';


--
-- Name: type_postes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.type_postes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_ref date NOT NULL,
    titre text NOT NULL,
    description text,
    ordre integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT type_postes_ordre_positive CHECK ((ordre >= 0)),
    CONSTRAINT type_postes_titre_nonempty CHECK ((length(TRIM(BOTH FROM titre)) > 0))
);


--
-- Name: TABLE type_postes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.type_postes IS 'Table hiérarchique pour les types de postes par jour';


--
-- Name: admin_inscriptions; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.admin_inscriptions AS
 SELECT i.id,
    i.created_at,
    tp.titre AS poste_titre,
    p.periode_debut,
    p.periode_fin
   FROM ((((public.inscriptions i
     JOIN public.benevoles b ON ((i.benevole_id = b.id)))
     JOIN public.postes p ON ((i.poste_id = p.id)))
     JOIN public.type_postes tp ON ((p.type_poste_id = tp.id)))
     LEFT JOIN public.periodes per ON ((p.periode_id = per.id)))
  ORDER BY p.periode_debut, b.nom;


--
-- Name: admin_periodes; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.admin_periodes AS
 SELECT id,
    nom,
    ordre
   FROM public.periodes per
  ORDER BY ordre;


--
-- Name: benevole_cagnotte_periodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.benevole_cagnotte_periodes (
    benevole_id uuid NOT NULL,
    periode_id uuid NOT NULL
);


--
-- Name: TABLE benevole_cagnotte_periodes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.benevole_cagnotte_periodes IS 'Table de liaison stockant les périodes cochées pour les bénévoles ayant une cagnotte forcée par période.';


--
-- Name: benevole_repas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.benevole_repas (
    benevole_id uuid NOT NULL,
    repas_id uuid NOT NULL,
    is_vegetarien boolean DEFAULT false NOT NULL
);


--
-- Name: cagnotte_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.cagnotte_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    benevole_id uuid NOT NULL,
    montant numeric(10,2) NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cagnotte_transactions_description_nonempty CHECK ((length(TRIM(BOTH FROM description)) > 0)),
    CONSTRAINT cagnotte_transactions_montant_bound CHECK ((abs(montant) <= (100)::numeric)),
    CONSTRAINT cagnotte_transactions_montant_nonzero CHECK ((montant <> (0)::numeric))
);


--
-- Name: config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.config (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT config_key_nonempty CHECK ((length(TRIM(BOTH FROM key)) > 0))
);


--
-- Name: jours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jours (
    date_ref date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE jours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.jours IS 'Table de référence pour les jours de compétition créés';


--
-- Name: COLUMN jours.date_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.jours.date_ref IS 'Date unique identifiant le jour (ex: 2026-05-16)';


--
-- Name: orphan_relances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.orphan_relances (
    user_id uuid NOT NULL,
    relance_sent_at timestamp with time zone,
    telephone text
);


--
-- Name: programmes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.programmes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_ref date NOT NULL,
    heure time without time zone NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: public_planning; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.public_planning AS
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
            WHEN (p.referent_id IS NOT NULL) THEN public.get_benevole_full_name(p.referent_id)
            ELSE NULL::text
        END AS referent_nom,
        CASE
            WHEN (p.referent_id IS NOT NULL) THEN public.get_benevole_email(p.referent_id)
            ELSE NULL::text
        END AS referent_email,
        CASE
            WHEN (p.referent_id IS NOT NULL) THEN public.get_benevole_phone(p.referent_id)
            ELSE NULL::text
        END AS referent_telephone,
    count(i.id) AS nb_inscrits_actuels,
    array_agg(public.get_benevole_name(i.benevole_id) ORDER BY i.created_at) FILTER (WHERE (i.benevole_id IS NOT NULL)) AS liste_benevoles
   FROM (((public.postes p
     JOIN public.type_postes tp ON ((p.type_poste_id = tp.id)))
     LEFT JOIN public.periodes per ON ((p.periode_id = per.id)))
     LEFT JOIN public.inscriptions i ON ((p.id = i.poste_id)))
  GROUP BY p.id, tp.titre, p.periode_debut, p.periode_fin, p.nb_max, p.nb_min, per.nom, per.ordre, tp.description, p.referent_id, tp.ordre;


--
-- Name: repas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.repas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT repas_nom_nonempty CHECK ((length(TRIM(BOTH FROM nom)) > 0))
);


-- ============================================================================
-- SECTION 5 — CONTRAINTES (PK, UNIQUE, CHECK, EXCLUDE)
-- ============================================================================

--
-- Name: benevole_cagnotte_periodes benevole_cagnotte_periodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevole_cagnotte_periodes' AND c.conname = 'benevole_cagnotte_periodes_pkey'
  ) THEN
    ALTER TABLE ONLY public.benevole_cagnotte_periodes
    ADD CONSTRAINT benevole_cagnotte_periodes_pkey PRIMARY KEY (benevole_id, periode_id);
  END IF;
END$idem$;


--
-- Name: benevole_repas benevole_repas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevole_repas' AND c.conname = 'benevole_repas_pkey'
  ) THEN
    ALTER TABLE ONLY public.benevole_repas
    ADD CONSTRAINT benevole_repas_pkey PRIMARY KEY (benevole_id, repas_id);
  END IF;
END$idem$;


--
-- Name: benevoles benevoles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevoles' AND c.conname = 'benevoles_pkey'
  ) THEN
    ALTER TABLE ONLY public.benevoles
    ADD CONSTRAINT benevoles_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


--
-- Name: benevoles benevoles_user_prenom_nom_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevoles' AND c.conname = 'benevoles_user_prenom_nom_uniq'
  ) THEN
    ALTER TABLE ONLY public.benevoles
    ADD CONSTRAINT benevoles_user_prenom_nom_uniq UNIQUE (user_id, prenom, nom);
  END IF;
END$idem$;


--
-- Name: cagnotte_transactions cagnotte_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'cagnotte_transactions' AND c.conname = 'cagnotte_transactions_pkey'
  ) THEN
    ALTER TABLE ONLY public.cagnotte_transactions
    ADD CONSTRAINT cagnotte_transactions_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


--
-- Name: config config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'config' AND c.conname = 'config_pkey'
  ) THEN
    ALTER TABLE ONLY public.config
    ADD CONSTRAINT config_pkey PRIMARY KEY (key);
  END IF;
END$idem$;


--
-- Name: inscriptions inscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'inscriptions' AND c.conname = 'inscriptions_pkey'
  ) THEN
    ALTER TABLE ONLY public.inscriptions
    ADD CONSTRAINT inscriptions_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


--
-- Name: inscriptions inscriptions_poste_id_benevole_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'inscriptions' AND c.conname = 'inscriptions_poste_id_benevole_id_key'
  ) THEN
    ALTER TABLE ONLY public.inscriptions
    ADD CONSTRAINT inscriptions_poste_id_benevole_id_key UNIQUE (poste_id, benevole_id);
  END IF;
END$idem$;


--
-- Name: jours jours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'jours' AND c.conname = 'jours_pkey'
  ) THEN
    ALTER TABLE ONLY public.jours
    ADD CONSTRAINT jours_pkey PRIMARY KEY (date_ref);
  END IF;
END$idem$;


--
-- Name: orphan_relances orphan_relances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'orphan_relances' AND c.conname = 'orphan_relances_pkey'
  ) THEN
    ALTER TABLE ONLY public.orphan_relances
    ADD CONSTRAINT orphan_relances_pkey PRIMARY KEY (user_id);
  END IF;
END$idem$;


--
-- Name: periodes periodes_nom_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'periodes' AND c.conname = 'periodes_nom_key'
  ) THEN
    ALTER TABLE ONLY public.periodes
    ADD CONSTRAINT periodes_nom_key UNIQUE (nom);
  END IF;
END$idem$;


--
-- Name: periodes periodes_ordre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'periodes' AND c.conname = 'periodes_ordre_key'
  ) THEN
    ALTER TABLE ONLY public.periodes
    ADD CONSTRAINT periodes_ordre_key UNIQUE (ordre);
  END IF;
END$idem$;


--
-- Name: periodes periodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'periodes' AND c.conname = 'periodes_pkey'
  ) THEN
    ALTER TABLE ONLY public.periodes
    ADD CONSTRAINT periodes_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


--
-- Name: postes postes_no_overlap_same_type; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'postes' AND c.conname = 'postes_no_overlap_same_type'
  ) THEN
    ALTER TABLE ONLY public.postes
    ADD CONSTRAINT postes_no_overlap_same_type EXCLUDE USING gist (type_poste_id WITH =, tstzrange(periode_debut, periode_fin) WITH &&);
  END IF;
END$idem$;


--
-- Name: postes postes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'postes' AND c.conname = 'postes_pkey'
  ) THEN
    ALTER TABLE ONLY public.postes
    ADD CONSTRAINT postes_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


--
-- Name: programmes programmes_date_heure_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'programmes' AND c.conname = 'programmes_date_heure_uniq'
  ) THEN
    ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_date_heure_uniq UNIQUE (date_ref, heure);
  END IF;
END$idem$;


--
-- Name: programmes programmes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'programmes' AND c.conname = 'programmes_pkey'
  ) THEN
    ALTER TABLE ONLY public.programmes
    ADD CONSTRAINT programmes_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


--
-- Name: repas repas_nom_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'repas' AND c.conname = 'repas_nom_uniq'
  ) THEN
    ALTER TABLE ONLY public.repas
    ADD CONSTRAINT repas_nom_uniq UNIQUE (nom);
  END IF;
END$idem$;


--
-- Name: repas repas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'repas' AND c.conname = 'repas_pkey'
  ) THEN
    ALTER TABLE ONLY public.repas
    ADD CONSTRAINT repas_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


--
-- Name: type_postes type_postes_new_date_ref_titre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'type_postes' AND c.conname = 'type_postes_new_date_ref_titre_key'
  ) THEN
    ALTER TABLE ONLY public.type_postes
    ADD CONSTRAINT type_postes_new_date_ref_titre_key UNIQUE (date_ref, titre);
  END IF;
END$idem$;


--
-- Name: type_postes type_postes_new_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'type_postes' AND c.conname = 'type_postes_new_pkey'
  ) THEN
    ALTER TABLE ONLY public.type_postes
    ADD CONSTRAINT type_postes_new_pkey PRIMARY KEY (id);
  END IF;
END$idem$;


-- ============================================================================
-- SECTION 6 — INDEX
-- ============================================================================

--
-- Name: idx_benevole_cagnotte_periodes_periode_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_benevole_cagnotte_periodes_periode_id ON public.benevole_cagnotte_periodes USING btree (periode_id);


--
-- Name: idx_benevole_repas_repas_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_benevole_repas_repas_id ON public.benevole_repas USING btree (repas_id);


--
-- Name: idx_benevoles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_benevoles_email ON public.benevoles USING btree (email);


--
-- Name: idx_benevoles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_benevoles_role ON public.benevoles USING btree (role);


--
-- Name: idx_benevoles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_benevoles_user_id ON public.benevoles USING btree (user_id);


--
-- Name: idx_cagnotte_benevole; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_cagnotte_benevole ON public.cagnotte_transactions USING btree (benevole_id);


--
-- Name: idx_cagnotte_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_cagnotte_user ON public.cagnotte_transactions USING btree (user_id);


--
-- Name: idx_inscriptions_benevole; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_inscriptions_benevole ON public.inscriptions USING btree (benevole_id);


--
-- Name: idx_inscriptions_poste; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_inscriptions_poste ON public.inscriptions USING btree (poste_id);


--
-- Name: idx_postes_periode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_postes_periode ON public.postes USING btree (periode_debut, periode_fin);


--
-- Name: idx_postes_periode_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_postes_periode_id ON public.postes USING btree (periode_id);


--
-- Name: idx_postes_referent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_postes_referent_id ON public.postes USING btree (referent_id);


--
-- Name: idx_postes_type_poste_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_postes_type_poste_id ON public.postes USING btree (type_poste_id);


--
-- Name: idx_programmes_date_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_programmes_date_ref ON public.programmes USING btree (date_ref);


-- ============================================================================
-- SECTION 7 — RÈGLES de VUES (définitions complètes)
-- ============================================================================

--
-- Name: admin_benevoles _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.admin_benevoles AS
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


-- ============================================================================
-- SECTION 8 — TRIGGERS
-- ============================================================================

--
-- Name: inscriptions trg_check_capacity; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trg_check_capacity ON public.inscriptions;
CREATE TRIGGER trg_check_capacity BEFORE INSERT ON public.inscriptions FOR EACH ROW EXECUTE FUNCTION public.check_capacity();


--
-- Name: inscriptions trg_check_time_conflict; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trg_check_time_conflict ON public.inscriptions;
CREATE TRIGGER trg_check_time_conflict BEFORE INSERT OR UPDATE ON public.inscriptions FOR EACH ROW EXECUTE FUNCTION public.check_time_conflict();


--
-- Name: benevoles trg_prevent_role_change; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS trg_prevent_role_change ON public.benevoles;
CREATE TRIGGER trg_prevent_role_change BEFORE UPDATE ON public.benevoles FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();


-- ============================================================================
-- SECTION 9 — CLÉS ÉTRANGÈRES
-- ============================================================================

--
-- Name: benevole_cagnotte_periodes benevole_cagnotte_periodes_benevole_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevole_cagnotte_periodes' AND c.conname = 'benevole_cagnotte_periodes_benevole_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.benevole_cagnotte_periodes
    ADD CONSTRAINT benevole_cagnotte_periodes_benevole_id_fkey FOREIGN KEY (benevole_id) REFERENCES public.benevoles(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: benevole_cagnotte_periodes benevole_cagnotte_periodes_periode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevole_cagnotte_periodes' AND c.conname = 'benevole_cagnotte_periodes_periode_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.benevole_cagnotte_periodes
    ADD CONSTRAINT benevole_cagnotte_periodes_periode_id_fkey FOREIGN KEY (periode_id) REFERENCES public.periodes(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: benevole_repas benevole_repas_benevole_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevole_repas' AND c.conname = 'benevole_repas_benevole_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.benevole_repas
    ADD CONSTRAINT benevole_repas_benevole_id_fkey FOREIGN KEY (benevole_id) REFERENCES public.benevoles(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: benevole_repas benevole_repas_repas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevole_repas' AND c.conname = 'benevole_repas_repas_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.benevole_repas
    ADD CONSTRAINT benevole_repas_repas_id_fkey FOREIGN KEY (repas_id) REFERENCES public.repas(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: benevoles benevoles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'benevoles' AND c.conname = 'benevoles_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.benevoles
    ADD CONSTRAINT benevoles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: cagnotte_transactions cagnotte_transactions_benevole_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'cagnotte_transactions' AND c.conname = 'cagnotte_transactions_benevole_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.cagnotte_transactions
    ADD CONSTRAINT cagnotte_transactions_benevole_id_fkey FOREIGN KEY (benevole_id) REFERENCES public.benevoles(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: cagnotte_transactions cagnotte_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'cagnotte_transactions' AND c.conname = 'cagnotte_transactions_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.cagnotte_transactions
    ADD CONSTRAINT cagnotte_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: inscriptions inscriptions_benevole_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'inscriptions' AND c.conname = 'inscriptions_benevole_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.inscriptions
    ADD CONSTRAINT inscriptions_benevole_id_fkey FOREIGN KEY (benevole_id) REFERENCES public.benevoles(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: inscriptions inscriptions_poste_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'inscriptions' AND c.conname = 'inscriptions_poste_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.inscriptions
    ADD CONSTRAINT inscriptions_poste_id_fkey FOREIGN KEY (poste_id) REFERENCES public.postes(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: orphan_relances orphan_relances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'orphan_relances' AND c.conname = 'orphan_relances_user_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.orphan_relances
    ADD CONSTRAINT orphan_relances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: postes postes_new_type_poste_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'postes' AND c.conname = 'postes_new_type_poste_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.postes
    ADD CONSTRAINT postes_new_type_poste_id_fkey FOREIGN KEY (type_poste_id) REFERENCES public.type_postes(id) ON DELETE CASCADE;
  END IF;
END$idem$;


--
-- Name: postes postes_periode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'postes' AND c.conname = 'postes_periode_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.postes
    ADD CONSTRAINT postes_periode_id_fkey FOREIGN KEY (periode_id) REFERENCES public.periodes(id) ON DELETE SET NULL;
  END IF;
END$idem$;


--
-- Name: postes postes_referent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'postes' AND c.conname = 'postes_referent_id_fkey'
  ) THEN
    ALTER TABLE ONLY public.postes
    ADD CONSTRAINT postes_referent_id_fkey FOREIGN KEY (referent_id) REFERENCES public.benevoles(id) ON DELETE SET NULL;
  END IF;
END$idem$;


--
-- Name: type_postes type_postes_new_date_ref_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $idem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'type_postes' AND c.conname = 'type_postes_new_date_ref_fkey'
  ) THEN
    ALTER TABLE ONLY public.type_postes
    ADD CONSTRAINT type_postes_new_date_ref_fkey FOREIGN KEY (date_ref) REFERENCES public.jours(date_ref) ON DELETE CASCADE;
  END IF;
END$idem$;


-- ============================================================================
-- SECTION 10 — POLICIES RLS
-- ============================================================================

--
-- Name: inscriptions Admins can delete inscriptions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can delete inscriptions" ON public.inscriptions;
CREATE POLICY "Admins can delete inscriptions" ON public.inscriptions FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = ( SELECT auth.uid() AS uid)) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: periodes Admins can delete periodes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can delete periodes" ON public.periodes;
CREATE POLICY "Admins can delete periodes" ON public.periodes FOR DELETE USING (public.is_admin());


--
-- Name: postes Admins can delete postes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can delete postes" ON public.postes;
CREATE POLICY "Admins can delete postes" ON public.postes FOR DELETE USING (public.is_admin());


--
-- Name: programmes Admins can delete programme events; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can delete programme events" ON public.programmes;
CREATE POLICY "Admins can delete programme events" ON public.programmes FOR DELETE USING (public.is_admin());


--
-- Name: inscriptions Admins can insert inscriptions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can insert inscriptions" ON public.inscriptions;
CREATE POLICY "Admins can insert inscriptions" ON public.inscriptions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = ( SELECT auth.uid() AS uid)) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: periodes Admins can insert periodes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can insert periodes" ON public.periodes;
CREATE POLICY "Admins can insert periodes" ON public.periodes FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: postes Admins can insert postes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can insert postes" ON public.postes;
CREATE POLICY "Admins can insert postes" ON public.postes FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: programmes Admins can insert programme events; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can insert programme events" ON public.programmes;
CREATE POLICY "Admins can insert programme events" ON public.programmes FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: cagnotte_transactions Admins can insert transactions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can insert transactions" ON public.cagnotte_transactions;
CREATE POLICY "Admins can insert transactions" ON public.cagnotte_transactions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = ( SELECT auth.uid() AS uid)) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: orphan_relances Admins can manage orphan_relances; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can manage orphan_relances" ON public.orphan_relances;
CREATE POLICY "Admins can manage orphan_relances" ON public.orphan_relances USING ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = auth.uid()) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: benevoles Admins can update all profiles; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.benevoles;
CREATE POLICY "Admins can update all profiles" ON public.benevoles FOR UPDATE USING (public.is_admin());


--
-- Name: config Admins can update config; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can update config" ON public.config;
CREATE POLICY "Admins can update config" ON public.config FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: periodes Admins can update periodes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can update periodes" ON public.periodes;
CREATE POLICY "Admins can update periodes" ON public.periodes FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: postes Admins can update postes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can update postes" ON public.postes;
CREATE POLICY "Admins can update postes" ON public.postes FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: programmes Admins can update programme events; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can update programme events" ON public.programmes;
CREATE POLICY "Admins can update programme events" ON public.programmes FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: benevoles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.benevoles;
CREATE POLICY "Admins can view all profiles" ON public.benevoles FOR SELECT USING (public.is_admin());


--
-- Name: inscriptions Admins can view inscriptions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Admins can view inscriptions" ON public.inscriptions;
CREATE POLICY "Admins can view inscriptions" ON public.inscriptions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = ( SELECT auth.uid() AS uid)) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: config Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.config;
CREATE POLICY "Enable insert for authenticated users" ON public.config FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: config Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Enable read access for all users" ON public.config;
CREATE POLICY "Enable read access for all users" ON public.config FOR SELECT USING (true);


--
-- Name: benevole_repas Insertion de ses propres choix de repas; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Insertion de ses propres choix de repas" ON public.benevole_repas;
CREATE POLICY "Insertion de ses propres choix de repas" ON public.benevole_repas FOR INSERT WITH CHECK (((benevole_id IN ( SELECT benevoles.id
   FROM public.benevoles
  WHERE (benevoles.user_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: cagnotte_transactions Lecture de ses transactions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture de ses transactions" ON public.cagnotte_transactions;
CREATE POLICY "Lecture de ses transactions" ON public.cagnotte_transactions FOR SELECT USING (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = ( SELECT auth.uid() AS uid)) AND (benevoles.role = 'admin'::public.role_type))))));


--
-- Name: benevole_cagnotte_periodes Lecture publique de benevole_cagnotte_periodes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture publique de benevole_cagnotte_periodes" ON public.benevole_cagnotte_periodes;
CREATE POLICY "Lecture publique de benevole_cagnotte_periodes" ON public.benevole_cagnotte_periodes FOR SELECT USING (true);


--
-- Name: benevole_repas Lecture publique des choix de repas; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture publique des choix de repas" ON public.benevole_repas;
CREATE POLICY "Lecture publique des choix de repas" ON public.benevole_repas FOR SELECT USING (true);


--
-- Name: inscriptions Lecture publique des inscriptions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture publique des inscriptions" ON public.inscriptions;
CREATE POLICY "Lecture publique des inscriptions" ON public.inscriptions FOR SELECT USING (true);


--
-- Name: jours Lecture publique des jours; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture publique des jours" ON public.jours;
CREATE POLICY "Lecture publique des jours" ON public.jours FOR SELECT USING (true);


--
-- Name: repas Lecture publique des repas; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture publique des repas" ON public.repas;
CREATE POLICY "Lecture publique des repas" ON public.repas FOR SELECT USING (true);


--
-- Name: type_postes Lecture publique des types de postes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture publique des types de postes" ON public.type_postes;
CREATE POLICY "Lecture publique des types de postes" ON public.type_postes FOR SELECT USING (true);


--
-- Name: programmes Lecture publique du programme; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Lecture publique du programme" ON public.programmes;
CREATE POLICY "Lecture publique du programme" ON public.programmes FOR SELECT USING (true);


--
-- Name: benevole_cagnotte_periodes Modification de benevole_cagnotte_periodes par les admins; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Modification de benevole_cagnotte_periodes par les admins" ON public.benevole_cagnotte_periodes;
CREATE POLICY "Modification de benevole_cagnotte_periodes par les admins" ON public.benevole_cagnotte_periodes USING ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = auth.uid()) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: jours Modification des jours par les admins; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Modification des jours par les admins" ON public.jours;
CREATE POLICY "Modification des jours par les admins" ON public.jours USING ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = auth.uid()) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: repas Modification des repas par les admins; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Modification des repas par les admins" ON public.repas;
CREATE POLICY "Modification des repas par les admins" ON public.repas USING ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = auth.uid()) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: type_postes Modification des types de postes par les admins; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Modification des types de postes par les admins" ON public.type_postes;
CREATE POLICY "Modification des types de postes par les admins" ON public.type_postes USING ((EXISTS ( SELECT 1
   FROM public.benevoles
  WHERE ((benevoles.user_id = auth.uid()) AND (benevoles.role = 'admin'::public.role_type)))));


--
-- Name: periodes Public can view periodes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Public can view periodes" ON public.periodes;
CREATE POLICY "Public can view periodes" ON public.periodes FOR SELECT USING (true);


--
-- Name: postes Public can view postes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Public can view postes" ON public.postes;
CREATE POLICY "Public can view postes" ON public.postes FOR SELECT USING (true);


--
-- Name: benevoles Referents can view benevoles on their postes; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Referents can view benevoles on their postes" ON public.benevoles;
CREATE POLICY "Referents can view benevoles on their postes" ON public.benevoles FOR SELECT USING (public.is_referent_for_benevole(id));


--
-- Name: benevoles Referents can view volunteers; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Referents can view volunteers" ON public.benevoles;
CREATE POLICY "Referents can view volunteers" ON public.benevoles FOR SELECT TO authenticated USING (public.check_referent_access(id));


--
-- Name: benevole_repas Suppression de ses propres choix de repas; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Suppression de ses propres choix de repas" ON public.benevole_repas;
CREATE POLICY "Suppression de ses propres choix de repas" ON public.benevole_repas FOR DELETE USING (((benevole_id IN ( SELECT benevoles.id
   FROM public.benevoles
  WHERE (benevoles.user_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: inscriptions Users can delete managed inscriptions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Users can delete managed inscriptions" ON public.inscriptions;
CREATE POLICY "Users can delete managed inscriptions" ON public.inscriptions FOR DELETE USING ((benevole_id IN ( SELECT benevoles.id
   FROM public.benevoles
  WHERE (benevoles.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: benevoles Users can delete own profiles; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Users can delete own profiles" ON public.benevoles;
CREATE POLICY "Users can delete own profiles" ON public.benevoles FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: inscriptions Users can insert managed inscriptions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Users can insert managed inscriptions" ON public.inscriptions;
CREATE POLICY "Users can insert managed inscriptions" ON public.inscriptions FOR INSERT WITH CHECK ((benevole_id IN ( SELECT benevoles.id
   FROM public.benevoles
  WHERE (benevoles.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: benevoles Users can insert own profiles; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Users can insert own profiles" ON public.benevoles;
CREATE POLICY "Users can insert own profiles" ON public.benevoles FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: benevoles Users can update own profiles; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Users can update own profiles" ON public.benevoles;
CREATE POLICY "Users can update own profiles" ON public.benevoles FOR UPDATE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: inscriptions Users can view managed inscriptions; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Users can view managed inscriptions" ON public.inscriptions;
CREATE POLICY "Users can view managed inscriptions" ON public.inscriptions FOR SELECT USING ((benevole_id IN ( SELECT benevoles.id
   FROM public.benevoles
  WHERE (benevoles.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: benevoles Users can view own profiles; Type: POLICY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS "Users can view own profiles" ON public.benevoles;
CREATE POLICY "Users can view own profiles" ON public.benevoles FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


-- ============================================================================
-- SECTION 11 — ACTIVATION & FORCE RLS
-- ============================================================================

--
-- Name: benevole_cagnotte_periodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.benevole_cagnotte_periodes ENABLE ROW LEVEL SECURITY;

--
-- Name: benevole_repas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.benevole_repas ENABLE ROW LEVEL SECURITY;

--
-- Name: benevoles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.benevoles ENABLE ROW LEVEL SECURITY;

--
-- Name: cagnotte_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cagnotte_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

--
-- Name: inscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: jours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jours ENABLE ROW LEVEL SECURITY;

--
-- Name: orphan_relances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orphan_relances ENABLE ROW LEVEL SECURITY;

--
-- Name: periodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.periodes ENABLE ROW LEVEL SECURITY;

--
-- Name: postes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.postes ENABLE ROW LEVEL SECURITY;

--
-- Name: programmes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

--
-- Name: repas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repas ENABLE ROW LEVEL SECURITY;

--
-- Name: type_postes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.type_postes ENABLE ROW LEVEL SECURITY;

