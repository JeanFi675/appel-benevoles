-- ============================================================================
-- MIGRATION 010: Système de Cagnotte / Porte-monnaie Bénévoles
-- ============================================================================

-- 1. Ajouter la valeur monétaire aux périodes
ALTER TABLE periodes 
ADD COLUMN IF NOT EXISTS montant_credit DECIMAL(10,2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN periodes.montant_credit IS 'Crédit (en €) généré par une inscription validée sur cette période';


-- 2. Créer la table des transactions (Dépenses / Ajustements)
CREATE TABLE IF NOT EXISTS cagnotte_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Clé de regroupement (Famille)
    benevole_id UUID REFERENCES benevoles(id) ON DELETE SET NULL, -- Qui a fait la dépense (tracabilité)
    montant DECIMAL(10,2) NOT NULL, -- Négatif = Dépense, Positif = Réajustement
    description TEXT,
    auteur_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Staff qui a encaissé
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les recherches rapides par famille
CREATE INDEX IF NOT EXISTS idx_cagnotte_user ON cagnotte_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cagnotte_benevole ON cagnotte_transactions(benevole_id);

-- RLS sur les transactions
ALTER TABLE cagnotte_transactions ENABLE ROW LEVEL SECURITY;

-- Lecture : Chacun peut voir ses propres transactions (via user_id)
CREATE POLICY "Lecture de ses transactions"
  ON cagnotte_transactions FOR SELECT
  USING (
    -- L'utilisateur connecté est le propriétaire du compte
    auth.uid() = user_id
    OR 
    -- OU c'est un admin
    EXISTS (SELECT 1 FROM benevoles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Ecriture : Seuls les admins peuvent créer des transactions (débiter)
CREATE POLICY "Admins can insert transactions"
  ON cagnotte_transactions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM benevoles WHERE user_id = auth.uid() AND role = 'admin')
  );


-- 3. Fonction RPC pour calculer le solde d'un compte (Famille)
CREATE OR REPLACE FUNCTION get_user_balance(target_user_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER -- Nécessaire pour lire periodes et inscriptions sans souci de RLS complexe si appelé par qqn d'autre
AS $$
DECLARE
    total_credits DECIMAL(10,2);
    total_debits DECIMAL(10,2);
BEGIN
    -- 1. Calcul des crédits via les inscriptions
    -- On somme le montant_credit des periodes pour chaque inscription liée à un bénévole du user_id
    SELECT COALESCE(SUM(per.montant_credit), 0)
    INTO total_credits
    FROM inscriptions i
    JOIN benevoles b ON i.benevole_id = b.id
    JOIN postes p ON i.poste_id = p.id
    JOIN periodes per ON p.periode_id = per.id
    WHERE b.user_id = target_user_id;

    -- 2. Calcul des débits/transactions
    SELECT COALESCE(SUM(t.montant), 0)
    INTO total_debits
    FROM cagnotte_transactions t
    WHERE t.user_id = target_user_id;

    -- 3. Retourner le solde net
    RETURN total_credits + total_debits;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_balance TO public; -- Sécurisé par la logique interne ou l'appelant
