-- Migration: table orphan_relances + RPC get_auth_users_without_benevole avec relance_sent_at

-- Table pour tracker les relances envoyées aux comptes orphelins
CREATE TABLE IF NOT EXISTS orphan_relances (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  relance_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS : seuls les admins peuvent lire/écrire
ALTER TABLE orphan_relances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage orphan_relances" ON orphan_relances;
CREATE POLICY "Admins can manage orphan_relances"
  ON orphan_relances
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM benevoles WHERE benevoles.user_id = auth.uid() AND benevoles.role = 'admin'
    )
  );

-- RPC : retourne les utilisateurs auth sans profil bénévole, avec relance_sent_at
DROP FUNCTION IF EXISTS get_auth_users_without_benevole();
CREATE OR REPLACE FUNCTION get_auth_users_without_benevole()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  relance_sent_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    r.relance_sent_at
  FROM auth.users u
  LEFT JOIN benevoles b ON b.user_id = u.id
  LEFT JOIN orphan_relances r ON r.auth_user_id = u.id
  WHERE b.id IS NULL
  ORDER BY u.created_at DESC;
$$;
