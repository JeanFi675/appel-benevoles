-- ============================================================================
-- MIGRATION 011: Public Debit System
-- ============================================================================

-- 1. Helper pour récupérer les infos publiques d'un bénévole (Nom + Solde)
-- Necessary because anon users cannot query 'benevoles' table directly due to RLS
CREATE OR REPLACE FUNCTION get_public_benevole_info(target_id UUID)
RETURNS TABLE (
    prenom TEXT,
    nom TEXT,
    solde DECIMAL(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get basics and user_id to calc balance
    SELECT b.prenom, b.nom, b.user_id 
    INTO prenom, nom, target_user_id
    FROM benevoles b 
    WHERE b.id = target_id;

    IF prenom IS NULL THEN 
        RETURN; -- No result
    END IF;

    -- Calculate balance using existing secure function
    SELECT get_user_balance(target_user_id) INTO solde;

    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_benevole_info(UUID) TO anon, authenticated, service_role;


-- 2. Fonction de Débit Public (Sécurisée)
-- Force le montant en négatif. Ne permet pas le crédit.
CREATE OR REPLACE FUNCTION public_debit_cagnotte(
    target_benevole_id UUID, 
    montant_input DECIMAL(10,2),
    description_input TEXT DEFAULT 'Debit Public'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_user_id UUID;
    final_amount DECIMAL(10,2);
BEGIN
    -- 1. Input Validation
    IF montant_input <= 0 THEN
        RAISE EXCEPTION 'Le montant doit être positif (il sera converti en debit automatiquement).';
    END IF;
    
    -- Force Negative Amount (DEBIT ONLY)
    final_amount := -1 * ABS(montant_input);

    -- 2. Identify Family (User ID)
    SELECT user_id INTO target_user_id FROM benevoles WHERE id = target_benevole_id;
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Bénévole introuvable';
    END IF;

    -- 3. Insert Transaction
    -- auteur_id is NULL for anonymous actions
    INSERT INTO cagnotte_transactions (user_id, benevole_id, montant, description, auteur_id)
    VALUES (target_user_id, target_benevole_id, final_amount, description_input, NULL);

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public_debit_cagnotte(UUID, DECIMAL, TEXT) TO anon, authenticated, service_role;
