-- Migration: table d'adhésions club importée depuis NocoDB (annuaire du club)
-- Permet d'afficher le type d'adhésion de chaque bénévole dans la liste admin

CREATE TABLE club_adhesions (
  id       BIGSERIAL PRIMARY KEY,
  licence  TEXT,
  nom      TEXT,      -- stocké en MAJUSCULES comme dans NocoDB
  prenom   TEXT,
  type     TEXT,      -- "Abonnements" | "Cours" | "Cours + Abonnements"
  mail     TEXT       -- peut être NULL ou vide (nombreux membres sans mail)
);

-- Index pour la recherche par mail (cas principal de matching)
CREATE INDEX idx_club_adhesions_mail ON club_adhesions (lower(mail))
  WHERE mail IS NOT NULL AND mail <> '';

-- Index pour la recherche par nom (fallback quand mail absent)
CREATE INDEX idx_club_adhesions_nom ON club_adhesions (upper(nom), lower(prenom));

-- RLS : lecture admin seulement
ALTER TABLE club_adhesions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin peut lire les adhesions"
  ON club_adhesions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM benevoles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Permettre le truncate/insert par le service role (pour les réimports)
CREATE POLICY "Service role peut tout faire sur les adhesions"
  ON club_adhesions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
