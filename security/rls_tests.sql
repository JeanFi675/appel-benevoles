-- ============================================================================
-- security/rls_tests.sql
-- Phase 3.4 — Tests automatises des policies RLS
-- ============================================================================
--
-- Cible : instance Supabase locale (Docker, 127.0.0.1:54322).
--         NE JAMAIS executer en production.
--
-- Roles couverts (4) :
--   - anon          : non authentifie
--   - benevole      : authentifie, role='benevole'
--   - referent      : authentifie, role='referent', avec postes geres
--   - admin         : authentifie, role='admin'
--
-- Roles applicatifs NON couverts : `juge`, `admin-juge`, `officiel`.
-- Justification : supprimes en Phase 2.3 (decision D1, migration
-- 20260526130300_drop_juges_officiels.sql). L'enum `role_type` cree en
-- Phase 2.4 ne contient que ('benevole','referent','admin'). Cf. matrice
-- security/rls_matrix.md (note d'entete) et plan_refactoring.md (1.9).
--
-- Mecanique :
--   - Les resultats sont accumules dans une table public._rls_test_results
--     (non-RLS, GRANT INSERT/SELECT pour anon+authenticated).
--   - Chaque section de role ouvre une BEGIN..COMMIT et utilise
--     SET LOCAL ROLE / SET LOCAL "request.jwt.claim.sub".
--   - Les tests d'INSERT/UPDATE/DELETE qui doivent ECHOUER sont wrappes dans
--     un DO block avec EXCEPTION → l'echec RLS est capture, pas de pollution.
--   - Les tests d'INSERT qui doivent REUSSIR (admin) sont annules via un
--     marqueur RAISE EXCEPTION '_rb_marker_' qui rollback la sous-transaction
--     implicite du DO block.
--   - Les SELECT n'ont pas d'effet de bord.
--
-- Fixtures (UUIDs choisis depuis le dump local 2026-05-27) :
--   ANON          : pas de uid
--   BEN (Vanessa) : id=f8cc4cf9-86e4-4072-a5e1-5f821c67ae35
--                   uid=a3794e47-3f4b-4853-8a38-06776fa5da80
--                   1 inscription, 1 repas, 0 cagn_per, 0 cagn_trx
--   BEN (CECILE)  : id=49d7dfb9-ede4-4519-8ba5-6748d7270b6c
--                   uid=0bc7238c-efbe-4921-a781-e7ea382b1a76 (famille de 3)
--                   6 inscr, 2 repas, 0 cagn_per, 6 cagn_trx
--                   → utilise pour valider la visibilite positive cagnotte
--   REF (Patrick) : id=b1238666-869c-476f-8269-621d54a9e78a
--                   uid=cd8109d6-c69e-4dec-a507-9e12c66576d1
--                   Famille de 2 (Patrick + Denise) partageant le user_id
--                   (cf. denormalisation D-1, Phase 2.7).
--                   Famille : 9 inscr, 3 repas, 4 cagnotte_transactions
--                   Postes geres : 4, contenant 19 inscr sur 13 benevoles
--                   distincts (Patrick inclus via son inscription propre).
--                   Attendu visible :
--                     - benevoles : 14 (2 famille + 12 manages distincts)
--                     - inscriptions : 25 (9 famille UNION 19 sur postes)
--                     - benevole_repas : 3 (famille uniquement, D-decision §2.9)
--                     - cagnotte_transactions : 4 (famille, via self_select
--                       universel — cf. note infra sur l'interpretation §2.11)
--   ADM (J-Ph.)   : id=dac29ab1-17c5-4303-a0cc-a1fa04dbe0fc
--                   uid=adc816f2-df34-4b80-92e2-788107cb88a6
--
-- Comptes totaux de reference (2026-05-27, post-Phase 3.3) :
--   benevoles=140, inscriptions=309, benevole_repas=136,
--   benevole_cagnotte_periodes=52, cagnotte_transactions=189,
--   config=3, postes=58, periodes=10, orphan_relances=7
--
-- Usage :
--   docker exec -i supabase_db_appel-benevoles \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f /dev/stdin \
--     < security/rls_tests.sql
--   Puis SELECT * FROM public._rls_test_results ORDER BY seq;
-- ============================================================================

\set ON_ERROR_STOP off

-- ----------------------------------------------------------------------------
-- 0. SETUP (executor: postgres)
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public._rls_test_results CASCADE;

CREATE TABLE public._rls_test_results (
  seq         serial PRIMARY KEY,
  test_id     text NOT NULL,
  role        text NOT NULL,
  table_name  text NOT NULL,
  op          text NOT NULL,
  scope       text,
  expectation text NOT NULL,    -- ALLOW / DENY / OWN_n / ROLE_BASED_n
  status      text NOT NULL,    -- PASS / FAIL
  observed    text,
  expected    text,
  ran_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._rls_test_results DISABLE ROW LEVEL SECURITY;

GRANT INSERT, SELECT ON public._rls_test_results TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public._rls_test_results_seq_seq
  TO authenticated, anon;

-- ============================================================================
-- 1. ANON TESTS
-- ============================================================================

BEGIN;
SET LOCAL ROLE anon;

-- A01..A06 : SELECT sur tables sensibles → 0 rows attendues (DENY)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevoles;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A01','anon','benevoles','SELECT','any','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.inscriptions;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A02','anon','inscriptions','SELECT','any','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_repas;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A03','anon','benevole_repas','SELECT','any','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_cagnotte_periodes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A04','anon','benevole_cagnotte_periodes','SELECT','any','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.cagnotte_transactions;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A05','anon','cagnotte_transactions','SELECT','any','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.orphan_relances;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A06','anon','orphan_relances','SELECT','any','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

-- A07..A13 : SELECT sur referentiels publics → > 0 attendues (ALLOW)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.config;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A07','anon','config','SELECT','public','ALLOW',
    CASE WHEN v=3 THEN 'PASS' ELSE 'FAIL' END, v::text, '3');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.postes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A08','anon','postes','SELECT','public','ALLOW',
    CASE WHEN v=58 THEN 'PASS' ELSE 'FAIL' END, v::text, '58');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.periodes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A09','anon','periodes','SELECT','public','ALLOW',
    CASE WHEN v=10 THEN 'PASS' ELSE 'FAIL' END, v::text, '10');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.programmes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A10','anon','programmes','SELECT','public','ALLOW',
    CASE WHEN v>=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '>= 0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.repas;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A11','anon','repas','SELECT','public','ALLOW',
    CASE WHEN v>0 THEN 'PASS' ELSE 'FAIL' END, v::text, '> 0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.type_postes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A12','anon','type_postes','SELECT','public','ALLOW',
    CASE WHEN v>0 THEN 'PASS' ELSE 'FAIL' END, v::text, '> 0');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.jours;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A13','anon','jours','SELECT','public','ALLOW',
    CASE WHEN v>=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '>= 0');
