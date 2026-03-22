-- Migration pour sécuriser les inscriptions via transaction RPC
-- et éviter les timeouts / race conditions

CREATE OR REPLACE FUNCTION public.manage_inscriptions_transaction(
    target_user_id UUID,
    modifications JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Exécuté avec les droits du créateur (pour contourner RLS partiellement si besoin, mais on check tout)
SET search_path TO 'public'
AS $function$
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
$function$;
