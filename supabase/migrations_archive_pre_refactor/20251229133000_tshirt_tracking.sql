-- Migration: Tracking T-shirt collection

-- 1. Add column to track collection status
ALTER TABLE benevoles ADD COLUMN IF NOT EXISTS t_shirt_recupere BOOLEAN DEFAULT FALSE;

-- 2. Function to get public info needed for T-shirt scanner
CREATE OR REPLACE FUNCTION get_public_tshirt_info(target_id UUID)
RETURNS TABLE (
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
    count_regs INTEGER;
BEGIN
    SELECT COUNT(*) INTO count_regs FROM inscriptions WHERE benevole_id = target_id;
    
    SELECT b.prenom, b.nom, b.taille_tshirt, b.t_shirt_recupere
    INTO prenom, nom, taille_tshirt, t_shirt_recupere
    FROM benevoles b
    WHERE b.id = target_id;
    
    has_registrations := count_regs > 0;
    
    IF prenom IS NULL THEN
        RETURN;
    END IF;
    
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_tshirt_info(UUID) TO anon, authenticated, service_role;

-- 3. Function to update status
CREATE OR REPLACE FUNCTION update_tshirt_status(
    target_id UUID,
    new_taille TEXT,
    mark_collected BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE benevoles
    SET 
        taille_tshirt = COALESCE(new_taille, taille_tshirt),
        t_shirt_recupere = mark_collected,
        updated_at = now()
    WHERE id = target_id;
    
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_tshirt_status(UUID, TEXT, BOOLEAN) TO anon, authenticated, service_role;