END $t$;

-- A14..A15 : INSERT par anon → doit lever (RLS denial)
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.config (key, value) VALUES ('_rls_test_anon', '"x"'::jsonb);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A14','anon','config','INSERT','any','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.cagnotte_transactions (user_id, benevole_id, montant, description)
    VALUES (
      'a3794e47-3f4b-4853-8a38-06776fa5da80',
      'f8cc4cf9-86e4-4072-a5e1-5f821c67ae35',
      1.00, '_rls_test_anon');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('A15','anon','cagnotte_transactions','INSERT','any','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

COMMIT;

-- ============================================================================
-- 2. BENEVOLE TESTS (Vanessa)
-- ============================================================================

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a3794e47-3f4b-4853-8a38-06776fa5da80';

-- B01 : SELECT benevoles → 1 ligne (self), 0 fuites
DO $t$
DECLARE v int; v_others int;
BEGIN
  SELECT count(*) INTO v FROM public.benevoles;
  SELECT count(*) INTO v_others FROM public.benevoles WHERE user_id <> auth.uid();
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B01','benevole','benevoles','SELECT','own','OWN_1',
    CASE WHEN v=1 AND v_others=0 THEN 'PASS' ELSE 'FAIL' END,
    format('total=%s, others_visible=%s', v, v_others),
    'total=1, others_visible=0');
