-- Migration: Family T-shirt support

-- Function to get info for all volunteers in a family (User ID)
CREATE OR REPLACE FUNCTION get_family_tshirt_info(target_user_id UUID)
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
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.prenom,
        b.nom,
        b.taille_tshirt,
        b.t_shirt_recupere,
        (SELECT COUNT(*) FROM inscriptions i WHERE i.benevole_id = b.id) > 0
    FROM benevoles b
    WHERE b.user_id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_family_tshirt_info(UUID) TO anon, authenticated, service_role;
