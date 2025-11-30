-- ============================================================================
-- MIGRATION INITIALE : Système de Gestion de Bénévoles pour Escalade
-- ============================================================================

-- 1. EXTENSION UUID (si pas déjà activée)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLE POSTES (Créneaux de bénévolat)
CREATE TABLE IF NOT EXISTS postes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre TEXT NOT NULL,
  periode_debut TIMESTAMPTZ NOT NULL,
  periode_fin TIMESTAMPTZ NOT NULL,
  referent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT,
  nb_min INTEGER NOT NULL DEFAULT 1,
  nb_max INTEGER NOT NULL DEFAULT 10,
  categorie TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT periode_valide CHECK (periode_fin > periode_debut),
  CONSTRAINT capacite_valide CHECK (nb_max >= nb_min AND nb_min > 0)
);

-- 3. TABLE BENEVOLES (Profils utilisateurs)
CREATE TABLE IF NOT EXISTS benevoles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  telephone TEXT,
  taille_tshirt TEXT CHECK (taille_tshirt IN ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABLE INSCRIPTIONS (Liaison bénévoles <-> postes)
CREATE TABLE IF NOT EXISTS inscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poste_id UUID NOT NULL REFERENCES postes(id) ON DELETE CASCADE,
  benevole_id UUID NOT NULL REFERENCES benevoles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(poste_id, benevole_id)
);

