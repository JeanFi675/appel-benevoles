-- ============================================================================
-- MIGRATION 013: Add juge role and specific fields
-- ============================================================================

-- 1. Ajouter le rôle 'juge' et mettre à jour la contrainte existante
ALTER TABLE benevoles DROP CONSTRAINT IF EXISTS benevoles_role_check;
ALTER TABLE benevoles ADD CONSTRAINT benevoles_role_check CHECK (role IN ('benevole', 'referent', 'admin', 'juge'));

-- 2. Ajouter les champs spécifiques aux juges
ALTER TABLE benevoles 
  ADD COLUMN IF NOT EXISTS repas_vendredi BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS repas_samedi BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS presence_samedi BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS presence_dimanche BOOLEAN DEFAULT false;

-- 3. Configurer le tarif "dégaines"
INSERT INTO config (key, value) VALUES ('tarif_degaines_juge', '10')
ON CONFLICT (key) DO NOTHING;

-- 4. Options: Update get_user_balance
CREATE OR REPLACE FUNCTION get_user_balance(target_user_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_credits DECIMAL(10,2);
    total_debits DECIMAL(10,2);
    juges_credit DECIMAL(10,2) := 0;
    tarif_juge DECIMAL(10,2) := 0;
BEGIN
    -- 1. Calcul des crédits via les inscriptions (Bénévoles classiques)
    SELECT COALESCE(SUM(per.montant_credit), 0)
    INTO total_credits
    FROM inscriptions i
    JOIN benevoles b ON i.benevole_id = b.id
    JOIN postes p ON i.poste_id = p.id
    JOIN periodes per ON p.periode_id = per.id
    WHERE b.user_id = target_user_id;

    -- 2. Calcul des crédits pour les juges (Présences)
    -- Récupérer le tarif de config
    SELECT COALESCE((value::text)::numeric, 10.00) INTO tarif_juge 
    FROM config WHERE key = 'tarif_degaines_juge';

    -- Somme des jours de présence des juges liés à cet utilisateur
    SELECT COALESCE(SUM(
        (CASE WHEN presence_samedi THEN 1 ELSE 0 END) + 
        (CASE WHEN presence_dimanche THEN 1 ELSE 0 END)
    ), 0) * tarif_juge
    INTO juges_credit
    FROM benevoles 
    WHERE user_id = target_user_id AND role = 'juge';

    -- 3. Calcul des débits/transactions
    SELECT COALESCE(SUM(t.montant), 0)
    INTO total_debits
    FROM cagnotte_transactions t
    WHERE t.user_id = target_user_id;

    -- 4. Retourner le solde net
    RETURN total_credits + juges_credit + total_debits;
END;
$$;
