-- Migration: add telephone to orphan_relances + update RPC + safe upsert function

-- Make relance_sent_at nullable (phone can be saved before any relance is sent)
ALTER TABLE orphan_relances ALTER COLUMN relance_sent_at DROP NOT NULL;
ALTER TABLE orphan_relances ALTER COLUMN relance_sent_at DROP DEFAULT;

-- Add telephone column
ALTER TABLE orphan_relances ADD COLUMN IF NOT EXISTS telephone TEXT;

-- Recreate RPC to also return telephone
DROP FUNCTION IF EXISTS get_auth_users_without_benevole();
CREATE OR REPLACE FUNCTION get_auth_users_without_benevole()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  relance_sent_at TIMESTAMPTZ,
  telephone TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    r.relance_sent_at,
    r.telephone
  FROM auth.users u
  LEFT JOIN benevoles b ON b.user_id = u.id
  LEFT JOIN orphan_relances r ON r.auth_user_id = u.id
  WHERE b.id IS NULL
  ORDER BY u.created_at DESC;
$$;

-- RPC to save phone for an orphelin without touching relance_sent_at
CREATE OR REPLACE FUNCTION save_orphelin_phone(p_auth_user_id UUID, p_telephone TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM benevoles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  INSERT INTO orphan_relances (auth_user_id, telephone)
  VALUES (p_auth_user_id, p_telephone)
  ON CONFLICT (auth_user_id) DO UPDATE SET telephone = EXCLUDED.telephone;
END;
$$;

GRANT EXECUTE ON FUNCTION save_orphelin_phone TO authenticated;
