# 15 — Audit des conventions de nommage

> Phase 1.8 du plan de refactoring. Audit lecture-seule des conventions de nommage
> sur le schéma `public` de l'instance Supabase locale (snapshot prod du 2026-05-25).
>
> Conventions cibles :
> - Tables : `snake_case` pluriel
> - Colonnes : `snake_case` singulier
> - Clés étrangères : suffixe `_id`
> - Booléens : préfixe `is_*` ou `has_*`
> - Triggers : préfixe `trg_*`
> - Fonctions : préfixe `fn_*` ou verbe d'action
>
> Source des données : `audit/01_tables.csv`, `audit/02_columns.csv`,
> `audit/03_constraints.csv`, `audit/06_functions_triggers.csv`.

---

## 1. Convention des tables (`snake_case` pluriel)

### 1.1 Tableau d'analyse

| Table | Type | `snake_case` | Pluriel | Verdict |
|---|---|---|---|---|
| `admin_benevoles` | VIEW | ✅ | ✅ | OK |
| `admin_inscriptions` | VIEW | ✅ | ✅ | OK |
| `admin_periodes` | VIEW | ✅ | ✅ | OK |
| `benevole_cagnotte_periodes` | BASE TABLE | ✅ | ✅ | OK |
| `benevole_repas` | BASE TABLE | ✅ | ✅ (`repas` invariant) | OK |
| `benevoles` | BASE TABLE | ✅ | ✅ | OK |
| `cagnotte_transactions` | BASE TABLE | ✅ | ✅ | OK |
| `config` | BASE TABLE | ✅ | ❌ singulier | **EXCEPTION** |
| `inscriptions` | BASE TABLE | ✅ | ✅ | OK |
| `jours` | BASE TABLE | ✅ | ✅ | OK |
| `mentions` | BASE TABLE | ✅ | ✅ | OK |
| `orphan_relances` | BASE TABLE | ✅ | ✅ | OK |
| `periodes` | BASE TABLE | ✅ | ✅ | OK |
| `postes` | BASE TABLE | ✅ | ✅ | OK |
| `programme` | BASE TABLE | ✅ | ❌ singulier | **EXCEPTION** |
| `public_planning` | VIEW | ✅ | ❌ singulier | **EXCEPTION** |
| `repas` | BASE TABLE | ✅ | ✅ (`repas` invariant) | OK |
| `type_postes` | BASE TABLE | ✅ | ⚠️ ordre inversé | **EXCEPTION** |

### 1.2 Exceptions identifiées

#### `config` — singulier (key-value store)
- **Nature** : table clé/valeur de feature flags et paramètres globaux (`cagnotte_active`, `tarif_degaines_juge`, etc.).
- **Recommandation** : **CONSERVER**. C'est une convention répandue (cf. `settings`, `metadata`) pour les tables singleton-like / kvstore. Renommer en `configs` ou `configurations` n'apporte rien et casserait toutes les requêtes existantes.
- **Statut** : exception justifiée.

#### `programme` — singulier (table événementielle)
- **Nature** : à confirmer en lisant son contenu et son usage en Phase 1.2 / 1.3. Possiblement le programme officiel de la compétition (entité unique) ou des lignes de programme (auquel cas devrait être `programmes`).
- **Recommandation** : **À ARBITRER** lors de la Phase 2.6 (harmonisation du nommage).
  - Si table = 1 ligne par bloc de programme → renommer en `programmes`.
  - Si table = singleton (1 ligne de config programme global) → conserver `programme`.
- **Statut** : exception à trancher.

#### `public_planning` — singulier (vue de présentation)
- **Nature** : vue publique anonymisée (`Prénom + Initiale`) du planning consolidé.
- **Recommandation** : **CONSERVER**. `planning` est un mot massif en français (pas de pluriel naturel — on ne dit pas "les plannings publics" ici). Le préfixe `public_` indique aussi clairement le périmètre.
- **Statut** : exception justifiée.

#### `type_postes` — ordre des mots inversé
- **Nature** : table des types de postes (catégorisation).
- **Anomalie** : la convention anglo-saxonne pluraliserait le nom principal :
  - `type_postes` (actuel) = littéralement "type-postes" (incohérent)
  - `poste_types` (recommandé anglo) = "types de postes"
  - `types_de_poste` (français explicite) = lisible mais long
