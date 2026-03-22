-- Migration: fix_get_user_balance_jsonb_cast
-- Corrige le cast du tarif_degaines_juge (jsonb → numeric) et intègre benevole_or.
-- La colonne config.value est de type jsonb, "20" (JSON string) ne se cast pas
-- directement en numeric. On utilise value #>> '{}' pour extraire le texte brut.

CREATE OR REPLACE FUNCTION get_user_balance(target_user_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_credits    DECIMAL(10,2) := 0;
    or_credit        DECIMAL(10,2) := 0;
    juges_credit     DECIMAL(10,2) := 0;
    total_debits     DECIMAL(10,2) := 0;
    tarif_juge       DECIMAL(10,2) := 0;
    nb_benevoles_or  INTEGER := 0;
BEGIN
    -- 1. Crédits via inscriptions (uniquement pour les bénévoles sans benevole_or)
    SELECT COALESCE(SUM(per.montant_credit), 0)
    INTO total_credits
    FROM inscriptions i
    JOIN benevoles b ON i.benevole_id = b.id
    JOIN postes p ON i.poste_id = p.id
    JOIN periodes per ON p.periode_id = per.id
    WHERE b.user_id = target_user_id
      AND b.benevole_or = false;

    -- 2. Crédits pour les bénévoles d'or (toutes les périodes × nombre de bénévoles d'or)
    SELECT COUNT(*)
    INTO nb_benevoles_or
    FROM benevoles
    WHERE user_id = target_user_id AND benevole_or = true;

    IF nb_benevoles_or > 0 THEN
        SELECT COALESCE(SUM(montant_credit), 0) * nb_benevoles_or
        INTO or_credit
        FROM periodes;
    END IF;

    -- 3. Crédits pour les juges (nb jours de présence × tarif dégaine)
    -- Utilise #>> '{}' pour extraire la valeur d'un champ jsonb sans guillemets
    SELECT COALESCE((value #>> '{}')::numeric, 10.00)
    INTO tarif_juge
    FROM config WHERE key = 'tarif_degaines_juge';

    SELECT COALESCE(SUM(
        (CASE WHEN presence_samedi   THEN 1 ELSE 0 END) +
        (CASE WHEN presence_dimanche THEN 1 ELSE 0 END)
    ), 0) * tarif_juge
    INTO juges_credit
    FROM benevoles
    WHERE user_id = target_user_id AND role = 'juge';

    -- 4. Débits / transactions
    SELECT COALESCE(SUM(t.montant), 0)
    INTO total_debits
    FROM cagnotte_transactions t
    WHERE t.user_id = target_user_id;

    -- 5. Solde net
    RETURN total_credits + or_credit + juges_credit + total_debits;
END;
$$;
