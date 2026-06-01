-- Migration: Smart Family T-shirt retrieval
-- Supports scanning either a Benevole ID or a User ID to get the whole family's status.

CREATE OR REPLACE FUNCTION get_family_tshirt_info_smart(scan_id UUID)
RETURNS TABLE (
    benevole_id UUID,
    prenom TEXT,
    nom TEXT,
    taille_tshirt TEXT,
    t_shirt_recupere BOOLEAN,
    has_registrations BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    found_user_id UUID;
BEGIN
    -- 1. Try to see if scan_id is a Benevole ID
    SELECT user_id INTO found_user_id FROM benevoles WHERE id = scan_id;
    
    -- 2. If not found, maybe it IS a User ID? (Check if any benevole has this user_id)
    IF found_user_id IS NULL THEN
        PERFORM 1 FROM benevoles WHERE user_id = scan_id LIMIT 1;
        IF FOUND THEN
            found_user_id := scan_id;
        END IF;
    END IF;

    -- 3. If still null, return empty
    IF found_user_id IS NULL THEN
        RETURN;
    END IF;

    -- 4. Return all family members
    RETURN QUERY
    SELECT 
        b.id,
        b.prenom,
        b.nom,
        b.taille_tshirt,
        b.t_shirt_recupere,
        (SELECT COUNT(*) FROM inscriptions i WHERE i.benevole_id = b.id) > 0
    FROM benevoles b
    WHERE b.user_id = found_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_family_tshirt_info_smart(UUID) TO anon, authenticated, service_role;