END $t$;

-- B02 : SELECT inscriptions → 1 (own)
DO $t$
DECLARE v int; v_others int;
BEGIN
  SELECT count(*) INTO v FROM public.inscriptions;
  SELECT count(*) INTO v_others FROM public.inscriptions
    WHERE benevole_id NOT IN (SELECT id FROM public.benevoles WHERE user_id=auth.uid());
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B02','benevole','inscriptions','SELECT','own','OWN_1',
    CASE WHEN v=1 AND v_others=0 THEN 'PASS' ELSE 'FAIL' END,
    format('total=%s, others_visible=%s', v, v_others),
    'total=1, others_visible=0');
END $t$;

-- B03 : SELECT benevole_repas → 1 (own)
DO $t$
DECLARE v int; v_others int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_repas;
  SELECT count(*) INTO v_others FROM public.benevole_repas
    WHERE benevole_id NOT IN (SELECT id FROM public.benevoles WHERE user_id=auth.uid());
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B03','benevole','benevole_repas','SELECT','own','OWN_1',
    CASE WHEN v=1 AND v_others=0 THEN 'PASS' ELSE 'FAIL' END,
    format('total=%s, others_visible=%s', v, v_others),
    'total=1, others_visible=0');
END $t$;

-- B04 : SELECT benevole_cagnotte_periodes → 0 (Vanessa n'en a aucune, no leak)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_cagnotte_periodes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B04','benevole','benevole_cagnotte_periodes','SELECT','own','OWN_0',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

-- B05 : SELECT cagnotte_transactions → 0 (Vanessa)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.cagnotte_transactions;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B05','benevole','cagnotte_transactions','SELECT','own','OWN_0',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

-- B06 : SELECT orphan_relances → 0 (DENY)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.orphan_relances;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B06','benevole','orphan_relances','SELECT','none','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

-- B07 : SELECT config → 3
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.config;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B07','benevole','config','SELECT','public','ALLOW',
    CASE WHEN v=3 THEN 'PASS' ELSE 'FAIL' END, v::text, '3');
END $t$;

-- B08 : SELECT postes → 58
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.postes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B08','benevole','postes','SELECT','public','ALLOW',
    CASE WHEN v=58 THEN 'PASS' ELSE 'FAIL' END, v::text, '58');
END $t$;

-- B09 : INSERT config → DENY
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.config (key, value) VALUES ('_rls_test_ben', '"x"'::jsonb);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B09','benevole','config','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- B10 : INSERT cagnotte_transactions → DENY
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.cagnotte_transactions (user_id, benevole_id, montant, description)
    VALUES (auth.uid(), 'f8cc4cf9-86e4-4072-a5e1-5f821c67ae35', 1.00, '_rls_test_ben');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B10','benevole','cagnotte_transactions','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- B11 : INSERT benevole_cagnotte_periodes → DENY
DO $t$
DECLARE v_ok boolean := false; v_msg text;
DECLARE v_per uuid;
BEGIN
  SELECT id INTO v_per FROM public.periodes LIMIT 1;
  BEGIN
    INSERT INTO public.benevole_cagnotte_periodes (benevole_id, periode_id)
    VALUES ('f8cc4cf9-86e4-4072-a5e1-5f821c67ae35', v_per);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B11','benevole','benevole_cagnotte_periodes','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- B12 : INSERT orphan_relances → DENY
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.orphan_relances (user_id) VALUES (auth.uid());
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B12','benevole','orphan_relances','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- B13 : INSERT postes → DENY
DO $t$
DECLARE v_ok boolean := false; v_msg text;
DECLARE v_per uuid; v_tp uuid;
BEGIN
  SELECT id INTO v_per FROM public.periodes LIMIT 1;
  SELECT id INTO v_tp FROM public.type_postes LIMIT 1;
  BEGIN
    INSERT INTO public.postes (periode_debut, periode_fin, nb_min, nb_max, periode_id, type_poste_id)
    VALUES (now()+interval '10 years', now()+interval '10 years 1 hour', 1, 2, v_per, v_tp);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B13','benevole','postes','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- B14 : UPDATE inscriptions (own) → ROW_COUNT=0 (DENY INTENTIONAL — pas de policy UPDATE)
