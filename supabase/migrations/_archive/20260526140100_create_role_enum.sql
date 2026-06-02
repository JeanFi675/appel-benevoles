-- Migration: text -> enum role_type (3 valeurs apres D1)
-- Phase: 2.4 (Typages)
-- Anomalie: M07
-- Decision mainteneur D1 : 3 roles (benevole, referent, admin).
--
-- Prerequis : 20260526130300_drop_juges_officiels.sql.
--
-- 10 policies RLS referencent benevoles.role -> drop + recreate avec le nouveau type.
-- Note : Phase 3.3 reecrit l'ensemble des policies (matrice RLS). Ici on
-- preserve l'existant a l'identique en utilisant le cast implicite text -> enum.

CREATE TYPE public.role_type AS ENUM ('benevole', 'referent', 'admin');

-- Drop view dependant
DROP VIEW IF EXISTS public.admin_benevoles;

-- Drop policies dependant de benevoles.role
DROP POLICY IF EXISTS "Admins can delete inscriptions" ON public.inscriptions;
DROP POLICY IF EXISTS "Admins can insert inscriptions" ON public.inscriptions;
DROP POLICY IF EXISTS "Admins can view inscriptions" ON public.inscriptions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.cagnotte_transactions;
DROP POLICY IF EXISTS "Lecture de ses transactions" ON public.cagnotte_transactions;
DROP POLICY IF EXISTS "Admins can manage orphan_relances" ON public.orphan_relances;
DROP POLICY IF EXISTS "Modification de benevole_cagnotte_periodes par les admins" ON public.benevole_cagnotte_periodes;
DROP POLICY IF EXISTS "Modification des jours par les admins" ON public.jours;
DROP POLICY IF EXISTS "Modification des repas par les admins" ON public.repas;
DROP POLICY IF EXISTS "Modification des types de postes par les admins" ON public.type_postes;

-- Drop CHECK redondant
ALTER TABLE public.benevoles DROP CONSTRAINT IF EXISTS benevoles_role_check;

-- Conversion type
ALTER TABLE public.benevoles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.benevoles
  ALTER COLUMN role TYPE public.role_type
  USING role::public.role_type;
ALTER TABLE public.benevoles
  ALTER COLUMN role SET DEFAULT 'benevole'::public.role_type;

-- Recreate policies (comportement identique - cast implicite text -> role_type sur 'admin')
CREATE POLICY "Admins can delete inscriptions"
  ON public.inscriptions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = (SELECT auth.uid())
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Admins can insert inscriptions"
  ON public.inscriptions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = (SELECT auth.uid())
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Admins can view inscriptions"
  ON public.inscriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = (SELECT auth.uid())
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Admins can insert transactions"
  ON public.cagnotte_transactions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = (SELECT auth.uid())
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Lecture de ses transactions"
  ON public.cagnotte_transactions FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.benevoles
      WHERE benevoles.user_id = (SELECT auth.uid())
        AND benevoles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage orphan_relances"
  ON public.orphan_relances FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = auth.uid()
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Modification de benevole_cagnotte_periodes par les admins"
  ON public.benevole_cagnotte_periodes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = auth.uid()
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Modification des jours par les admins"
  ON public.jours FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = auth.uid()
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Modification des repas par les admins"
  ON public.repas FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = auth.uid()
      AND benevoles.role = 'admin'
  ));

CREATE POLICY "Modification des types de postes par les admins"
  ON public.type_postes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.benevoles
    WHERE benevoles.user_id = auth.uid()
      AND benevoles.role = 'admin'
  ));

-- Recreate view
CREATE VIEW public.admin_benevoles AS
SELECT
  b.id,
  b.user_id,
  b.email,
  b.prenom,
  b.nom,
  b.telephone,
  b.taille_tshirt,
  b.role,
  b.created_at,
  b.updated_at,
  b.relance_sent_at,
  b.cagnotte_forcee,
  b.cagnotte_forcee_type,
  b.cagnotte_forcee_jours,
  COALESCE(
    (SELECT jsonb_agg(bcp.periode_id)
       FROM public.benevole_cagnotte_periodes bcp
       WHERE bcp.benevole_id = b.id),
    '[]'::jsonb
  ) AS cagnotte_forcee_periodes_ids,
  COUNT(DISTINCT i.id) AS nb_inscriptions,
  COUNT(DISTINCT p.id) AS nb_postes_referent,
  COALESCE(
    (SELECT jsonb_agg(
              jsonb_build_object(
                'repas_id', br.repas_id,
                'nom', r.nom,
                'vegetarien', br.vegetarien
              )
              ORDER BY r.created_at
            )
       FROM public.benevole_repas br
       JOIN public.repas r ON br.repas_id = r.id
       WHERE br.benevole_id = b.id),
    '[]'::jsonb
  ) AS repas
FROM public.benevoles b
LEFT JOIN public.inscriptions i ON b.id = i.benevole_id
LEFT JOIN public.postes p ON b.id = p.referent_id
GROUP BY b.id;
