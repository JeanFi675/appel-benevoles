-- Migration: ajout des CHECK constraints métier
-- Phase: 2.3 (Contraintes)
-- Anomalies: H10 (11 CHECK simples) + B05 (2 seuils, décisions D5.a / D5.b)
-- Source: audit/13_constraints.md §1.6.3 Bloc 1 + Bloc 3.
-- 0 violation en base (snapshot 2026-05-25).

-- cagnotte_transactions
ALTER TABLE public.cagnotte_transactions
    ADD CONSTRAINT cagnotte_transactions_montant_nonzero
        CHECK (montant <> 0),
    ADD CONSTRAINT cagnotte_transactions_description_nonempty
        CHECK (length(trim(description)) > 0),
    ADD CONSTRAINT cagnotte_transactions_montant_bound
        CHECK (abs(montant) <= 100);                            -- D5.a (et non 10000)

-- periodes
ALTER TABLE public.periodes
    ADD CONSTRAINT periodes_montant_credit_positive
        CHECK (montant_credit >= 0),
    ADD CONSTRAINT periodes_ordre_positive
        CHECK (ordre > 0),
    ADD CONSTRAINT periodes_nom_nonempty
        CHECK (length(trim(nom)) > 0);

-- type_postes
ALTER TABLE public.type_postes
    ADD CONSTRAINT type_postes_ordre_positive
        CHECK (ordre >= 0),
    ADD CONSTRAINT type_postes_titre_nonempty
        CHECK (length(trim(titre)) > 0);

-- repas
ALTER TABLE public.repas
    ADD CONSTRAINT repas_nom_nonempty
        CHECK (length(trim(nom)) > 0);

-- config
ALTER TABLE public.config
    ADD CONSTRAINT config_key_nonempty
        CHECK (length(trim(key)) > 0);

-- benevoles : libellés + cohérence cagnotte forcée
ALTER TABLE public.benevoles
    ADD CONSTRAINT benevoles_prenom_nonempty
        CHECK (length(trim(prenom)) > 0),
    ADD CONSTRAINT benevoles_nom_nonempty
        CHECK (length(trim(nom)) > 0),
    ADD CONSTRAINT benevoles_cagnotte_consistency
        CHECK (
            (cagnotte_forcee = false AND cagnotte_forcee_type IS NULL)
            OR (cagnotte_forcee = true AND cagnotte_forcee_type IS NOT NULL)
        ),
    ADD CONSTRAINT benevoles_cagnotte_journee_has_days
        CHECK (
            cagnotte_forcee_type IS DISTINCT FROM 'journee'
            OR cardinality(cagnotte_forcee_jours) > 0
        );

-- postes : seuil métier nb_max
ALTER TABLE public.postes
    ADD CONSTRAINT postes_nb_max_bound
        CHECK (nb_max <= 200);                                  -- D5.b