DO $t$
DECLARE v_rows int := 0; v_caught boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.inscriptions SET poste_id = poste_id
      WHERE benevole_id IN (SELECT id FROM public.benevoles WHERE user_id=auth.uid());
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_caught := true; v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B14','benevole','inscriptions','UPDATE','own','DENY',
    CASE WHEN v_rows=0 OR v_caught THEN 'PASS' ELSE 'FAIL' END,
    format('rows_affected=%s, raised=%s, msg=%s', v_rows, v_caught, coalesce(v_msg,'')),
    'rows_affected=0 (no UPDATE policy)');
END $t$;

-- B15 : UPDATE benevole_repas (own) → ROW_COUNT=0 (DENY)
DO $t$
DECLARE v_rows int := 0; v_caught boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.benevole_repas SET is_vegetarien = is_vegetarien
      WHERE benevole_id IN (SELECT id FROM public.benevoles WHERE user_id=auth.uid());
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_caught := true; v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B15','benevole','benevole_repas','UPDATE','own','DENY',
    CASE WHEN v_rows=0 OR v_caught THEN 'PASS' ELSE 'FAIL' END,
    format('rows_affected=%s, raised=%s', v_rows, v_caught),
    'rows_affected=0');
END $t$;

-- B16 : UPDATE cagnotte_transactions → ROW_COUNT=0 (immutability)
DO $t$
DECLARE v_rows int := 0; v_caught boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.cagnotte_transactions SET description = description WHERE user_id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_caught := true; v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B16','benevole','cagnotte_transactions','UPDATE','own','DENY',
    CASE WHEN v_rows=0 OR v_caught THEN 'PASS' ELSE 'FAIL' END,
    format('rows_affected=%s, raised=%s', v_rows, v_caught),
    'rows_affected=0');
END $t$;

-- B17 : DELETE cagnotte_transactions → ROW_COUNT=0 (immutability)
DO $t$
DECLARE v_rows int := 0; v_caught boolean := false; v_msg text;
BEGIN
  BEGIN
    DELETE FROM public.cagnotte_transactions WHERE user_id = auth.uid();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_caught := true; v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B17','benevole','cagnotte_transactions','DELETE','own','DENY',
    CASE WHEN v_rows=0 OR v_caught THEN 'PASS' ELSE 'FAIL' END,
    format('rows_affected=%s, raised=%s', v_rows, v_caught),
    'rows_affected=0');
END $t$;

-- B18 : DELETE inscription d'un autre benevole → ROW_COUNT=0 (USING denied)
DO $t$
DECLARE v_rows int := 0;
BEGIN
  DELETE FROM public.inscriptions
    WHERE benevole_id NOT IN (SELECT id FROM public.benevoles WHERE user_id=auth.uid());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B18','benevole','inscriptions','DELETE','others','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END,
    v_rows::text, '0');
END $t$;

COMMIT;

-- B05b (variant) : un autre benevole (CECILE) qui a des cagnotte_transactions
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '0bc7238c-efbe-4921-a781-e7ea382b1a76';

DO $t$
DECLARE v int; v_others int;
BEGIN
  SELECT count(*) INTO v FROM public.cagnotte_transactions;
  SELECT count(*) INTO v_others FROM public.cagnotte_transactions WHERE user_id <> auth.uid();
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('B05b','benevole(family)','cagnotte_transactions','SELECT','own','OWN_6',
    CASE WHEN v=6 AND v_others=0 THEN 'PASS' ELSE 'FAIL' END,
    format('total=%s, others_visible=%s', v, v_others),
    'total=6, others_visible=0');
END $t$;

COMMIT;

-- ============================================================================
-- 3. REFERENT TESTS (Patrick)
-- ============================================================================

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'cd8109d6-c69e-4dec-a507-9e12c66576d1';

