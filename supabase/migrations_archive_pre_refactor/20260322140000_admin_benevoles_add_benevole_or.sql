-- Migration: admin_benevoles_add_benevole_or
-- Ajoute le champ benevole_or à la vue admin_benevoles

CREATE OR REPLACE VIEW admin_benevoles AS
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
    count(DISTINCT i.id)  AS nb_inscriptions,
    count(DISTINCT p.id)  AS nb_postes_referent,
    b.repas_vendredi,
    b.repas_samedi,
    b.vegetarien,
    b.benevole_or
FROM benevoles b
LEFT JOIN inscriptions i ON b.id = i.benevole_id
LEFT JOIN postes p ON b.id = p.referent_id
GROUP BY b.id;
