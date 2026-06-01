-- Ajout de la contrainte FK manquante entre postes.referent_id et benevoles.id
-- Cela permet à Supabase d'effectuer la jointure automatique dans loadPostes()
-- via la syntaxe: select: '*, benevoles(prenom, nom)'

ALTER TABLE postes
ADD CONSTRAINT postes_referent_id_fkey
FOREIGN KEY (referent_id) REFERENCES benevoles(id) ON DELETE SET NULL;