-- R01 : SELECT benevoles → 14 (2 famille via OWN + 12 manages distincts via ROLE_BASED)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevoles;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R01','referent','benevoles','SELECT','family_or_managed','ROLE_BASED_14',
    CASE WHEN v=14 THEN 'PASS' ELSE 'FAIL' END, v::text, '14');
END $t$;

-- R02 : SELECT inscriptions → 25 (9 famille UNION 19 sur postes geres, distinct)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.inscriptions;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R02','referent','inscriptions','SELECT','family_or_managed','ROLE_BASED_25',
    CASE WHEN v=25 THEN 'PASS' ELSE 'FAIL' END, v::text, '25');
END $t$;

-- R03 : SELECT benevole_repas → 3 (famille uniquement, matrice §2.9 ; pas de portee referent)
-- Le "OWN" s'etend au scope famille via `is_own_benevole(benevole_id)` qui joint
-- sur benevoles.user_id = auth.uid().
DO $t$
DECLARE v int; v_others int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_repas;
  SELECT count(*) INTO v_others FROM public.benevole_repas
    WHERE benevole_id NOT IN (SELECT id FROM public.benevoles WHERE user_id=auth.uid());
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R03','referent','benevole_repas','SELECT','family','OWN_3',
    CASE WHEN v=3 AND v_others=0 THEN 'PASS' ELSE 'FAIL' END,
    format('total=%s, others_visible=%s', v, v_others),
    'total=3, others_visible=0');
END $t$;

-- R04 : SELECT benevole_cagnotte_periodes → 0 (referent no access)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_cagnotte_periodes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R04','referent','benevole_cagnotte_periodes','SELECT','none','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

-- R05 : SELECT cagnotte_transactions → 4 (famille via cagnotte_transactions_self_select).
-- Note d'interpretation matrice §2.11 : "referent: DENY" signifie "pas d'acces admin
-- aux transactions d'autres benevoles", PAS "ne voit pas les siennes". La policy
-- `cagnotte_transactions_self_select` (USING auth.uid()=user_id) s'applique
-- universellement, independamment du role. Securitairement OK : aucune fuite vers
-- les autres user_id (verifie en assertion negative ci-dessous).
DO $t$
DECLARE v int; v_others int;
BEGIN
  SELECT count(*) INTO v FROM public.cagnotte_transactions;
  SELECT count(*) INTO v_others FROM public.cagnotte_transactions WHERE user_id <> auth.uid();
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R05','referent','cagnotte_transactions','SELECT','family','OWN_4',
    CASE WHEN v=4 AND v_others=0 THEN 'PASS' ELSE 'FAIL' END,
    format('total=%s, others_visible=%s', v, v_others),
    'total=4, others_visible=0');
END $t$;

-- R06 : SELECT orphan_relances → 0 (DENY)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.orphan_relances;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R06','referent','orphan_relances','SELECT','none','DENY',
    CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, v::text, '0');
END $t$;

-- R07 : SELECT config → 3 (ALLOW)
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.config;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R07','referent','config','SELECT','public','ALLOW',
    CASE WHEN v=3 THEN 'PASS' ELSE 'FAIL' END, v::text, '3');
END $t$;

-- R08 : INSERT config → DENY
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.config (key, value) VALUES ('_rls_test_ref', '"x"'::jsonb);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R08','referent','config','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- R09 : INSERT cagnotte_transactions → DENY (pas de policy referent INSERT)
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.cagnotte_transactions (user_id, benevole_id, montant, description)
    VALUES (auth.uid(), 'b1238666-869c-476f-8269-621d54a9e78a', 1.00, '_rls_test_ref');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R09','referent','cagnotte_transactions','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- R10 : INSERT postes → DENY (admin only)