- **Recommandation** : **À ARBITRER** lors de la Phase 2.6. Le renommage impacte toutes les requêtes du front et la FK `postes.type_poste_id`. Risque cosmétique uniquement, pas de gain sécuritaire.
- **Statut** : exception à trancher (faible priorité).

### 1.3 Synthèse tables

- **14 / 18** noms respectent strictement la convention `snake_case` pluriel.
- **4 exceptions** dont :
  - **2 justifiées** (`config`, `public_planning`) → conserver en l'état.
  - **2 à arbitrer en Phase 2.6** (`programme`, `type_postes`) → décision mainteneur requise.
- Aucune table en `camelCase`, `PascalCase` ou avec tirets/espaces → la cohérence de base est bonne.

---

## 2. Convention des colonnes (`snake_case` singulier)

### 2.1 Vérification globale `snake_case`

**Résultat** : toutes les colonnes du schéma `public` sont en `snake_case` strict (caractères `[a-z0-9_]+` uniquement). Aucune colonne en `camelCase`, `PascalCase` ou avec tirets.

### 2.2 Vérification singulier

Convention : nom de colonne au singulier, sauf pour les **colonnes de type ARRAY ou JSONB représentant une collection** (auquel cas le pluriel est sémantiquement correct).

| Table.Colonne | Type | Pluriel ? | Verdict |
|---|---|---|---|
| `benevoles.cagnotte_forcee_jours` | ARRAY | Plural justifié (collection de jours) | OK |
| `admin_benevoles.cagnotte_forcee_periodes_ids` | jsonb | Plural OK (collection d'ids) — mais voir §3 pour le double pluriel `_ids` | ⚠️ |
| `admin_benevoles.nb_inscriptions` | bigint | Compteur — `nb_` rend le pluriel acceptable | OK |
| `admin_benevoles.nb_postes_referent` | bigint | Idem | OK |
| `admin_benevoles.repas` | jsonb | Plural OK (collection, mot invariant) | OK |
| `admin_periodes.nb_postes` | bigint | Idem | OK |
| `public_planning.inscrits_actuels` | bigint | ⚠️ pluriel sur un scalaire (count) | **À CORRIGER** : devrait être `nb_inscrits_actuels` |
| `public_planning.liste_benevoles` | ARRAY | Plural OK (préfixe `liste_` est redondant avec ARRAY mais sémantiquement clair) | ⚠️ redondance |

**Résultat** : 1 anomalie nette (`inscrits_actuels` → `nb_inscrits_actuels` ou `inscrits_count`). 1 redondance cosmétique (`liste_benevoles`).

### 2.3 Cohérences à signaler

Anomalies de cohérence repérées entre colonnes :

| Anomalie | Détail | Impact |
|---|---|---|
| `t_shirt_recupere` vs `taille_tshirt` | La même notion "t-shirt" est écrite `t_shirt` dans une colonne et `tshirt` dans l'autre (même table `benevoles`). | Cosmétique mais source de bugs de typo. **À harmoniser en Phase 2.6** (proposition : `tshirt_*` partout). |
| `auth_user_id` (orphan_relances) vs `user_id` (benevoles, cagnotte_transactions) | Les deux référencent `auth.users.id`. Préfixe `auth_` non systématique. | Cohérence faible. **À harmoniser** : retenir `user_id` partout puisque c'est la majorité. |
| `presence_samedi` / `presence_dimanche` | Hardcoding du jour dans le nom de colonne. | Anti-pattern (modèle non-normalisé). Hors scope conventions de nommage — déjà flagué côté audit modèle si présent ailleurs ; sinon **à ajouter à `audit/notes.md`**. |

---

## 3. Convention des clés étrangères (suffixe `_id`)

### 3.1 Recensement des FK

Source : `audit/03_constraints.csv` (constraint_type = FOREIGN KEY).

| Table | Colonne FK | Suffixe `_id` | Verdict |
|---|---|---|---|
| `benevole_cagnotte_periodes` | `benevole_id` | ✅ | OK |
| `benevole_cagnotte_periodes` | `periode_id` | ✅ | OK |
| `benevole_repas` | `benevole_id` | ✅ | OK |
| `benevole_repas` | `repas_id` | ✅ | OK |
| `benevoles` | `user_id` | ✅ | OK |
| `cagnotte_transactions` | `auteur_id` | ✅ | OK |
| `cagnotte_transactions` | `benevole_id` | ✅ | OK |
| `config` | `updated_by` | ❌ pas de `_id` | **EXCEPTION** |
| `inscriptions` | `benevole_id` | ✅ | OK |
| `inscriptions` | `poste_id` | ✅ | OK |
| `orphan_relances` | `auth_user_id` | ✅ (mais préfixe `auth_` inhabituel) | ⚠️ |
| `postes` | `periode_id` | ✅ | OK |
| `postes` | `referent_id` | ✅ | OK |
| `postes` | `type_poste_id` | ✅ | OK |
| `type_postes` | `date_ref` | ❌ pas de `_id` (PK cible = date, pas uuid) | **EXCEPTION** |

### 3.2 Exceptions analysées

#### `config.updated_by` → users.id
- **Nature** : FK vers `auth.users.id` (qui a effectué la dernière modification).
- **Convention idiomatique** : la convention `*_by` est couramment utilisée pour les colonnes d'audit (`created_by`, `updated_by`, `deleted_by`). Distincte de `*_id` qui dénote une relation métier.
- **Recommandation** : **CONSERVER**. Convention `_by` documentée explicitement dans la documentation du projet.
- **Statut** : exception justifiée.

#### `orphan_relances.auth_user_id` → users.id
- **Nature** : FK vers `auth.users.id` (utilisateur orphelin sans entrée `benevoles`).
- **Anomalie** : le préfixe `auth_` n'est utilisé qu'ici. Les autres FK vers `auth.users.id` s'appellent simplement `user_id` (cf. `benevoles.user_id`, `cagnotte_transactions.user_id`).
- **Recommandation** : **HARMONISER** en `user_id` en Phase 2.6 pour cohérence, ou documenter le rationale (peut-être pour disambiguïser dans le contexte "orphan" où il n'y a pas de benevole_id parallèle).
- **Statut** : exception à trancher.

#### `type_postes.date_ref` → jours.date_ref
- **Nature** : FK vers `jours.date_ref` (la PK de `jours` est de type `date`, pas `uuid`).
- **Anomalie** : convention `_id` non applicable car la cible n'est pas un id numérique/uuid.
- **Recommandation** : **CONSERVER**. Le nom `date_ref` reflète fidèlement le type et la nature de la référence.
- **Statut** : exception justifiée.

### 3.3 Synthèse FK

- **12 / 15** FK respectent strictement la convention `*_id`.
- **3 exceptions** :
  - **2 justifiées** (`updated_by` = colonne d'audit, `date_ref` = FK non-uuid).
  - **1 à trancher** (`auth_user_id` → harmoniser en `user_id`).

---

## 4. Convention des booléens (préfixe `is_*` / `has_*`)

### 4.1 Recensement des colonnes booléennes

| Table | Colonne | Préfixe `is_/has_` | Verdict |
|---|---|---|---|
| `benevole_repas` | `vegetarien` | ❌ | **NON CONFORME** |
| `benevoles` | `t_shirt_recupere` | ❌ | **NON CONFORME** |
| `benevoles` | `presence_samedi` | ❌ | **NON CONFORME** |
| `benevoles` | `presence_dimanche` | ❌ | **NON CONFORME** |
| `benevoles` | `cagnotte_forcee` | ❌ | **NON CONFORME** |
| `admin_benevoles` | `cagnotte_forcee` (issu de `benevoles`) | ❌ | **NON CONFORME** |

### 4.2 Analyse

**0 / 6** colonnes booléennes respectent la convention `is_*` / `has_*`. La convention anglo-saxonne est **globalement absente** du projet.

**Contexte linguistique** : le projet utilise un nommage francophone (`vegetarien`, `recupere`, `presence`). Préfixer en `is_` introduit un anglicisme dissonant :
- `is_vegetarien` (mixte anglais/français) vs `est_vegetarien` (français pur) vs `vegetarien` (sous-entendu).
- Beaucoup de projets francophones omettent le préfixe et s'appuient sur le contexte (nom au participe passé ou adjectif suffit à indiquer un booléen).

**Recommandation** : **DÉCISION MAINTENEUR REQUISE en Phase 2.6**.

Trois options :

1. **OPTION A — Adopter `is_*` / `has_*` anglo strictement** :
   - `vegetarien` → `is_vegetarien`
   - `t_shirt_recupere` → `has_recupere_tshirt`
   - `presence_samedi` → `is_present_samedi`
   - `cagnotte_forcee` → `is_cagnotte_forcee`
   - **Impact** : refactor lourd (toutes les requêtes front, vues, triggers à mettre à jour).

2. **OPTION B — Adopter `est_*` / `a_*` français** :
   - `vegetarien` → `est_vegetarien`
   - **Impact** : refactor lourd mais cohérent linguistiquement.

3. **OPTION C — Documenter l'exception et conserver l'usage actuel** :
   - Ajouter au `CONTRIBUTING.md` que les booléens utilisent un nommage francophone sans préfixe lorsque le contexte est clair.
   - **Impact** : zéro refactor, documentation à écrire.

**Préconisation rapporteur** : **OPTION C**, la moins risquée et déjà cohérente entre elles. Le préfixe n'apporte pas de gain sécuritaire et le refactor est coûteux pour un projet en production.

### 4.3 Synthèse booléens

- **6 colonnes booléennes** dans le schéma.
- **0** suivent la convention `is_*` / `has_*`.
- **Cohérence interne forte** : toutes utilisent le même style francophone sans préfixe.
- **Statut global** : non-conformité systémique, à **arbitrer** par décision projet.

---

## 5. Convention des triggers et fonctions

### 5.1 Triggers

Source : `audit/06_functions_triggers.csv`.

| Trigger | Préfixe `trg_` | Verdict |
|---|---|---|
| `check_role_change` (sur `benevoles`) | ❌ pas de préfixe | **NON CONFORME** |
| `trigger_check_capacity` (sur `inscriptions`) | ⚠️ préfixe `trigger_` au lieu de `trg_` | NON CONFORME mais cohérent interne |
| `trigger_check_time_conflict` (sur `inscriptions`) | ⚠️ préfixe `trigger_` au lieu de `trg_` | NON CONFORME mais cohérent interne |

**Observation** : 2 triggers sur 3 utilisent le préfixe `trigger_` (long mais explicite), 1 n'en utilise aucun. Aucun n'utilise `trg_`.

**Recommandation** : en Phase 2.6, **harmoniser sur `trg_*`** :
- `check_role_change` → `trg_prevent_role_change`
- `trigger_check_capacity` → `trg_check_capacity`
- `trigger_check_time_conflict` → `trg_check_time_conflict`

Le renommage des triggers n'impacte pas le code applicatif (les triggers sont invisibles côté front). Risque faible.

### 5.2 Fonctions

Convention cible : préfixe `fn_*` **OU** nom verbal (verbe d'action en tête).

| Fonction | Verbe en tête | Conformité | Note |
|---|---|---|---|
| `check_capacity` | check | ✅ | OK |
| `check_referent_access` | check | ✅ | OK |
| `check_time_conflict` | check | ✅ | OK |
| `get_auth_users_without_benevole` | get | ✅ | OK |
| `get_benevole_email` | get | ✅ | OK |
| `get_benevole_full_name` | get | ✅ | OK |
| `get_benevole_name` | get | ✅ | OK |
| `get_benevole_phone` | get | ✅ | OK |
| `get_family_tshirt_info` | get | ✅ | OK |
| `get_family_tshirt_info_smart` | get | ✅ | OK |
| `get_public_benevole_info` | get | ✅ | OK |
| `get_public_inscriptions` | get | ✅ | OK |
| `get_public_tshirt_info` | get | ✅ | OK |
| `get_user_balance` | get | ✅ | OK |
| `is_admin` | is (prédicat booléen) | ✅ | OK (fonction-prédicat) |
| `is_admin_juge` | is | ✅ | OK |
| `is_referent_for_benevole` | is | ✅ | OK |
| `manage_inscriptions_transaction` | manage | ✅ | OK |
| `prevent_role_change` | prevent | ✅ | OK |
| `public_debit_cagnotte` | public (NON VERBAL) | ❌ | **NON CONFORME** |
| `save_orphelin_phone` | save | ✅ | OK |
| `update_tshirt_status` | update | ✅ | OK |

**Résultat** : **21 / 22** fonctions ont un nom verbal en tête. **1 exception**.

#### Exception : `public_debit_cagnotte`
- **Nature** : fonction `SECURITY DEFINER` exposant une opération de débit de cagnotte au scope "public" (probablement utilisée depuis une page publique sans auth complète).
- **Anomalie** : le préfixe `public_` annonce le scope d'usage, pas une action. Le verbe `debit` arrive en deuxième position.
- **Recommandation** : renommer en `debit_cagnotte_public` ou `public_debit_cagnotte_rpc` en Phase 2.6. Impact : à chaque appel frontend `supabase.rpc('public_debit_cagnotte', ...)` (à grep en Phase 5). Risque modéré.

### 5.3 Synthèse triggers/fonctions

- **Fonctions** : excellente cohérence (21/22 = 95% conformes au pattern verbal). 1 anomalie nominale.
- **Triggers** : incohérence interne (3 styles différents sur 3 triggers). À harmoniser sur `trg_*`.

---

## 6. Synthèse globale et priorités

### 6.1 Récapitulatif des anomalies

| # | Catégorie | Élément | Sévérité | Action recommandée |
|---|---|---|---|---|
| 1 | Tables | `programme` (pluralité ambiguë) | BAS | Arbitrer P2.6 |
| 2 | Tables | `type_postes` (ordre inversé) | BAS | Arbitrer P2.6 |
| 3 | Colonnes | `public_planning.inscrits_actuels` | BAS | Renommer en `nb_inscrits_actuels` |
| 4 | Colonnes | `t_shirt_recupere` vs `taille_tshirt` | MOYEN | Harmoniser sur `tshirt_*` |
| 5 | Colonnes | `auth_user_id` vs `user_id` | BAS | Harmoniser sur `user_id` |
| 6 | FK | `auth_user_id` (cf. #5) | BAS | Cf. #5 |
| 7 | Booléens | 6 colonnes sans `is_*` / `has_*` | BAS | Documenter la convention francophone (OPTION C) |
| 8 | Triggers | 3 triggers, 3 styles différents | MOYEN | Harmoniser sur `trg_*` |
| 9 | Fonctions | `public_debit_cagnotte` (non verbal) | BAS | Renommer en P2.6 |

### 6.2 Décisions à prendre par le mainteneur (Phase 2.6)

- **Renommage `programme`** : table singleton ou collection ?
- **Renommage `type_postes`** : `poste_types` ou conserver ?
- **Convention booléens** : adopter `is_*` / `has_*` (refactor lourd) ou documenter l'exception (OPTION C) ?
- **Préfixe triggers `trg_*`** : adopter ? (refactor isolé, faible risque)

### 6.3 Conformité globale

| Domaine | Conformité |
|---|---|
| Tables (snake_case) | 18/18 (100%) |
| Tables (pluriel) | 14/18 (78%) — 2 exceptions justifiées, 2 à arbitrer |
| Colonnes (snake_case) | 100% |
| Colonnes (singulier) | ~99% (1 anomalie nette) |
| FK (`_id`) | 12/15 (80%) — 2 exceptions justifiées, 1 à harmoniser |
| Booléens (`is_/has_`) | 0/6 (0%) — non-conformité systémique cohérente |
| Triggers (`trg_*`) | 0/3 (0%) — incohérence interne |
| Fonctions (verbale) | 21/22 (95%) |

**Verdict général** : le projet a une **cohérence interne forte** (toutes les tables en snake_case, toutes les FK avec convention claire, fonctions verbales très majoritaires). Les écarts à la convention "anglo-saxonne stricte" (booléens, triggers) sont **homogènes** et résultent d'un choix linguistique francophone non documenté. L'enjeu de la Phase 2.6 sera d'**officialiser** ces conventions plutôt que de les changer.
