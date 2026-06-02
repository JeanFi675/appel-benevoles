-- ============================================================================
-- MIGRATION: Add admin-juge role and specific permissions
-- ============================================================================

-- 1. Ajouter le rôle 'admin-juge' et mettre à jour la contrainte existante
ALTER TABLE benevoles DROP CONSTRAINT IF EXISTS benevoles_role_check;
ALTER TABLE benevoles ADD CONSTRAINT benevoles_role_check CHECK (role IN ('benevole', 'referent', 'admin', 'juge', 'admin-juge'));

-- 2. Ajouter les politiques RLS pour admin-juge sur la table benevoles
-- Un admin-juge peut voir tous les profils (pour pouvoir lister ou rechercher)
CREATE POLICY "Admin-juges can view all benevoles" ON public.benevoles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM benevoles b
      WHERE b.user_id = auth.uid() AND b.role = 'admin-juge'
    )
  );

-- Un admin-juge peut mettre à jour UNIQUEMENT les profils ayant le rôle 'juge'
CREATE POLICY "Admin-juges can update juges" ON public.benevoles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM benevoles b
      WHERE b.user_id = auth.uid() AND b.role = 'admin-juge'
    ) AND role = 'juge'
  );

-- 3. Ajouter la politique RLS pour admin-juge sur la table config
-- Un admin-juge peut modifier UNIQUEMENT la configuration 'tarif_degaines_juge'
CREATE POLICY "Admin-juges can update tarif_degaines_juge" ON public.config
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM benevoles b
      WHERE b.user_id = auth.uid() AND b.role = 'admin-juge'
    ) AND key = 'tarif_degaines_juge'
  );
