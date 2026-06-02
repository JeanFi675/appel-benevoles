-- Migration: 20260401150000_add_cagnotte_officiels
-- Ajoute la gestion de la cagnotte pour les officiels (au weekend)
-- et on corrige en même temps le credit du role admin-juge.

CREATE OR REPLACE FUNCTION get_user_balance(target_user_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_credits    DECIMAL(10,2) := 0;
    or_credit        DECIMAL(10,2) := 0;
    juges_credit     DECIMAL(10,2) := 0;
    officiels_credit DECIMAL(10,2) := 0;
    total_debits     DECIMAL(10,2) := 0;
    tarif_juge       DECIMAL(10,2) := 0;
    tarif_officiel   DECIMAL(10,2) := 0;
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

    -- 3. Crédits pour les juges et admin-juges (nb jours de présence × tarif dégaine jour)
    SELECT COALESCE((value #>> '{}')::numeric, 10.00)
    INTO tarif_juge
    FROM config WHERE key = 'tarif_degaines_juge';

    SELECT COALESCE(SUM(
        (CASE WHEN presence_samedi   THEN 1 ELSE 0 END) +
        (CASE WHEN presence_dimanche THEN 1 ELSE 0 END)
    ), 0) * tarif_juge
    INTO juges_credit
    FROM benevoles
    WHERE user_id = target_user_id AND (role = 'juge' OR role = 'admin-juge');

    -- 4. Crédits pour les officiels (1 forfait week-end)
    SELECT COALESCE((value #>> '{}')::numeric, 15.00)
    INTO tarif_officiel
    FROM config WHERE key = 'tarif_degaines_officiel';

    -- Les officiels comptent pour 1 week-end entier par profil officiel
    SELECT COALESCE(SUM(1), 0) * tarif_officiel
    INTO officiels_credit
    FROM benevoles
    WHERE user_id = target_user_id AND role = 'officiel';

    -- 5. Débits / transactions
    SELECT COALESCE(SUM(t.montant), 0)
    INTO total_debits
    FROM cagnotte_transactions t
    WHERE t.user_id = target_user_id;

    -- 6. Solde net
    RETURN total_credits + or_credit + juges_credit + officiels_credit + total_debits;
END;
$$;
