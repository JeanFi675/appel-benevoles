# Audit RLS — schéma `public`

> Phase 1.9 — Production de connaissance uniquement, aucune modification appliquée.
> Source : instance Supabase locale (dump prod du 2026-05-25, 140 bénévoles).
> Requêtes : `pg_class.relrowsecurity`, `pg_policies`, inspection des helpers `SECURITY DEFINER`.

---

## 1) Activation RLS — `pg_class.relrowsecurity`

Requête :
```sql
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
```

| Table                        | RLS activée | RLS forcée | Statut |
|------------------------------|:-----------:|:----------:|--------|
| `benevole_cagnotte_periodes` | ✅ | ❌ | OK |
| `benevole_repas`             | ✅ | ❌ | OK |
| `benevoles`                  | ✅ | ❌ | OK |
| `cagnotte_transactions`      | ✅ | ❌ | OK |
| `config`                     | ✅ | ❌ | OK |
| `inscriptions`               | ✅ | ❌ | OK |
| `jours`                      | ✅ | ❌ | OK |
| `mentions`                   | ✅ | ❌ | OK (mais policy = passoire — voir §4) |
| `orphan_relances`            | ✅ | ❌ | OK |
| `periodes`                   | ✅ | ❌ | OK |
| `postes`                     | ✅ | ❌ | OK |
| `programme`                  | ✅ | ❌ | OK |
| `repas`                      | ✅ | ❌ | OK |
| `type_postes`                | ✅ | ❌ | OK |

**Verdict :** aucune table publique sans RLS activée. ✅
**Limite à noter (HAUT) :** aucune table n'a `FORCE ROW LEVEL SECURITY`. Conséquence : le rôle propriétaire (`postgres`) et tout rôle ayant l'attribut `BYPASSRLS` court-circuitent RLS. À ajouter en Phase 3.1.

---

## 2) Matrice policies par table × opération

Légende des statuts d'opération :
- **OK** = au moins une policy permet l'opération aux rôles attendus, et restreint correctement les autres.
- **MISSING** = aucune policy → opération bloquée pour tout le monde (cas légitime si la table est en lecture seule côté front, sinon trou fonctionnel).
- **INTENTIONAL** = pas de policy mais le comportement (deny-all) est volontairement souhaité.
- **HOLE** = policy trop permissive (ex: `USING (true)` sur écriture, ou SELECT public sur données sensibles) → expose des données ou autorise des écritures non voulues.

| Table                          | SELECT          | INSERT          | UPDATE          | DELETE          |
|--------------------------------|-----------------|-----------------|-----------------|-----------------|
| `benevole_cagnotte_periodes`   | OK (public)     | OK (admin)      | OK (admin)      | OK (admin)      |
| `benevole_repas`               | **HOLE** (public:true sur données nominatives) | OK (own ∨ admin) | **MISSING** | OK (own ∨ admin) |
| `benevoles`                    | OK (own ∨ admin ∨ admin-juge ∨ referent) | OK (own) | OK (own ∨ admin ∨ admin-juge pour juges) | OK (own) |
| `cagnotte_transactions`        | OK (own ∨ admin) | OK (admin)     | **MISSING** (intentionnel ?) | **MISSING** (intentionnel ?) |
| `config`                       | OK (public)     | **HOLE** (`authenticated`) | OK (admin ∨ admin-juge[tarif_degaines_juge]) | **MISSING** |
| `inscriptions`                 | **HOLE** (`USING(true)` public — fuite des assignations nominatives) | OK (admin ∨ own) | **MISSING** | OK (admin ∨ own) |
| `jours`                        | OK (public)     | OK (admin, via ALL) | OK (admin, via ALL) | OK (admin, via ALL) |
| `mentions`                     | **HOLE** (`USING(true)` pour ALL — anon peut tout lire) | **HOLE** (anon peut INSERT) | **HOLE** (anon peut UPDATE) | **HOLE** (anon peut DELETE) |
| `orphan_relances`              | OK (admin via ALL) | OK (admin)   | OK (admin)      | OK (admin)      |
| `periodes`                     | OK (public)     | OK (admin)      | OK (admin)      | OK (admin)      |
| `postes`                       | OK (public)     | OK (admin)      | OK (admin)      | OK (admin)      |
| `programme`                    | OK (public)     | OK (admin)      | OK (admin)      | OK (admin)      |
| `repas`                        | OK (public)     | OK (admin, via ALL) | OK (admin, via ALL) | OK (admin, via ALL) |
| `type_postes`                  | OK (public)     | OK (admin, via ALL) | OK (admin, via ALL) | OK (admin, via ALL) |

### Détails par cellule problématique (justification)

#### 🔴 `inscriptions` — SELECT public:true
Policy `Lecture publique des inscriptions` `USING (true)` ouvre la lecture à `anon`. Or `inscriptions` contient `benevole_id` (lien direct vers identités) et `poste_id` (lien vers créneaux). Croisée à `benevoles` (qui *est* protégée) la fuite est partielle, **mais** la vue `public_planning` est censée anonymiser ce croisement (cf. CLAUDE.md). Cette policy SELECT défait la stratégie d'anonymisation : un attaquant peut joindre `inscriptions` à `public_planning` pour récupérer les inscriptions par `benevole_id` réel.
**Statut :** HOLE. À corriger en Phase 3 (révoquer SELECT public et passer par la vue uniquement).