-- 5. INDEX pour performances
CREATE INDEX IF NOT EXISTS idx_inscriptions_poste ON inscriptions(poste_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_benevole ON inscriptions(benevole_id);
CREATE INDEX IF NOT EXISTS idx_postes_periode ON postes(periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_postes_categorie ON postes(categorie);

-- ============================================================================
-- TRIGGERS DE VALIDATION MÉTIER
-- ============================================================================

-- 6. FONCTION : Vérification capacité maximale
CREATE OR REPLACE FUNCTION check_capacity()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_capacity INTEGER;
BEGIN
  -- Récupérer la capacité max du poste
  SELECT nb_max INTO max_capacity
  FROM postes
  WHERE id = NEW.poste_id;

  -- Compter les inscriptions actuelles
  SELECT COUNT(*) INTO current_count
  FROM inscriptions
  WHERE poste_id = NEW.poste_id;

  -- Bloquer si complet
  IF current_count >= max_capacity THEN
    RAISE EXCEPTION 'Ce créneau est complet (% / %)', current_count, max_capacity;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. TRIGGER : Appliquer vérification capacité
DROP TRIGGER IF EXISTS trigger_check_capacity ON inscriptions;
CREATE TRIGGER trigger_check_capacity
  BEFORE INSERT ON inscriptions
  FOR EACH ROW
  EXECUTE FUNCTION check_capacity();

-- 8. FONCTION : Vérification conflit temporel
CREATE OR REPLACE FUNCTION check_time_conflict()
RETURNS TRIGGER AS $$
DECLARE
  conflict_count INTEGER;
  poste_debut TIMESTAMPTZ;
  poste_fin TIMESTAMPTZ;
BEGIN
  -- Récupérer les horaires du poste ciblé
  SELECT periode_debut, periode_fin
  INTO poste_debut, poste_fin
  FROM postes
  WHERE id = NEW.poste_id;

  -- Chercher des chevauchements temporels
  SELECT COUNT(*) INTO conflict_count
  FROM inscriptions i
  JOIN postes p ON i.poste_id = p.id
  WHERE i.benevole_id = NEW.benevole_id
    AND i.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      (p.periode_debut < poste_fin) AND (p.periode_fin > poste_debut)
    );

  -- Bloquer si conflit détecté
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Vous êtes déjà inscrit(e) sur un créneau qui chevauche cette période';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. TRIGGER : Appliquer vérification conflit temporel
DROP TRIGGER IF EXISTS trigger_check_time_conflict ON inscriptions;
CREATE TRIGGER trigger_check_time_conflict
  BEFORE INSERT OR UPDATE ON inscriptions
  FOR EACH ROW
  EXECUTE FUNCTION check_time_conflict();

-- ============================================================================
-- VUE PUBLIQUE ANONYMISÉE
-- ============================================================================

-- 10. VUE : Planning public avec données anonymisées
CREATE OR REPLACE VIEW public_planning AS
SELECT
  p.id AS poste_id,
  p.titre,
  p.periode_debut,
  p.periode_fin,
  p.nb_max,
  p.nb_min,
  p.categorie,
  p.description,

  -- Référent anonymisé (Prénom + Initiale)
  CASE
    WHEN p.referent_id IS NOT NULL THEN
      (SELECT b.prenom || ' ' || SUBSTRING(b.nom FROM 1 FOR 1) || '.'
       FROM benevoles b
       WHERE b.id = p.referent_id)
    ELSE NULL
  END AS referent_nom,

  -- Comptage des inscrits
  COUNT(i.id) AS inscrits_actuels,

  -- Liste anonymisée des bénévoles (Prénom + Initiale)
  ARRAY_AGG(
    b.prenom || ' ' || SUBSTRING(b.nom FROM 1 FOR 1) || '.'
    ORDER BY i.created_at
  ) FILTER (WHERE b.id IS NOT NULL) AS liste_benevoles

FROM postes p
LEFT JOIN inscriptions i ON p.id = i.poste_id
LEFT JOIN benevoles b ON i.benevole_id = b.id
GROUP BY p.id;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- 11. Activer RLS sur toutes les tables
ALTER TABLE postes ENABLE ROW LEVEL SECURITY;
ALTER TABLE benevoles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscriptions ENABLE ROW LEVEL SECURITY;

-- 12. POLICIES : Table POSTES
-- Lecture publique
CREATE POLICY "Lecture publique des postes"
  ON postes FOR SELECT
  USING (true);

-- Écriture : admin uniquement (via service_role, pas d'INSERT public)
-- Pas de policy INSERT/UPDATE/DELETE = bloqué pour utilisateurs normaux

-- 13. POLICIES : Table BENEVOLES
-- Lecture : uniquement son propre profil
CREATE POLICY "Lecture de son profil"
  ON benevoles FOR SELECT
  USING (auth.uid() = id);

-- Insertion : création auto à la première connexion
CREATE POLICY "Création de son profil"
  ON benevoles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Mise à jour : uniquement son profil
CREATE POLICY "Mise à jour de son profil"
  ON benevoles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 14. POLICIES : Table INSCRIPTIONS
-- Lecture publique (pour afficher les listes)
CREATE POLICY "Lecture publique des inscriptions"
  ON inscriptions FOR SELECT
  USING (true);

-- Insertion : uniquement pour soi-même
CREATE POLICY "Inscription pour soi-même"
  ON inscriptions FOR INSERT
  WITH CHECK (auth.uid() = benevole_id);

-- Suppression : uniquement ses propres inscriptions
CREATE POLICY "Suppression de ses inscriptions"
  ON inscriptions FOR DELETE
  USING (auth.uid() = benevole_id);

-- ============================================================================
-- DONNÉES DE TEST (OPTIONNEL - à retirer en production)
-- ============================================================================

-- Exemple de postes (décommenter pour tester)
/*
INSERT INTO postes (titre, periode_debut, periode_fin, categorie, description, nb_min, nb_max) VALUES
('Juge de bloc', '2025-06-14 08:00:00+02', '2025-06-14 12:00:00+02', 'Qualifications Samedi', 'Connaissance des règles FFME requise', 2, 4),
('Assureur', '2025-06-14 08:00:00+02', '2025-06-14 12:00:00+02', 'Qualifications Samedi', 'Doit savoir assurer en tête', 3, 6),
('Buvette', '2025-06-14 12:00:00+02', '2025-06-14 18:00:00+02', 'Qualifications Samedi', 'Service boissons et snacks', 1, 3),
('Juge de bloc', '2025-06-14 13:00:00+02', '2025-06-14 17:00:00+02', 'Demi-finales Samedi', 'Connaissance des règles FFME requise', 2, 4),
('Chronométreur', '2025-06-15 09:00:00+02', '2025-06-15 12:00:00+02', 'Finales Dimanche', 'Gestion du temps des essais', 2, 3);
*/
