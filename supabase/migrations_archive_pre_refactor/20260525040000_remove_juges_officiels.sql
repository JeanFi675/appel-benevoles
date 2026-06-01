-- ============================================================================
-- MIGRATION: Remove Juges and Officiels Roles and clean up config cagnottes
-- ============================================================================

-- 1. Réassigner les bénévoles ayant actuellement les rôles supprimés vers le rôle 'benevole'
-- pour éviter toute violation de la nouvelle contrainte de validation.
UPDATE public.benevoles 
SET role = 'benevole' 
WHERE role IN ('juge', 'admin-juge', 'officiel');

-- 2. Mettre à jour la contrainte CHECK de rôles sur la table benevoles
ALTER TABLE public.benevoles DROP CONSTRAINT IF EXISTS benevoles_role_check;
ALTER TABLE public.benevoles ADD CONSTRAINT benevoles_role_check CHECK (role IN ('benevole', 'referent', 'admin'));

-- 3. Mettre à jour la fonction get_user_balance pour simplifier le calcul
-- en supprimant les crédits spécifiques aux juges et officiels.
CREATE OR REPLACE FUNCTION public.get_user_balance(target_user_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_credits    DECIMAL(10,2) := 0;
    or_credit        DECIMAL(10,2) := 0;
    total_debits     DECIMAL(10,2) := 0;
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

    -- 3. Débits / transactions
    SELECT COALESCE(SUM(t.montant), 0)
    INTO total_debits
    FROM cagnotte_transactions t
    WHERE t.user_id = target_user_id;

    -- 4. Solde net
    RETURN total_credits + or_credit + total_debits;
END;
$$;

-- 4. Nettoyer les clés de configuration obsolètes de la table config
DELETE FROM public.config WHERE key IN ('tarif_degaines_juge', 'tarif_degaines_officiel');