#### 🔴 `benevole_repas` — SELECT public:true
Donnée nominative (`benevole_id`, choix `vegetarien`) exposée à `anon`. Même problème que `inscriptions`.
**Statut :** HOLE.

#### 🟡 `benevole_cagnotte_periodes` — SELECT public:true
Si la table contient des montants individuels (à confirmer Phase 2 vs `cagnotte_transactions`), la fuite est sévère. À vérifier — table peu utilisée dans le front.
**Statut :** HOLE candidate, à requalifier (probable INTENTIONAL si table = barème par période sans montants individuels).

#### 🔴 `mentions` — `Allow all for anon` `USING(true)` sur ALL
Toutes les opérations (SELECT/INSERT/UPDATE/DELETE) ouvertes à `anon` (test T08bis confirmé : INSERT depuis `anon` réussit). Aucun garde-fou.
**Statut :** HOLE critique (vandalisme possible).

#### 🟡 `config` — INSERT par tout authenticated
Policy `Enable insert for authenticated users` `WITH CHECK (auth.role() = 'authenticated')`. N'importe quel bénévole peut insérer des feature flags arbitraires (ex : `cagnotte_active=false`). UPDATE est protégée, mais INSERT permet de **bypass** : insérer une nouvelle clé puis attendre qu'elle écrase la précédente n'est pas possible (UNIQUE sur `key`), mais peut polluer le KV.
**Statut :** HOLE faible (à restreindre à `is_admin()` en Phase 3).

#### 🟢 `benevole_repas` UPDATE — MISSING
Pas de policy UPDATE → toute mise à jour bloquée. Choix métier : on supprime + recrée plutôt que UPDATE.
**Statut :** INTENTIONAL. Documenter en Phase 3.

#### 🟢 `cagnotte_transactions` UPDATE/DELETE — MISSING
Pas de policy UPDATE/DELETE → écritures bloquées une fois la transaction insérée. Choix métier (immutabilité comptable).
**Statut :** INTENTIONAL.

#### 🟢 `inscriptions` UPDATE — MISSING
Pas de policy UPDATE → on supprime + recrée. Compatible avec les triggers `check_capacity`/`check_time_conflict`.
**Statut :** INTENTIONAL.

#### 🟢 `config` DELETE — MISSING
KV statique, jamais supprimé en runtime.
**Statut :** INTENTIONAL.

---

## 3) Helpers `SECURITY DEFINER` utilisés par les policies

| Fonction                         | Language | Type            | Search path | Risque récursion |
|----------------------------------|----------|-----------------|-------------|------------------|
| `is_admin()`                     | plpgsql  | SECURITY DEFINER | `public`    | Non — exécute en tant que owner (RLS bypassée) |
| `is_admin_juge()`                | plpgsql  | SECURITY DEFINER | (non fixé)  | Non — mais ⚠ `search_path` non fixé → risque de hijack par schéma malveillant. À corriger Phase 3. |
| `is_referent_for_benevole(uuid)` | sql      | STABLE SECURITY DEFINER | `public` | Non |
| `check_referent_access(uuid)`    | plpgsql  | SECURITY DEFINER | `public`    | Non — mais ⚠ **bug fonctionnel** (cf. §5) |

