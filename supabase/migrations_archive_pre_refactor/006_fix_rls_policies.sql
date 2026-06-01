-- ============================================================================
-- MIGRATION : Correction des politiques RLS pour la table benevoles
-- ============================================================================

-- On suppose que la table 'benevoles' a une colonne 'user_id' (utilisée par le JS).
-- Si elle n'existe pas, il faudrait la créer, mais le JS semble déjà l'utiliser.
-- Cette migration remplace les anciennes policies (probablement basées sur id = auth.uid())
-- par des policies basées sur user_id = auth.uid().

-- 1. Supprimer les anciennes policies potentielles
DROP POLICY IF EXISTS "Lecture de son profil" ON benevoles;
DROP POLICY IF EXISTS "Création de son profil" ON benevoles;
DROP POLICY IF EXISTS "Mise à jour de son profil" ON benevoles;
DROP POLICY IF EXISTS "Suppression de son profil" ON benevoles;

DROP POLICY IF EXISTS "Lecture de ses bénévoles" ON benevoles;
DROP POLICY IF EXISTS "Création de ses bénévoles" ON benevoles;
DROP POLICY IF EXISTS "Mise à jour de ses bénévoles" ON benevoles;
DROP POLICY IF EXISTS "Suppression de ses bénévoles" ON benevoles;

-- 2. Créer les nouvelles policies

-- Lecture : L'utilisateur peut voir les bénévoles liés à son user_id
CREATE POLICY "Lecture de ses bénévoles"
  ON benevoles FOR SELECT
  USING (auth.uid() = user_id);

-- Insertion : L'utilisateur peut créer un bénévole lié à son user_id
CREATE POLICY "Création de ses bénévoles"
  ON benevoles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Mise à jour : L'utilisateur peut modifier les bénévoles liés à son user_id
CREATE POLICY "Mise à jour de ses bénévoles"
  ON benevoles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Suppression : L'utilisateur peut supprimer les bénévoles liés à son user_id
CREATE POLICY "Suppression de ses bénévoles"
  ON benevoles FOR DELETE
  USING (auth.uid() = user_id);
