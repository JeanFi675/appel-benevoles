-- Migration: CHECK pattern email et telephone
-- Phase: 2.4 (Typages - finalisation apres citext + backfill)
-- Anomalie: B06
--
-- Prerequis :
--   - 20260526130000_backfill_telephone_inconnu.sql (sentinelle 'INCONNU' tolérée)
--   - 20260526140000_enable_citext_convert_email.sql (email -> citext)
--
-- Patterns valides en local (verifies sur dump prod 2026-05-25) :
--   - email   : ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$    (0 violation)
--   - telephone : 'INCONNU' OR ^[+0-9 ().-]{6,}$                    (0 violation)

ALTER TABLE public.benevoles
  ADD CONSTRAINT benevoles_email_format_chk
  CHECK (email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

ALTER TABLE public.benevoles
  ADD CONSTRAINT benevoles_telephone_format_chk
  CHECK (telephone = 'INCONNU' OR telephone ~ '^[+0-9 ().-]{6,}$');
