# 09 — Audit d'utilisation des tables (Phase 1.2)

> Date : 2026-05-25
> Périmètre grep : `src/`, `supabase/functions/`, `supabase/migrations_archive_pre_refactor/`
> *Note : `supabase/migrations/` est vide pendant le refacto (cf. CLAUDE.md / Phase 0.3). Le grep s'est donc fait sur l'archive historique.*

## Légende statuts

- **USED** : la table est référencée dans le code frontend (`src/`).
- **BACKEND_ONLY** : la table n'est référencée que par les Edge Functions ou par des triggers/fonctions PostgreSQL.
- **UNUSED** : aucune référence dans le code applicatif (ni frontend, ni Edge Functions, ni triggers/fonctions PG). Candidate à la suppression sous réserve de la vérification item 1.2 § 3.

## Tableau de synthèse

| Table | Occurrences `src/` | Occurrences `supabase/functions/` | Occurrences archive migrations | RLS active ? | Statut |
|---|---|---|---|---|---|
| `benevole_cagnotte_periodes` | 3 (admin/index.js) | 0 | présentes (création / config) | oui | **USED** |
| `benevole_repas` | 4 (user/profiles.js, user/wizard.js) | 0 | présentes (création / RLS) | oui | **USED** |
| `benevoles` | 46 occurrences / 10 fichiers | nombreuses (create-benevole, send-planning, send-relance, send-relance-orphelin, send-rappel-all) | présentes | oui | **USED** |
| `cagnotte_transactions` | 1 (admin/index.js l.681) | 0 | présentes (10_cagnotte_system) | oui | **USED** |
| `config` | 6 (admin/index.js, user/cagnotte.js, store.js) | 0 | présentes (20240525000000_create_config, …) | oui | **USED** |
| `inscriptions` | 51 occurrences / 9 fichiers | présentes (send-planning, send-rappel-all) | présentes | oui | **USED** |
| `jours` | nombreuses (admin/index.js : load, upsert, delete) | 0 | présentes (20260525080000_create_jours_table) | oui | **USED** |
| `mentions` | **0** | **0** | **0** | oui (policy "Allow all for anon") | **UNUSED** ⚠️ |
| `orphan_relances` | 0 | 4 lignes (send-relance-orphelin/index.ts) | présentes (20260328100000, 20260415100000) | oui | **BACKEND_ONLY** |
| `periodes` | 196 occurrences / 14 fichiers | présentes (send-planning, send-rappel-all) | présentes | oui | **USED** |
| `postes` | 45 occurrences / 4 fichiers | présentes via jointures `inscriptions.postes` | présentes | oui | **USED** |
| `programme` | nombreuses (admin-timeline.js, admin/index.js) | 0 | présentes (20260523120000_create_programme_table) | oui | **USED** |
| `repas` | nombreuses (admin/index.js : CRUD, store.js, wizard.js, partials) | 0 | présentes | oui | **USED** |
| `type_postes` | 8 occurrences (admin/index.js) | 0 | présentes (20260525070000_create_type_postes) | oui | **USED** |

## Détail des candidates UNUSED

### `mentions`

- **Schéma** : `id`, `title`, `url`, `platform`, `status`, … (à confirmer en 1.3). Utilise les enums `mention_platform (fb,insta,web)` et `mention_status (new,archived,pinned)`.
- **FK entrantes** : aucune (cf. `audit/03_constraints.csv`).
- **RLS** : 1 policy `"Allow all for anon"` (PERMISSIVE, ALL, qual=`true`) → **trou de sécurité potentiel si la table est conservée**.
- **Occurrences code** : zéro.
- **Hypothèse** : table créée pour une fonctionnalité "presse / mentions sociales" jamais branchée à l'UI ou supprimée du frontend sans drop de la table.
- **Décision à prendre en Phase 2.2** : `DROP TABLE mentions CASCADE` + drop des enums orphelins `mention_platform`, `mention_status`. À confirmer avec le mainteneur (item 1.2 § 3).

### `orphan_relances`

- **Statut** : `BACKEND_ONLY` (uniquement utilisée par l'Edge Function `send-relance-orphelin` pour tracer les relances envoyées aux comptes auth orphelins).
- **FK entrante** : aucune ; **FK sortante** : `auth_user_id → auth.users(id)`.
- **Décision** : **KEEP**. Pas d'usage frontend attendu (c'est un journal côté backend).

## Synthèse

| Statut | Tables |
|---|---|
| USED | 12 |
| BACKEND_ONLY | 1 (`orphan_relances`) |
| UNUSED | 1 (`mentions`) |

## Suite (item 3 de 1.2)

- `mentions` : aucun trigger/fonction PG ne la référence (vérifié dans `audit/06_functions_triggers.csv` — aucune occurrence du nom). Décision finale : **DROP** proposée en Phase 2.2, sous validation explicite du mainteneur.
