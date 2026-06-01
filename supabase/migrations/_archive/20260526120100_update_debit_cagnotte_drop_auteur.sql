-- Migration: adapter public_debit_cagnotte pour ne plus écrire auteur_id
-- Phase: 2.2 (Code mort)
-- Anomalie: B01 (prérequis du DROP de cagnotte_transactions.auteur_id)

CREATE OR REPLACE FUNCTION public.public_debit_cagnotte(
    target_benevole_id uuid,
    montant_input numeric,
    description_input text DEFAULT 'Debit Public'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
