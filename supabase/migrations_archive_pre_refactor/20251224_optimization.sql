-- Optimization: Add missing indexes on foreign keys
CREATE INDEX IF NOT EXISTS idx_benevoles_user_id ON public.benevoles(user_id);
CREATE INDEX IF NOT EXISTS idx_cagnotte_transactions_auteur_id ON public.cagnotte_transactions(auteur_id);
CREATE INDEX IF NOT EXISTS idx_config_updated_by ON public.config(updated_by);

-- Security: Remove redundant RLS policy
-- "Suppression de ses bénévoles" is redundant with "Users can delete own profiles"
DROP POLICY IF EXISTS "Suppression de ses bénévoles" ON public.benevoles;