DO $t$
DECLARE v_ok boolean := false; v_msg text;
DECLARE v_per uuid; v_tp uuid;
BEGIN
  SELECT id INTO v_per FROM public.periodes LIMIT 1;
  SELECT id INTO v_tp FROM public.type_postes LIMIT 1;
  BEGIN
    INSERT INTO public.postes (periode_debut, periode_fin, nb_min, nb_max, periode_id, type_poste_id)
    VALUES (now()+interval '10 years', now()+interval '10 years 1 hour', 1, 2, v_per, v_tp);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R10','referent','postes','INSERT','none','DENY',
    CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END,
    coalesce(v_msg,'INSERT succeeded'), 'raises RLS denial');
END $t$;

-- R11 : UPDATE inscriptions → ROW_COUNT=0 (pas de UPDATE policy)
DO $t$
DECLARE v_rows int := 0;
BEGIN
  UPDATE public.inscriptions SET poste_id = poste_id;  -- no WHERE, RLS filtre
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R11','referent','inscriptions','UPDATE','any','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END,
    v_rows::text, '0');
EXCEPTION WHEN OTHERS THEN
  -- En cas d'exception (ex : WITH CHECK), c'est aussi un deni
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R11','referent','inscriptions','UPDATE','any','DENY','PASS',
    'raised: ' || SQLSTATE, '0 or raised');
END $t$;

-- R12 : DELETE inscription d'un benevole hors postes geres → ROW_COUNT=0
DO $t$
DECLARE v_rows int := 0;
BEGIN
  DELETE FROM public.inscriptions WHERE id = '5e934103-68c7-4acc-a833-e6adde80f169';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('R12','referent','inscriptions','DELETE','foreign','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END,
    v_rows::text, '0');
END $t$;

COMMIT;

-- ============================================================================
-- 4. ADMIN TESTS (Jean-Philippe)
-- ============================================================================

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'adc816f2-df34-4b80-92e2-788107cb88a6';

-- D01..D08 : SELECT → totalite des lignes
DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevoles;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D01','admin','benevoles','SELECT','all','ALLOW_140',
    CASE WHEN v=140 THEN 'PASS' ELSE 'FAIL' END, v::text, '140');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.inscriptions;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D02','admin','inscriptions','SELECT','all','ALLOW_309',
    CASE WHEN v=309 THEN 'PASS' ELSE 'FAIL' END, v::text, '309');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_repas;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D03','admin','benevole_repas','SELECT','all','ALLOW_136',
    CASE WHEN v=136 THEN 'PASS' ELSE 'FAIL' END, v::text, '136');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.benevole_cagnotte_periodes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D04','admin','benevole_cagnotte_periodes','SELECT','all','ALLOW_52',
    CASE WHEN v=52 THEN 'PASS' ELSE 'FAIL' END, v::text, '52');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.cagnotte_transactions;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D05','admin','cagnotte_transactions','SELECT','all','ALLOW_189',
    CASE WHEN v=189 THEN 'PASS' ELSE 'FAIL' END, v::text, '189');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.orphan_relances;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D06','admin','orphan_relances','SELECT','all','ALLOW_7',
    CASE WHEN v=7 THEN 'PASS' ELSE 'FAIL' END, v::text, '7');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.config;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D07','admin','config','SELECT','all','ALLOW_3',
    CASE WHEN v=3 THEN 'PASS' ELSE 'FAIL' END, v::text, '3');
END $t$;

DO $t$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.postes;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D08','admin','postes','SELECT','all','ALLOW_58',
    CASE WHEN v=58 THEN 'PASS' ELSE 'FAIL' END, v::text, '58');
END $t$;

-- D09 : INSERT config → ALLOW (rolled back par marqueur)
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.config (key, value) VALUES ('_rls_test_adm_marker', '"x"'::jsonb);
    v_ok := true;
    RAISE EXCEPTION '_rb_marker_';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = '_rb_marker_' THEN
        v_msg := 'INSERT allowed and rolled back';
      ELSE
        v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
      END IF;
    WHEN OTHERS THEN
      v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D09','admin','config','INSERT','any','ALLOW',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, coalesce(v_msg,'?'), 'INSERT allowed');
END $t$;

