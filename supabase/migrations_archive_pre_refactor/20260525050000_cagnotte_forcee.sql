-- ============================================================================
-- MIGRATION: Cagnotte Forcée Paramétrable (À la journée ou par période)
-- ============================================================================

-- 1. Ajouter les nouvelles colonnes de cagnotte forcée à la table benevoles
ALTER TABLE public.benevoles
ADD COLUMN IF NOT EXISTS cagnotte_forcee BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS cagnotte_forcee_type TEXT CHECK (cagnotte_forcee_type IN ('journee', 'periode')),
ADD COLUMN IF NOT EXISTS cagnotte_forcee_jours TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.benevoles.cagnotte_forcee IS 'Indique si la cagnotte du bénévole est forcée (outrepasse les inscriptions).';
COMMENT ON COLUMN public.benevoles.cagnotte_forcee_type IS 'Mode de forçage : ''journee'' (montant par jour) ou ''periode'' (périodes sélectionnées).';
COMMENT ON COLUMN public.benevoles.cagnotte_forcee_jours IS 'Tableau de chaînes représentant les dates des jours cochés pour le forfait journée.';

-- 2. Créer la table de liaison benevole_cagnotte_periodes
CREATE TABLE IF NOT EXISTS public.benevole_cagnotte_periodes (
    benevole_id UUID REFERENCES public.benevoles(id) ON DELETE CASCADE,
    periode_id UUID REFERENCES public.periodes(id) ON DELETE CASCADE,
    PRIMARY KEY (benevole_id, periode_id)
);

COMMENT ON TABLE public.benevole_cagnotte_periodes IS 'Table de liaison stockant les périodes cochées pour les bénévoles ayant une cagnotte forcée par période.';

-- 3. Activer RLS sur la table de liaison
ALTER TABLE public.benevole_cagnotte_periodes ENABLE ROW LEVEL SECURITY;

-- Créer les politiques RLS
DROP POLICY IF EXISTS "Lecture publique de benevole_cagnotte_periodes" ON public.benevole_cagnotte_periodes;
CREATE POLICY "Lecture publique de benevole_cagnotte_periodes" ON public.benevole_cagnotte_periodes
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Modification de benevole_cagnotte_periodes par les admins" ON public.benevole_cagnotte_periodes;
CREATE POLICY "Modification de benevole_cagnotte_periodes par les admins" ON public.benevole_cagnotte_periodes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.benevoles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 4. Initialiser la configuration générale du tarif à la journée
INSERT INTO public.config (key, value)
VALUES ('tarif_cagnotte_journee', '15.00'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Migrer les anciennes données historiques depuis benevole_or
-- Étape A : marquer comme cagnotte forcée par période les anciens bénévoles d'or
UPDATE public.benevoles
SET cagnotte_forcee = true,
    cagnotte_forcee_type = 'periode'
WHERE benevole_or = true;

-- Étape B : cocher toutes les périodes existantes pour les anciens bénévoles d'or
INSERT INTO public.benevole_cagnotte_periodes (benevole_id, periode_id)
SELECT b.id, p.id
FROM public.benevoles b
CROSS JOIN public.periodes p
WHERE b.benevole_or = true
ON CONFLICT DO NOTHING;

-- 6. Mettre à jour la fonction de calcul get_user_balance
CREATE OR REPLACE FUNCTION public.get_user_balance(target_user_id UUID)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_credits    DECIMAL(10,2) := 0;
    forced_credits   DECIMAL(10,2) := 0;
    total_debits    DECIMAL(10,2) := 0;
    tarif_journee    DECIMAL(10,2) := 0;
    rec              RECORD;
BEGIN
    -- A. Charger le tarif journée depuis la config
    SELECT COALESCE((value::text)::decimal, 15.00)
    INTO tarif_journee
    FROM public.config
    WHERE key = 'tarif_cagnotte_journee';

    -- B. Crédits via les inscriptions normales pour les bénévoles NON forcés
    SELECT COALESCE(SUM(per.montant_credit), 0)
    INTO total_credits
    FROM public.inscriptions i
    JOIN public.benevoles b ON i.benevole_id = b.id
    JOIN public.postes p ON i.poste_id = p.id
    JOIN public.periodes per ON p.periode_id = per.id
    WHERE b.user_id = target_user_id
      AND b.cagnotte_forcee = false;

    -- C. Crédits pour les bénévoles avec cagnotte forcée
    FOR rec IN 
        SELECT id, cagnotte_forcee_type, cagnotte_forcee_jours
        FROM public.benevoles
        WHERE user_id = target_user_id AND cagnotte_forcee = true
    LOOP
        IF rec.cagnotte_forcee_type = 'journee' THEN
            -- Le total est égal au nombre de jours cochés × le tarif journalier
            forced_credits := forced_credits + (COALESCE(cardinality(rec.cagnotte_forcee_jours), 0) * tarif_journee);
        ELSIF rec.cagnotte_forcee_type = 'periode' THEN
            -- Le total est égal à la somme des montants des périodes cochées
            forced_credits := forced_credits + COALESCE((
                SELECT SUM(per.montant_credit)
                FROM public.benevole_cagnotte_periodes bcp
                JOIN public.periodes per ON bcp.periode_id = per.id
                WHERE bcp.benevole_id = rec.id
            ), 0.00);
        END IF;
    END LOOP;

    -- D. Débits / transactions
    SELECT COALESCE(SUM(t.montant), 0)
    INTO total_debits
    FROM public.cagnotte_transactions t
    WHERE t.user_id = target_user_id;

    -- E. Retourner le solde net
    RETURN total_credits + forced_credits + total_debits;
END;
$$;

-- 7. Mettre à jour la vue admin_benevoles pour exposer les nouveaux champs
DROP VIEW IF EXISTS public.admin_benevoles;

CREATE OR REPLACE VIEW public.admin_benevoles WITH (security_invoker = true) AS
SELECT
  b.id,
  b.user_id,
  b.email,
  b.prenom,
  b.nom,
  b.telephone,
  b.taille_tshirt,
  b.role,
  b.created_at,
  b.updated_at,
  b.relance_sent_at,
  b.cagnotte_forcee,
  b.cagnotte_forcee_type,
  b.cagnotte_forcee_jours,
  COALESCE(
    (SELECT jsonb_agg(bcp.periode_id)
     FROM public.benevole_cagnotte_periodes bcp
     WHERE bcp.benevole_id = b.id),
    '[]'::jsonb
  ) AS cagnotte_forcee_periodes_ids,
  COUNT(DISTINCT i.id) AS nb_inscriptions,
  COUNT(DISTINCT p.id) AS nb_postes_referent,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('repas_id', br.repas_id, 'nom', r.nom, 'vegetarien', br.vegetarien) ORDER BY r.created_at)
     FROM public.benevole_repas br
     JOIN public.repas r ON br.repas_id = r.id
     WHERE br.benevole_id = b.id),
    '[]'::jsonb
  ) AS repas
FROM public.benevoles b
LEFT JOIN public.inscriptions i ON b.id = i.benevole_id
LEFT JOIN public.postes p ON b.id = p.referent_id
GROUP BY b.id;

-- 8. Supprimer proprement l'ancienne colonne benevole_or
ALTER TABLE public.benevoles
DROP COLUMN IF EXISTS benevole_or;
