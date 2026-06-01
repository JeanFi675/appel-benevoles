-- Migration: ajout des index manquants (FK + colonnes filtrées)
-- Phase: 2.5 (Index)
-- Anomalies: M02 (5 FK sans index) + M04 (2 colonnes filtrées)
-- Source: audit/14_indexes.md (synthèses 1.7.1 et 1.7.2)
--
-- Notes:
--   - Aucun CONCURRENTLY : exécution dans une transaction de migration.
--     Pour le déploiement prod en Phase 8.1, ré-évaluer la nécessité d'un
--     CREATE INDEX CONCURRENTLY hors transaction (volumétrie actuelle faible
--     → blocage négligeable).
--   - `benevoles.email` est de type `citext` depuis la migration
--     20260526140000_enable_citext_convert_email.sql : l'index B-tree est
--     nativement compatible et bénéficie automatiquement de la
--     case-insensitivity.

-- ===========================================================================
-- M02 — Index sur FK sans couverture (1.7.1)
-- ===========================================================================

-- #2 audit : benevole_cagnotte_periodes.periode_id (2ᵉ colonne de la PK composite)
CREATE INDEX IF NOT EXISTS idx_benevole_cagnotte_periodes_periode_id
  ON public.benevole_cagnotte_periodes (periode_id);

-- #4 audit : benevole_repas.repas_id (2ᵉ colonne de la PK composite)
CREATE INDEX IF NOT EXISTS idx_benevole_repas_repas_id
  ON public.benevole_repas (repas_id);

-- #13 audit : postes.periode_id (à distinguer de idx_postes_periode sur la plage horaire)
CREATE INDEX IF NOT EXISTS idx_postes_periode_id
  ON public.postes (periode_id);

-- #14 audit : postes.referent_id
CREATE INDEX IF NOT EXISTS idx_postes_referent_id
  ON public.postes (referent_id);

-- #15 audit : postes.type_poste_id
CREATE INDEX IF NOT EXISTS idx_postes_type_poste_id
  ON public.postes (type_poste_id);

-- ===========================================================================
-- M04 — Index sur colonnes filtrées par le front (1.7.2)
-- ===========================================================================

-- benevoles.email : ORDER BY email côté admin
CREATE INDEX IF NOT EXISTS idx_benevoles_email
  ON public.benevoles (email);

-- programme.date_ref : DELETE WHERE date_ref = ? (suppression d'un jour)
CREATE INDEX IF NOT EXISTS idx_programme_date_ref
  ON public.programme (date_ref);
