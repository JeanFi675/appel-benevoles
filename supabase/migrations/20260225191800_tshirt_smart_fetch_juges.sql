-- Migration: Update Smart Family T-shirt retrieval for Judges
-- Modifies the get_family_tshirt_info_smart to also return has_registrations = true 
-- when the role is 'juge', 'admin-juge', or 'admin'.

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
SET search_path TO 'public'
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
        ((SELECT COUNT(*) FROM inscriptions i WHERE i.benevole_id = b.id) > 0 OR b.role IN ('juge', 'admin-juge', 'admin'))
    FROM benevoles b
    WHERE b.user_id = found_user_id;
END;
$$;
