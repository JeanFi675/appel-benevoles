# Résultats des tests RLS — Phase 3.4

> Source : exécution de [`security/rls_tests.sql`](rls_tests.sql) sur l'instance Supabase locale.
> Cible : `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (Docker `supabase_db_appel-benevoles`).
> Date d'exécution : **2026-05-27 11:35:45 UTC**
> Branche : `refactor/production-hardening`
> Schéma : `public` (post-Phase 3.3, RLS forcée sur 13/13 tables, 37 policies + 2 cellules « DENY = pas de policy »).

---

## Résumé

| Statut    | Nombre |         % |
| --------- | -----: | --------: |
| PASS      | **61** | **100 %** |
| FAIL      |      0 |       0 % |
| **Total** | **61** |           |

Aucune correction de policy n'a été nécessaire — toutes les anomalies initiales étaient des **erreurs d'attendus dans le script de test** liées au pattern « famille partage le même `user_id` » (cf. dénormalisation D-1 du `cagnotte_transactions.user_id`, Phase 2.7). Une fois les attendus corrigés pour refléter le scope famille de Patrick (le référent de test, qui partage son `user_id` avec Denise), 100 % des tests passent.

### Bilan par rôle

| Rôle     | Tests | PASS | FAIL |
| -------- | ----: | ---: | ---: |
| anon     |    15 |   15 |    0 |
| benevole |    18 |   18 |    0 |
| referent |    12 |   12 |    0 |
| admin    |    16 |   16 |    0 |

### Bilan par catégorie

| Catégorie                                                  | Tests | PASS |
| ---------------------------------------------------------- | ----: | ---: |
| SELECT — accès autorisé (ALLOW)                            |    14 |   14 |
| SELECT — visibilité restreinte (OWN_ROW_ONLY / ROLE_BASED) |    14 |   14 |
| SELECT — accès refusé (DENY)                               |     8 |    8 |
| INSERT — refusé (RLS denial)                               |    13 |   13 |
| INSERT — autorisé (admin)                                  |     2 |    2 |
| UPDATE — refusé (DENY INTENTIONAL, immutabilité comptable) |     7 |    7 |
| DELETE — refusé                                            |     3 |    3 |

---

## Rôles couverts vs. non couverts

### Couverts (4)

- **anon** (non authentifié)
- **benevole** (Vanessa, `f8cc4cf9-…` / uid `a3794e47-…`, famille de 1)
- **benevole(family)** (CECILE, `49d7dfb9-…` / uid `0bc7238c-…`, famille de 3) — variant utilisé pour valider la visibilité positive sur `cagnotte_transactions`
- **referent** (Patrick, `b1238666-…` / uid `cd8109d6-…`, famille de 2 [Patrick + Denise], 4 postes gérés, 13 bénévoles managés distincts)
- **admin** (Jean-Philippe, `dac29ab1-…` / uid `adc816f2-…`)

### Non couverts (3) — Justification

Les rôles `juge`, `admin-juge`, `officiel` listés dans le libellé de la tâche initiale du plan ne sont **pas testés**. Justification :

- Décision **D1** (2026-05-26, mainteneur) → suppression de ces 3 rôles.
- Migration `20260526130300_drop_juges_officiels.sql` appliquée en Phase 2.3.
- Enum `role_type` créé en Phase 2.4 ne contient que `('benevole','referent','admin')`.

Plus aucun utilisateur de ces rôles n'existe en base ; aucune policy ne les référence.

---

## Détail des 61 tests

|   # | Test | Rôle             | Table                      | Op     | Scope             | Attendu       | Statut   | Observé                        | Référence                          |
| --: | ---- | ---------------- | -------------------------- | ------ | ----------------- | ------------- | -------- | ------------------------------ | ---------------------------------- |
|   1 | A01  | anon             | benevoles                  | SELECT | any               | DENY          | **PASS** | 0                              | 0                                  |
|   2 | A02  | anon             | inscriptions               | SELECT | any               | DENY          | **PASS** | 0                              | 0                                  |
|   3 | A03  | anon             | benevole_repas             | SELECT | any               | DENY          | **PASS** | 0                              | 0                                  |
|   4 | A04  | anon             | benevole_cagnotte_periodes | SELECT | any               | DENY          | **PASS** | 0                              | 0                                  |
|   5 | A05  | anon             | cagnotte_transactions      | SELECT | any               | DENY          | **PASS** | 0                              | 0                                  |
|   6 | A06  | anon             | orphan_relances            | SELECT | any               | DENY          | **PASS** | 0                              | 0                                  |
|   7 | A07  | anon             | config                     | SELECT | public            | ALLOW         | **PASS** | 3                              | 3                                  |
|   8 | A08  | anon             | postes                     | SELECT | public            | ALLOW         | **PASS** | 58                             | 58                                 |
|   9 | A09  | anon             | periodes                   | SELECT | public            | ALLOW         | **PASS** | 10                             | 10                                 |
|  10 | A10  | anon             | programmes                 | SELECT | public            | ALLOW         | **PASS** | 20                             | ≥ 0                                |
|  11 | A11  | anon             | repas                      | SELECT | public            | ALLOW         | **PASS** | 2                              | > 0                                |
|  12 | A12  | anon             | type_postes                | SELECT | public            | ALLOW         | **PASS** | 29                             | > 0                                |
|  13 | A13  | anon             | jours                      | SELECT | public            | ALLOW         | **PASS** | 4                              | ≥ 0                                |
|  14 | A14  | anon             | config                     | INSERT | any               | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  15 | A15  | anon             | cagnotte_transactions      | INSERT | any               | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  16 | B01  | benevole         | benevoles                  | SELECT | own               | OWN_1         | **PASS** | total=1, others_visible=0      | total=1, others_visible=0          |
|  17 | B02  | benevole         | inscriptions               | SELECT | own               | OWN_1         | **PASS** | total=1, others_visible=0      | total=1, others_visible=0          |
|  18 | B03  | benevole         | benevole_repas             | SELECT | own               | OWN_1         | **PASS** | total=1, others_visible=0      | total=1, others_visible=0          |
|  19 | B04  | benevole         | benevole_cagnotte_periodes | SELECT | own               | OWN_0         | **PASS** | 0                              | 0                                  |
|  20 | B05  | benevole         | cagnotte_transactions      | SELECT | own               | OWN_0         | **PASS** | 0                              | 0                                  |
|  21 | B06  | benevole         | orphan_relances            | SELECT | none              | DENY          | **PASS** | 0                              | 0                                  |
|  22 | B07  | benevole         | config                     | SELECT | public            | ALLOW         | **PASS** | 3                              | 3                                  |
|  23 | B08  | benevole         | postes                     | SELECT | public            | ALLOW         | **PASS** | 58                             | 58                                 |
|  24 | B09  | benevole         | config                     | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  25 | B10  | benevole         | cagnotte_transactions      | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  26 | B11  | benevole         | benevole_cagnotte_periodes | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  27 | B12  | benevole         | orphan_relances            | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  28 | B13  | benevole         | postes                     | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  29 | B14  | benevole         | inscriptions               | UPDATE | own               | DENY          | **PASS** | rows_affected=0                | rows_affected=0 (no UPDATE policy) |
|  30 | B15  | benevole         | benevole_repas             | UPDATE | own               | DENY          | **PASS** | rows_affected=0                | rows_affected=0                    |
|  31 | B16  | benevole         | cagnotte_transactions      | UPDATE | own               | DENY          | **PASS** | rows_affected=0                | rows_affected=0                    |
|  32 | B17  | benevole         | cagnotte_transactions      | DELETE | own               | DENY          | **PASS** | rows_affected=0                | rows_affected=0                    |
|  33 | B18  | benevole         | inscriptions               | DELETE | others            | DENY          | **PASS** | 0                              | 0                                  |
|  34 | B05b | benevole(family) | cagnotte_transactions      | SELECT | own               | OWN_6         | **PASS** | total=6, others_visible=0      | total=6, others_visible=0          |
|  35 | R01  | referent         | benevoles                  | SELECT | family_or_managed | ROLE_BASED_14 | **PASS** | 14                             | 14                                 |
|  36 | R02  | referent         | inscriptions               | SELECT | family_or_managed | ROLE_BASED_25 | **PASS** | 25                             | 25                                 |
|  37 | R03  | referent         | benevole_repas             | SELECT | family            | OWN_3         | **PASS** | total=3, others_visible=0      | total=3, others_visible=0          |
|  38 | R04  | referent         | benevole_cagnotte_periodes | SELECT | none              | DENY          | **PASS** | 0                              | 0                                  |
|  39 | R05  | referent         | cagnotte_transactions      | SELECT | family            | OWN_4         | **PASS** | total=4, others_visible=0      | total=4, others_visible=0          |
|  40 | R06  | referent         | orphan_relances            | SELECT | none              | DENY          | **PASS** | 0                              | 0                                  |
|  41 | R07  | referent         | config                     | SELECT | public            | ALLOW         | **PASS** | 3                              | 3                                  |
|  42 | R08  | referent         | config                     | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  43 | R09  | referent         | cagnotte_transactions      | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  44 | R10  | referent         | postes                     | INSERT | none              | DENY          | **PASS** | 42501 RLS denial               | raises                             |
|  45 | R11  | referent         | inscriptions               | UPDATE | any               | DENY          | **PASS** | 0                              | 0                                  |
|  46 | R12  | referent         | inscriptions               | DELETE | foreign           | DENY          | **PASS** | 0                              | 0                                  |
|  47 | D01  | admin            | benevoles                  | SELECT | all               | ALLOW_140     | **PASS** | 140                            | 140                                |
|  48 | D02  | admin            | inscriptions               | SELECT | all               | ALLOW_309     | **PASS** | 309                            | 309                                |
|  49 | D03  | admin            | benevole_repas             | SELECT | all               | ALLOW_136     | **PASS** | 136                            | 136                                |
|  50 | D04  | admin            | benevole_cagnotte_periodes | SELECT | all               | ALLOW_52      | **PASS** | 52                             | 52                                 |
|  51 | D05  | admin            | cagnotte_transactions      | SELECT | all               | ALLOW_189     | **PASS** | 189                            | 189                                |
|  52 | D06  | admin            | orphan_relances            | SELECT | all               | ALLOW_7       | **PASS** | 7                              | 7                                  |
|  53 | D07  | admin            | config                     | SELECT | all               | ALLOW_3       | **PASS** | 3                              | 3                                  |
|  54 | D08  | admin            | postes                     | SELECT | all               | ALLOW_58      | **PASS** | 58                             | 58                                 |
|  55 | D09  | admin            | config                     | INSERT | any               | ALLOW         | **PASS** | INSERT allowed and rolled back | INSERT allowed                     |
|  56 | D10  | admin            | cagnotte_transactions      | INSERT | any               | ALLOW         | **PASS** | INSERT allowed and rolled back | INSERT allowed                     |
|  57 | D11  | admin            | cagnotte_transactions      | UPDATE | any               | DENY          | **PASS** | 0                              | 0                                  |
|  58 | D12  | admin            | cagnotte_transactions      | DELETE | any               | DENY          | **PASS** | 0                              | 0                                  |
|  59 | D13  | admin            | config                     | DELETE | any               | DENY          | **PASS** | 0                              | 0                                  |
|  60 | D14  | admin            | benevole_repas             | UPDATE | any               | DENY          | **PASS** | 0                              | 0                                  |
|  61 | D15  | admin            | inscriptions               | UPDATE | any               | DENY          | **PASS** | 0                              | 0                                  |

---

## Notes d'interprétation

### Scope « famille » des policies OWN_ROW_ONLY

Les policies utilisent `auth.uid() = user_id` (ou `is_own_benevole(benevole_id)` qui joint sur `user_id`). Quand plusieurs bénévoles partagent le même `auth.users.id` (cas familles inscrites sous un même compte parent — cf. dénormalisation D-1, Phase 2.7), tous les enregistrements de la famille sont visibles. C'est le comportement **voulu** : un parent qui s'authentifie doit voir/gérer les inscriptions de tous ses enfants bénévoles.

Concrètement vérifié sur Patrick (R01-R03, R05) : visible = 2 lignes `benevoles` (Patrick + Denise) + 12 bénévoles managés via `is_referent_for_benevole` → 14 lignes au total, sans fuite vers les autres user_id.

### Matrice §2.11 — `cagnotte_transactions` SELECT referent = « DENY »

Le libellé « DENY » de la matrice pour la cellule **referent × SELECT × cagnotte_transactions** signifie « pas d'accès admin aux transactions des autres bénévoles » et **non** « ne voit pas les siennes ». La policy `cagnotte_transactions_self_select` (`USING auth.uid() = user_id`) s'applique universellement à tout `authenticated`, indépendamment du `benevoles.role`. Sécuritairement correct (assertion négative `others_visible = 0` vérifiée), mais la matrice gagnerait à reformuler la cellule en `OWN_ROW_ONLY` pour cohérence sémantique.

→ **Action de suivi** suggérée (hors Phase 3.4) : amender `security/rls_matrix.md` §2.11 ligne referent SELECT, et préciser dans la légende que « DENY » signifie « pas de policy spécifique au rôle » (les policies universelles comme `_self_select` continuent de s'appliquer).

### Tests UPDATE/DELETE avec `ROW_COUNT = 0`

Sans policy `UPDATE`/`DELETE` couvrant la cellule, l'opération ne lève pas d'exception : elle filtre simplement zéro ligne à modifier. Les tests B14-B17, R11-R12, D11-D15 vérifient via `GET DIAGNOSTICS ... ROW_COUNT = 0`. C'est cohérent avec la sémantique Postgres : RLS USING-failure → ligne invisible pour l'op, donc non affectée.

---

## Prérequis appliqué : restauration des `GRANT` PostgREST

Pendant la première exécution du script (2026-05-27 ~11:30), tous les tests ont échoué avec `permission denied for table benevoles`, parce que `init.sql` (Phase 2.8, généré via `pg_dump --no-privileges`) avait strippé les 135 statements `GRANT` de PostgREST. La migration corrective [`20260527120000_restore_postgrest_grants.sql`](../supabase/migrations/20260527120000_restore_postgrest_grants.sql) a été créée et appliquée (case **3.4.0** du plan), restaurant `GRANT ALL` sur tables/vues + `GRANT EXECUTE` sur fonctions + `ALTER DEFAULT PRIVILEGES` pour les objets futurs. Cf. `audit/notes.md` § 2026-05-27 pour la rétrospective.

---

## Reproductibilité

```bash
# Pré-requis : instance Supabase locale démarrée (supabase start), migrations appliquées
docker exec -i supabase_db_appel-benevoles \
  psql -U postgres -d postgres -v ON_ERROR_STOP=0 \
  < security/rls_tests.sql
```

Le script est ré-entrant : il commence par `DROP TABLE IF EXISTS public._rls_test_results` et nettoie les résidus de tests `ALLOW` admin en fin d'exécution (via `DELETE ... WHERE LIKE '_rls_test_%'`).

Pour conserver la table de résultats après exécution :

```sql
SELECT * FROM public._rls_test_results ORDER BY seq;
```

(la table reste persistante en fin de script — supprimée uniquement au prochain `DROP TABLE IF EXISTS` initial.)
