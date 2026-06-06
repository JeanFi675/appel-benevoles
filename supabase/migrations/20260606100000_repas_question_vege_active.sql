-- Migration: option « poser la question végétarien » configurable par repas
--
-- Purpose:
--   Jusqu'ici, chaque repas proposé aux bénévoles affichait systématiquement
--   la case « 🥬 Repas Végétarien » dans le wizard d'inscription. On rend ce
--   comportement configurable repas par repas via une nouvelle colonne booléenne
--   public.repas.question_vege_active.
--
--   Quand question_vege_active = false, le frontend masque la case végé pour ce
--   repas (les bénévoles ne peuvent plus se déclarer végétariens dessus). La
--   valeur par défaut est `true` pour préserver le comportement existant sur les
--   repas déjà créés.
--
-- Impact RLS : aucun. Les policies de `repas` portent sur les lignes, pas sur
--   les colonnes ; la nouvelle colonne hérite des policies existantes
--   (lecture publique, modification admin).
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE public.repas
  ADD COLUMN IF NOT EXISTS question_vege_active boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN public.repas.question_vege_active IS
  'Si true, le wizard affiche la case « Repas Végétarien » pour ce repas. Si false, la question végé est masquée (is_vegetarien reste false).';

COMMIT;
