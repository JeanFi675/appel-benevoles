-- Migration: optimisation perf de la vue admin_benevoles (requête #1 du dashboard)
--
-- Purpose:
--   admin_benevoles calculait nb_inscriptions / nb_postes_referent via
--   LEFT JOIN inscriptions + LEFT JOIN postes puis count(DISTINCT ...). Ce double
--   JOIN provoque un « fan-out » (produit cartésien inscriptions × postes par
--   bénévole) que le count(DISTINCT) doit ensuite dédoublonner — coûteux à planifier
--   ET à exécuter. Mesuré sur prod : ~70 ms (49 ms planning + 21 ms exec) par appel.
--
--   On remplace ces deux compteurs par des SOUS-REQUÊTES CORRÉLÉES scalaires (même
--   forme que les agrégats `repas` et `cagnotte_forcee_periodes_ids` déjà présents) :
--   plus de produit cartésien, plus de GROUP BY. Mesuré sur prod après réécriture :
--   ~5 ms (1,7 ms planning + 3,7 ms exec) → ~13× plus rapide.
--
--   Équivalence des données VÉRIFIÉE sur prod (EXCEPT dans les deux sens = 0 ligne
--   de différence sur 141 bénévoles). count(*) == count(DISTINCT id) car id est PK
--   (donc toujours distinct) ; un bénévole sans inscription/poste renvoie 0 dans les
--   deux formulations.
--
--   La vue reste en security_invoker = true (Phase sécurité 20260605140000) : aucun
--   changement de droits, la RLS de l'appelant s'applique à l'identique.

CREATE OR REPLACE VIEW public.admin_benevoles
WITH (security_invoker = true) AS
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
    b.is_cagnotte_forcee,
    b.cagnotte_forcee_type,
    b.cagnotte_forcee_jours,
    COALESCE(
      (SELECT jsonb_agg(bcp.periode_id)
         FROM benevole_cagnotte_periodes bcp
        WHERE bcp.benevole_id = b.id),
      '[]'::jsonb
    ) AS cagnotte_forcee_periodes_ids,
    (SELECT count(*) FROM inscriptions i WHERE i.benevole_id = b.id) AS nb_inscriptions,
    (SELECT count(*) FROM postes p WHERE p.referent_id = b.id)       AS nb_postes_referent,
    COALESCE(
      (SELECT jsonb_agg(
                jsonb_build_object('repas_id', br.repas_id, 'nom', r.nom, 'is_vegetarien', br.is_vegetarien)
                ORDER BY r.created_at)
         FROM benevole_repas br
         JOIN repas r ON br.repas_id = r.id
        WHERE br.benevole_id = b.id),
      '[]'::jsonb
    ) AS repas
  FROM benevoles b;
