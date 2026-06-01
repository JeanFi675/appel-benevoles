# Tests RLS — résultats

> Phase 1.9 — exécution sur instance Supabase locale (dump prod 2026-05-25).
> Script reproductible : `audit/_rls_tests.sql` (exécuter : `docker exec -i supabase_db_appel-benevoles psql -U postgres -d postgres < audit/_rls_tests.sql`).
> Sortie brute archivée dans `audit/_rls_results.txt`.
> Date d'exécution : 2026-05-26.

## Utilisateurs de test

| Rôle | benevole.id | user_id (auth) |
|------|-------------|----------------|
| admin | `08f3b69a-632f-4075-9f6e-29915db13408` | `afae04f3-f4ad-4f3e-86b3-25fafe4b9107` |
| admin-juge | `19892fa7-6521-499c-be63-562093e42907` | `e7162c02-1d47-4c9c-9cbc-3b0dff6c2c33` |
| referent | `27dc31a8-fbf7-40f1-a56c-c147c3726b74` | `8867fd8f-5f7c-43ce-8058-d23b5e4bd8c9` |
| benevole | `001786ee-fd1f-4c74-9ed5-1482d34afeca` | `8088da7b-df28-4b0f-924b-d566f4fd7240` |

Rôles `juge` (0 utilisateurs) et `officiel` (0 utilisateurs) absents du dump prod actuel → non testables sans création de fixture. À couvrir en Phase 3.4 (tests RLS exhaustifs).

## Mécanique des tests

Chaque test est exécuté dans une transaction (`BEGIN`/`ROLLBACK`) avec :
```sql
SET LOCAL ROLE authenticated;                   -- ou anon
SET LOCAL request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
```
`auth.uid()` lit `request.jwt.claims->>'sub'`. La transaction garantit que `SET LOCAL` est effectif (sinon avertissement et fallback session, qui invalide le test).

## Résultats

| # | Scénario | Attendu | Observé | Statut |
|---|----------|---------|---------|--------|
| T01 | anon → `SELECT count(*) FROM benevoles` | 0 | 0 | ✅ PASS |
| T02 | anon → `SELECT count(*) FROM inscriptions` | 0 (souhaité) — observe 309 = LEAK | 309 | ❌ FAIL (cf. R02) |
| T03 | anon → `SELECT count(*) FROM benevole_repas` | 0 (souhaité) — observe 136 = LEAK | 136 | ❌ FAIL (cf. R03) |
| T04 | anon → `SELECT count(*) FROM benevole_cagnotte_periodes` | à requalifier | 52 | ⚠ FAIL conditionnel (cf. R08) |
| T05 | anon → `SELECT count(*) FROM cagnotte_transactions` | 0 | 0 | ✅ PASS |
| T06 | anon → `INSERT INTO benevoles` | BLOCKED | BLOCKED (`row-level security policy`) | ✅ PASS |
| T07 | anon → `UPDATE config WHERE key='cagnotte_active'` | 0 rows | 0 rows | ✅ PASS |
| T08bis | anon → `INSERT INTO mentions` (enum corrigé `web`) | BLOCKED (souhaité) — observe PASS = HOLE | PASS | ❌ FAIL (cf. R01) |
| T09 | benevole → `SELECT count(*) FROM benevoles` | 1 (own) | 1, uid = `8088da7b…` | ✅ PASS |
| T10 | benevole → `SELECT count(*) FROM inscriptions` | restreint (souhaité) — observe 309 = LEAK | 309 | ❌ FAIL (cf. R02) |
| T11 | benevole → INSERT inscription pour un AUTRE benevole | BLOCKED | BLOCKED | ✅ PASS |
| T12 | benevole → UPDATE periodes | 0 rows | 0 rows | ✅ PASS |
| T13 | benevole → INSERT cagnotte_transactions | BLOCKED | BLOCKED | ✅ PASS |
| T14 | admin → `SELECT count(*) FROM benevoles` | 140 | 140 | ✅ PASS |
| T15 | admin → UPDATE periodes | > 0 | 10 | ✅ PASS |
| T16 | referent → `SELECT count(*) FROM benevoles` | > 1 (own + managed) | 4 | ✅ PASS |
| T17 | admin-juge → UPDATE `config WHERE key='tarif_degaines_juge'` | 1 | 1 | ✅ PASS |
| T18 | admin-juge → UPDATE `config WHERE key='cagnotte_active'` | 0 (policy scope par clé) | 0 | ✅ PASS |
| T19 | anon → UPDATE benevole_repas (pas de policy UPDATE) | 0 | 0 | ✅ PASS |
| T20 | anon → DELETE FROM mentions WHERE false | PASS techniquement (policy true) | 0 lignes (qual:false) — n'invalide pas le hole | ✅ PASS (mais cf. T08bis : INSERT démontre la faille) |
| T21 | benevole → DELETE inscription d'un AUTRE benevole | 0 | 0 | ✅ PASS |
| T22 | admin → `SELECT count(*) FROM benevoles` (test récursion via `is_admin()`) | 140, pas de stack overflow | 140 | ✅ PASS |

## Synthèse

- ✅ **18/22 PASS** sur les contrôles attendus.
- ❌ **4 FAIL** correspondant aux anomalies déjà répertoriées dans `audit/16_rls.md` :
  - **R01** (mentions ouvert) — confirmé par T08bis.
  - **R02** (inscriptions SELECT public) — confirmé par T02 et T10.
  - **R03** (benevole_repas SELECT public) — confirmé par T03.
  - **R08** (benevole_cagnotte_periodes SELECT public à requalifier) — confirmé par T04 (statut conditionnel, dépend du contenu).

## Couvertures manquantes (Phase 3.4)

- Rôles `juge` et `officiel` (aucun utilisateur dans le dump actuel).
- Test du WITH CHECK admin sur `cagnotte_transactions` INSERT (montant négatif, FK valide, etc.) — relève davantage de la validation métier que de RLS.
- Test des policies Storage (Phase 3.6) — N/A (aucun bucket).
- Test des Edge Functions avec un appelant non-admin (T13 côté DB seulement).