### ⚠ `is_admin_juge()` sans `SET search_path`
Contrairement aux autres helpers, `is_admin_juge` ne fixe pas son `search_path`. C'est l'attaque CVE-2018-1058 standard pour les fonctions `SECURITY DEFINER`. Documenté dans la migration `20251207165000_fix_security_search_path.sql` (qui a réparé d'autres fonctions) — celle-ci est passée à travers les mailles.
**Action :** ajouter `SET search_path = public` dans la définition de `is_admin_juge`. À traiter en Phase 3.

---

## 4) Analyse de récursivité

Une policy est *à risque de récursion* si son `USING`/`WITH CHECK` :
1. fait une sous-requête sur une autre (ou la même) table avec RLS,
2. **sans** passer par une fonction `SECURITY DEFINER`,
3. et la table cible de la sous-requête a une policy qui re-pointe vers la première (cycle).

### Policies inspectées

| Table | Policy | Sous-requête | Cible | Risque |
|-------|--------|--------------|-------|--------|
| `benevole_cagnotte_periodes` | Modif admins | EXISTS sur `benevoles` | `benevoles` (RLS) | Faible — `benevoles` a des policies sur `auth.uid()`/helpers, pas sur `benevole_cagnotte_periodes`. Pas de cycle. |
| `benevole_repas` | INSERT/DELETE own | IN (SELECT id FROM benevoles WHERE user_id=auth.uid()) | `benevoles` | Faible — pas de cycle. |
| `benevoles` | Admins view/update | `is_admin()` | helper SECURITY DEFINER | Aucun — bypass RLS. |
| `benevoles` | Referents view | `is_referent_for_benevole(id)` / `check_referent_access(id)` | helper SECURITY DEFINER | Aucun. |
| `cagnotte_transactions` | SELECT/INSERT | EXISTS sur `benevoles` | `benevoles` | Faible — pas de cycle. |
| `config` | Admins update | `is_admin()` / `is_admin_juge()` | helpers SECURITY DEFINER | Aucun. |
| `inscriptions` | Admins ALL | EXISTS sur `benevoles` | `benevoles` | Faible — pas de cycle. |
| `inscriptions` | Users own | IN (SELECT id FROM benevoles WHERE user_id=auth.uid()) | `benevoles` | Faible — pas de cycle. |
| `jours`, `repas`, `type_postes`, `orphan_relances`, `programme` | Admins ALL | EXISTS sur `benevoles` (inline) | `benevoles` | Faible — pas de cycle. |
| `periodes`, `postes`, `programme` | Admins write | `is_admin()` | helper | Aucun. |

**Verdict :** aucun cycle direct détecté. Les sous-requêtes inline sur `benevoles` reposent sur le fait que `benevoles` ne référence aucune des tables enfants dans ses propres policies. Migration 008 (`fix_rls_recursion`) avait déjà cassé les cycles préexistants.

**Recommandation Phase 3 :** uniformiser. Remplacer les `EXISTS (SELECT 1 FROM benevoles WHERE user_id=auth.uid() AND role='admin')` inline par des appels à `is_admin()` pour (a) sécurité (toutes les vérifs admin passent par un seul helper auditable), (b) perf (le helper est `STABLE` ou peut l'être), (c) éviter les divergences si les colonnes de `benevoles` changent.

---

## 5) Bugs hors-RLS détectés au passage (à reporter dans `audit/notes.md`)

### Bug B1 — `check_referent_access(target_benevole_id)` compare des UUID hétérogènes
La fonction compare `postes.referent_id = auth.uid()`. Or `postes.referent_id` est une FK vers `benevoles.id` (cf. `postes_referent_id_fkey` confirmé dans la DB). `auth.uid()` retourne `auth.users.id` = `benevoles.user_id`, **pas** `benevoles.id`. Conséquence : `check_referent_access` retourne **toujours false** (sauf collision UUID statistiquement impossible). La policy `Referents can view volunteers` qui s'appuie dessus est **morte** depuis l'ajout de la FK (migration `20260316083700_add_fk_postes_referent_id.sql`).

Seul `is_referent_for_benevole` (qui fait correctement `ref.user_id = auth.uid()`) fonctionne — d'où l'existence des deux policies superposées sur `benevoles`.

**Action :** à corriger en Phase 3 (soit fixer `check_referent_access` soit supprimer la policy qui s'en sert puisque doublonnée).

### Bug B2 — `is_admin_juge()` sans `SET search_path`
Cf. §3. Vecteur d'élévation de privilèges si un attaquant peut créer un schéma `pg_temp` ou similaire dans le search_path.

---

## 6) Synthèse — anomalies par criticité (à remonter dans `audit_db.md`)

| ID  | Crit. | Table / Objet | Anomalie |
|-----|-------|---------------|----------|
| R01 | 🔴 CRITIQUE | `mentions` | Policy `USING(true)` sur ALL → anon peut tout INSERT/UPDATE/DELETE. |
| R02 | 🔴 CRITIQUE | `inscriptions` | SELECT public:true expose les assignations nominatives, contournant `public_planning`. |
| R03 | 🟠 HAUT | `benevole_repas` | SELECT public:true expose les choix nominatifs de repas. |
| R04 | 🟠 HAUT | `config` INSERT | Tout `authenticated` peut insérer une clé arbitraire. Doit être `is_admin()`. |
| R05 | 🟠 HAUT | `is_admin_juge()` | Pas de `SET search_path` (vecteur CVE-2018-1058). |
| R06 | 🟠 HAUT | `check_referent_access()` / policy `Referents can view volunteers` | Fonction morte (compare benevole_id avec auth.uid()), policy n'a aucun effet. |
| R07 | 🟡 MOYEN | toutes tables `public.*` | Aucune n'a `FORCE ROW LEVEL SECURITY` → propriétaire et `BYPASSRLS` court-circuitent. |
| R08 | 🟡 MOYEN | `benevole_cagnotte_periodes` | SELECT public:true à requalifier (contenu à valider Phase 2). |
| R09 | 🔵 BAS | `inscriptions`, `repas`, `jours`, `type_postes`, `orphan_relances`, `benevole_cagnotte_periodes` | EXISTS inline sur `benevoles` à uniformiser via `is_admin()` (lisibilité/maintenance). |

---

## 7) Méthodologie

- Requêtes SQL exécutées sur l'instance locale (`supabase_db_appel-benevoles`, Postgres 17).
- Tests de policies dans `audit/17_rls_tests.md` (script reproductible `audit/_rls_tests.sql`).
- Aucune écriture sur la prod.
