-- Migration: fix_debit_functions_user_id
-- Les fonctions get_public_benevole_info et public_debit_cagnotte cherchaient
-- par benevoles.id, mais les QR codes "Mon Matériel" contiennent auth.users.id
-- (= benevoles.user_id). Corrige en changeant le WHERE b.id → b.user_id.

-- 1. Fix get_public_benevole_info
CREATE OR REPLACE FUNCTION get_public_benevole_info(target_id UUID)
RETURNS TABLE (
    prenom TEXT,
    nom TEXT,
    solde DECIMAL(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION get_public_benevole_info(UUID) TO anon, authenticated, service_role;


-- 2. Fix public_debit_cagnotte
CREATE OR REPLACE FUNCTION public_debit_cagnotte(
    target_benevole_id UUID,
    montant_input DECIMAL(10,2),
    description_input TEXT DEFAULT 'Debit Public'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    IF debit_amount > 0 THEN
        INSERT INTO cagnotte_transactions (user_id, benevole_id, montant, description, auteur_id)
        VALUES (target_user_id, benevole_pk, -debit_amount, description_input || ' (Smart Debit)', NULL);
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

GRANT EXECUTE ON FUNCTION public_debit_cagnotte(UUID, DECIMAL, TEXT) TO anon, authenticated, service_role;
