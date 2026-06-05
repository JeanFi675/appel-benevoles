-- Migration: ajout des clés de configuration "identité de l'évènement"
--
-- Purpose:
--   Le projet devient générique (réutilisable pour n'importe quel évènement
--   nécessitant des bénévoles, plus seulement le championnat d'escalade). On
--   introduit deux clés dans la table `config` :
--     - event_title   : titre de l'évènement (affiché dans le header public,
--                        le <title> des pages, et — à terme — les emails).
--     - event_address : adresse / lieu de l'évènement (stocké ; affichage
--                        emails prévu dans un second temps).
--
--   Les deux valeurs sont des chaînes JSON (la colonne value est jsonb). Elles
--   sont semées vides : le frontend applique un repli « Appel aux Bénévoles »
--   tant que le titre n'est pas renseigné par un admin via la page d'admin.
--
--   RLS : la table config est déjà SELECT public / INSERT-UPDATE admin
--   (cf. 20260527110100_rls_policies.sql §3.13). Aucune policy à ajouter.
--
-- Idempotent : ON CONFLICT (key) DO NOTHING — ne réécrit jamais une valeur déjà
--   saisie en prod.

BEGIN;

INSERT INTO public.config (key, value)
VALUES
  ('event_title', '""'::jsonb),
  ('event_address', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