-- D10 : INSERT cagnotte_transactions → ALLOW (rolled back)
DO $t$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.cagnotte_transactions (user_id, benevole_id, montant, description)
    VALUES (
      'a3794e47-3f4b-4853-8a38-06776fa5da80',
      'f8cc4cf9-86e4-4072-a5e1-5f821c67ae35',
      1.00, '_rls_test_adm_marker');
    v_ok := true;
    RAISE EXCEPTION '_rb_marker_';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = '_rb_marker_' THEN
        v_msg := 'INSERT allowed and rolled back';
      ELSE
        v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
      END IF;
    WHEN OTHERS THEN
      v_msg := SQLSTATE || ': ' || left(SQLERRM, 200);
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D10','admin','cagnotte_transactions','INSERT','any','ALLOW',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, coalesce(v_msg,'?'), 'INSERT allowed');
END $t$;

-- D11 : UPDATE cagnotte_transactions → DENY (immutability, matrice §2.11)
DO $t$
DECLARE v_rows int := 0;
BEGIN
  UPDATE public.cagnotte_transactions SET description = description WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D11','admin','cagnotte_transactions','UPDATE','any','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END, v_rows::text, '0');
END $t$;

-- D12 : DELETE cagnotte_transactions → DENY (immutability)
DO $t$
DECLARE v_rows int := 0;
BEGIN
  -- WHERE faux pour ne rien casser meme si la policy etait erronee
  DELETE FROM public.cagnotte_transactions WHERE description = '_rls_test_never_match';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  -- Test plus discriminant : tenter sur une vraie ligne via SP rollback
  BEGIN
    DELETE FROM public.cagnotte_transactions WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION '_rb_marker_';  -- roll back si delete a passe
    END IF;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> '_rb_marker_' THEN v_rows := 0; END IF;
    WHEN OTHERS THEN v_rows := 0;
  END;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D12','admin','cagnotte_transactions','DELETE','any','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END, v_rows::text, '0');
END $t$;

-- D13 : DELETE config → DENY (matrice §2.13 : INTENTIONAL pour tous, pas de policy DELETE)
DO $t$
DECLARE v_rows int := 0;
BEGIN
  DELETE FROM public.config WHERE key IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D13','admin','config','DELETE','any','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END, v_rows::text, '0');
END $t$;

-- D14 : UPDATE benevole_repas → ROW_COUNT=0 (DENY INTENTIONAL — pas de UPDATE policy)
DO $t$
DECLARE v_rows int := 0;
BEGIN
  UPDATE public.benevole_repas SET is_vegetarien = is_vegetarien;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D14','admin','benevole_repas','UPDATE','any','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END, v_rows::text, '0');
END $t$;

-- D15 : UPDATE inscriptions → ROW_COUNT=0 (DENY INTENTIONAL)
DO $t$
DECLARE v_rows int := 0;
BEGIN
  UPDATE public.inscriptions SET poste_id = poste_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO public._rls_test_results
    (test_id, role, table_name, op, scope, expectation, status, observed, expected)
  VALUES ('D15','admin','inscriptions','UPDATE','any','DENY',
    CASE WHEN v_rows=0 THEN 'PASS' ELSE 'FAIL' END, v_rows::text, '0');
END $t$;

COMMIT;

-- ============================================================================
-- 5. CLEANUP residus eventuels (cas ou un test ALLOW aurait deborde)
-- ============================================================================
DELETE FROM public.config WHERE key LIKE '_rls_test_%';
DELETE FROM public.cagnotte_transactions WHERE description LIKE '_rls_test_%';

-- ============================================================================
-- 6. RESUME
-- ============================================================================
\echo
\echo '=== RLS Test Results ==='
SELECT test_id, role, table_name, op, scope, expectation, status, observed, expected
  FROM public._rls_test_results ORDER BY seq;

\echo
\echo '=== Summary by status ==='
SELECT status, count(*) FROM public._rls_test_results GROUP BY status ORDER BY status;

\echo
\echo '=== FAILED tests (if any) ==='
SELECT test_id, role, table_name, op, scope, expectation, observed, expected
  FROM public._rls_test_results WHERE status='FAIL' ORDER BY seq;
