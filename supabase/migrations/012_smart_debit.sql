-- ============================================================================
-- MIGRATION 012: Smart Debit System (Partial Payments)
-- ============================================================================

-- Mise à jour de la fonction de débit pour gérer les paiements partiels
DROP FUNCTION IF EXISTS public_debit_cagnotte(UUID, DECIMAL, TEXT);

CREATE OR REPLACE FUNCTION public_debit_cagnotte(
    target_benevole_id UUID, 
    montant_input DECIMAL(10,2),
    description_input TEXT DEFAULT 'Debit Public'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_user_id UUID;
    current_balance DECIMAL(10,2);
    debit_amount DECIMAL(10,2);
    remainder DECIMAL(10,2);
    new_balance DECIMAL(10,2);
BEGIN
    -- 1. Input Validation
    IF montant_input <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Le montant doit être positif.'
        );
    END IF;

    -- 2. Identify Family (User ID) and Get Current Balance
    SELECT b.user_id, get_user_balance(b.user_id)
    INTO target_user_id, current_balance
    FROM benevoles b 
    WHERE b.id = target_benevole_id;
    
    IF target_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Bénévole introuvable.'
        );
    END IF;

    -- 3. Logic "Smart Debit"
    
    -- Cas A : Solde déjà négatif ou nul -> Refus
    IF current_balance <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Solde insuffisant (Déjà à 0 ou négatif).',
            'debited_amount', 0,
            'new_balance', current_balance,
            'remainder_to_pay', montant_input
        );
    END IF;

    -- Cas B : Solde suffisant pour tout payer
    IF current_balance >= montant_input THEN
        debit_amount := montant_input;
        remainder := 0;
        new_balance := current_balance - montant_input;
    ELSE
    -- Cas C : Solde partiel -> On vide le compte
        debit_amount := current_balance; -- On prend tout ce qui reste
        remainder := montant_input - current_balance; -- Le reste à payer en espèce
        new_balance := 0;
    END IF;

    -- 4. Insert Transaction (Negative amount)
    -- Only if we actually debit something
    IF debit_amount > 0 THEN
        INSERT INTO cagnotte_transactions (user_id, benevole_id, montant, description, auteur_id)
        VALUES (target_user_id, target_benevole_id, -debit_amount, description_input || ' (Smart Debit)', NULL);
    END IF;

    -- 5. Return Result
    RETURN jsonb_build_object(
        'success', true,
        'debited_amount', debit_amount,
        'new_balance', new_balance,
        'remainder_to_pay', remainder,
        'message', CASE WHEN remainder > 0 THEN 'Paiement Partiel' ELSE 'Paiement Validé' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public_debit_cagnotte(UUID, DECIMAL, TEXT) TO anon, authenticated, service_role;
