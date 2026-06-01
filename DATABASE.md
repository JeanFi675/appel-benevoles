# Base de données — appel-benevoles

Schéma PostgreSQL 17 du projet, hébergé sur Supabase managé. Toutes les tables sont dans le schéma `public` et toutes ont **RLS activée** (cf. `audit/16_rls.md`).

> **Source de vérité** : les CSV générés en Phase 1 (`audit/0*.csv`) à partir d'un dump prod du 2026-05-25 (140 bénévoles). Ce document est la version humainement lisible de ces données.

---

## 1. Vue d'ensemble

Le schéma s'articule autour de quatre noyaux fonctionnels :

| Noyau                    | Tables centrales                                                                 |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Identité utilisateur** | `benevoles` (1:1 avec `auth.users`), `orphan_relances`                           |
| **Planning bénévolat**   | `postes`, `type_postes`, `periodes`, `jours`, `inscriptions`                     |
| **Cagnotte buvette**     | `cagnotte_transactions`, `periodes.montant_credit`, `benevole_cagnotte_periodes` |
| **Évenement / extras**   | `programme`, `repas`, `benevole_repas`, `config`, `mentions`                     |

Quatre **vues** complètent l'accès :

- `public_planning` (lecture publique, anonymisée)
- `admin_benevoles`, `admin_inscriptions`, `admin_periodes` (agrégats pour l'admin)

---

## 2. Diagramme ERD

```mermaid
erDiagram
    AUTH_USERS ||--o| BENEVOLES : "1:1 (user_id)"
    BENEVOLES ||--o{ INSCRIPTIONS : "s'inscrit"
    POSTES ||--o{ INSCRIPTIONS : "reçoit"
    POSTES }o--|| TYPE_POSTES : "est de type"
    POSTES }o--o| PERIODES : "appartient à"
    POSTES }o--o| BENEVOLES : "a référent"
    TYPE_POSTES }o--|| JOURS : "se déroule le"
    BENEVOLES ||--o{ CAGNOTTE_TRANSACTIONS : "bénéficie"
    AUTH_USERS ||--o{ CAGNOTTE_TRANSACTIONS : "auteur"
    BENEVOLES ||--o{ BENEVOLE_REPAS : "choisit"
    REPAS ||--o{ BENEVOLE_REPAS : "est choisi"
    BENEVOLES ||--o{ BENEVOLE_CAGNOTTE_PERIODES : "lié à"
    PERIODES ||--o{ BENEVOLE_CAGNOTTE_PERIODES : "lié à"
    AUTH_USERS ||--o| ORPHAN_RELANCES : "relance email"
    AUTH_USERS ||--o| CONFIG : "modifié par"

    BENEVOLES {
        uuid id PK
        uuid user_id FK "auth.users"
        text email
        text prenom
        text nom
        text telephone
        text taille_tshirt "XS..XXL|SANS"
        text role "benevole|referent|admin|juge|admin-juge|officiel"
        bool t_shirt_recupere
        bool presence_samedi
        bool presence_dimanche
        bool cagnotte_forcee
        text cagnotte_forcee_type "journee|periode"
        text_array cagnotte_forcee_jours
        timestamptz relance_sent_at
    }
    POSTES {
        uuid id PK
        timestamptz periode_debut
        timestamptz periode_fin
        int nb_min
        int nb_max
        uuid type_poste_id FK
        uuid periode_id FK
        uuid referent_id FK
    }
    INSCRIPTIONS {
        uuid id PK
        uuid poste_id FK
        uuid benevole_id FK
        timestamptz created_at
    }
    TYPE_POSTES {
        uuid id PK
        date date_ref FK
        text titre
        text description
        int ordre
    }
    PERIODES {
        uuid id PK
        text nom UK
        int ordre UK
        numeric montant_credit
    }
    JOURS {
        date date_ref PK
    }
    CAGNOTTE_TRANSACTIONS {
        uuid id PK
        uuid user_id "auth.users"
        uuid benevole_id FK
        numeric montant "signed"
        text description
        uuid auteur_id "auth.users"
    }
    REPAS {
        uuid id PK
        text nom
    }
    BENEVOLE_REPAS {
        uuid benevole_id PK_FK
        uuid repas_id PK_FK
        bool vegetarien
    }
    BENEVOLE_CAGNOTTE_PERIODES {
        uuid benevole_id PK_FK
        uuid periode_id PK_FK
    }
    PROGRAMME {
        uuid id PK
        date date_ref
        time heure
        text description
    }
    CONFIG {
        text key PK
        jsonb value
        uuid updated_by FK
    }
    MENTIONS {
        uuid id PK
        text title
        text url UK
        text platform "enum"
        text status "enum"
    }
    ORPHAN_RELANCES {
        uuid auth_user_id PK_FK
        timestamptz relance_sent_at
        text telephone
    }
```

> Légende cardinalités Mermaid : `||` = exactement un, `o|` = zéro ou un, `o{` = zéro ou plusieurs, `|{` = un ou plusieurs.

---

## 3. Tables

### `benevoles` — profils utilisateurs (1:1 avec `auth.users`)

Profil enrichi d'un utilisateur Supabase Auth. Une ligne par utilisateur, créée à l'inscription.

| Colonne                    | Type        | NotNull | Description                                                                                    |
| -------------------------- | ----------- | :-----: | ---------------------------------------------------------------------------------------------- |
| `id`                       | uuid (PK)   |   ✅    | `gen_random_uuid()`                                                                            |
| `user_id`                  | uuid (FK)   |   ✅    | → `auth.users.id` (lien 1:1)                                                                   |
| `email`                    | text        |   ✅    | Email de contact                                                                               |
| `prenom`, `nom`            | text        |   ✅    | Identité                                                                                       |
| `telephone`                | text        |         | Optionnel                                                                                      |
| `taille_tshirt`            | text        |         | CHECK : XS, S, M, L, XL, XXL, SANS                                                             |
| `role`                     | text        |   ✅    | CHECK : `benevole`, `referent`, `admin`, `juge`, `admin-juge`, `officiel`. Défaut `'benevole'` |
| `t_shirt_recupere`         | bool        |         | Marqué `true` au scan distribution                                                             |
| `presence_samedi`          | bool        |         | Présence déclarée                                                                              |
| `presence_dimanche`        | bool        |         | Présence déclarée                                                                              |
| `cagnotte_forcee`          | bool        |   ✅    | Active l'auto-crédit cagnotte par période/jour                                                 |
| `cagnotte_forcee_type`     | text        |         | CHECK : `journee` ou `periode`                                                                 |
| `cagnotte_forcee_jours`    | text[]      |         | Jours retenus si type = `journee`                                                              |
| `relance_sent_at`          | timestamptz |         | Timestamp de la dernière relance email                                                         |
| `created_at`, `updated_at` | timestamptz |         |                                                                                                |

**Relations entrantes** : `inscriptions.benevole_id`, `cagnotte_transactions.benevole_id`, `postes.referent_id`, `benevole_repas.benevole_id`, `benevole_cagnotte_periodes.benevole_id`.

### `postes` — créneaux de bénévolat

Un poste = une mission sur une plage horaire avec une fourchette d'effectif.

| Colonne         | Type        | NotNull | Description                             |
| --------------- | ----------- | :-----: | --------------------------------------- |
| `id`            | uuid (PK)   |   ✅    |                                         |
| `periode_debut` | timestamptz |   ✅    | Début du créneau                        |
| `periode_fin`   | timestamptz |   ✅    | Fin du créneau                          |
| `nb_min`        | int         |   ✅    | Effectif minimum (défaut 1)             |
| `nb_max`        | int         |   ✅    | Effectif maximum (défaut 10)            |
| `type_poste_id` | uuid (FK)   |   ✅    | → `type_postes.id`                      |
| `periode_id`    | uuid (FK)   |         | → `periodes.id` (regroupement temporel) |
| `referent_id`   | uuid (FK)   |         | → `benevoles.id` (référent du poste)    |

**CHECKs** :

- `capacite_valide` : `nb_max >= nb_min AND nb_min > 0`
- `periode_valide` : `periode_fin > periode_debut`

### `inscriptions` — jonction `benevoles` ↔ `postes`

Inscription d'un bénévole à un créneau. La contrainte unique `(poste_id, benevole_id)` interdit les doublons. Les **triggers** (cf. §6) appliquent capacité et conflits horaires.

| Colonne       | Type        | NotNull | Description      |
| ------------- | ----------- | :-----: | ---------------- |
| `id`          | uuid (PK)   |   ✅    |                  |
| `poste_id`    | uuid (FK)   |   ✅    | → `postes.id`    |
| `benevole_id` | uuid (FK)   |   ✅    | → `benevoles.id` |
| `created_at`  | timestamptz |         |                  |

### `type_postes` — catalogue des types de mission

Décrit un type de poste (titre, description) rattaché à un jour de référence.

| Colonne       | Type      | NotNull | Description                    |
| ------------- | --------- | :-----: | ------------------------------ |
| `id`          | uuid (PK) |   ✅    |                                |
| `date_ref`    | date (FK) |   ✅    | → `jours.date_ref`             |
| `titre`       | text      |   ✅    | UNIQUE par `(date_ref, titre)` |
| `description` | text      |         |                                |
| `ordre`       | int       |   ✅    | Affichage UI (défaut 0)        |

### `periodes` — blocs temporels (Qualif Samedi, Finale Dimanche, …)

Regroupement métier des postes. Sert aussi à l'auto-crédit cagnotte.

| Colonne          | Type      | NotNull | Description                            |
| ---------------- | --------- | :-----: | -------------------------------------- |
| `id`             | uuid (PK) |   ✅    |                                        |
| `nom`            | text      |   ✅    | UNIQUE                                 |
| `ordre`          | int       |   ✅    | UNIQUE — ordre d'affichage             |
| `montant_credit` | numeric   |   ✅    | Crédit cagnotte par période (défaut 0) |

### `jours` — jours de référence de l'événement

Table de référence pour rattacher les `type_postes` à un jour.

| Colonne    | Type      | NotNull | Description |
| ---------- | --------- | :-----: | ----------- |
| `date_ref` | date (PK) |   ✅    | Date        |

### `cagnotte_transactions` — mouvements de la cagnotte

Crédits (positifs) et débits (négatifs). Le solde d'un utilisateur = `SUM(montant)`.

| Colonne       | Type      | NotNull | Description                                  |
| ------------- | --------- | :-----: | -------------------------------------------- |
| `id`          | uuid (PK) |   ✅    |                                              |
| `user_id`     | uuid      |   ✅    | `auth.users.id` — bénéficiaire               |
| `benevole_id` | uuid (FK) |         | → `benevoles.id` (cache, peut être nul)      |
| `montant`     | numeric   |   ✅    | Signé (+crédit / −débit)                     |
| `description` | text      |         | Libellé libre                                |
| `auteur_id`   | uuid (FK) |         | `auth.users.id` — qui a saisi la transaction |

### `benevole_repas` — choix de repas (n:m)

| Colonne       | Type         | NotNull | Description              |
| ------------- | ------------ | :-----: | ------------------------ |
| `benevole_id` | uuid (PK,FK) |   ✅    | → `benevoles.id`         |
| `repas_id`    | uuid (PK,FK) |   ✅    | → `repas.id`             |
| `vegetarien`  | bool         |   ✅    | Préférence pour ce repas |

### `repas` — catalogue des repas

| Colonne | Type      | NotNull | Description |
| ------- | --------- | :-----: | ----------- |
| `id`    | uuid (PK) |   ✅    |             |
| `nom`   | text      |   ✅    | Libellé     |

### `benevole_cagnotte_periodes` — bénévoles dont la cagnotte est forcée par période

Sélection des périodes pour lesquelles un bénévole reçoit automatiquement le crédit (mode `cagnotte_forcee_type = 'periode'`).

| Colonne       | Type         | NotNull | Description      |
| ------------- | ------------ | :-----: | ---------------- |
| `benevole_id` | uuid (PK,FK) |   ✅    | → `benevoles.id` |
| `periode_id`  | uuid (PK,FK) |   ✅    | → `periodes.id`  |

### `programme` — programme de l'événement (affichage public)

| Colonne       | Type      | NotNull | Description            |
| ------------- | --------- | :-----: | ---------------------- |
| `id`          | uuid (PK) |   ✅    |                        |
| `date_ref`    | date      |   ✅    | Jour                   |
| `heure`       | time      |   ✅    | Heure                  |
| `description` | text      |   ✅    | Libellé de l'événement |

### `config` — feature flags et paramètres clé/valeur

| Colonne      | Type        | NotNull | Description         |
| ------------ | ----------- | :-----: | ------------------- |
| `key`        | text (PK)   |   ✅    | Identifiant du flag |
| `value`      | jsonb       |   ✅    | Valeur arbitraire   |
| `updated_at` | timestamptz |         |                     |
| `updated_by` | uuid (FK)   |         | → `auth.users.id`   |

**Clés connues** : `cagnotte_active` (bool), `tarif_degaines_juge` (numeric, défaut 10.00).

### `mentions` — mentions de l'événement sur les réseaux

Veille social media (FB / Insta / Web).

| Colonne        | Type                      | NotNull | Description                                |
| -------------- | ------------------------- | :-----: | ------------------------------------------ |
| `id`           | uuid (PK)                 |   ✅    |                                            |
| `title`        | text                      |   ✅    |                                            |
| `url`          | text                      |   ✅    | UNIQUE                                     |
| `platform`     | `mention_platform` (enum) |   ✅    | `fb`, `insta`, `web`                       |
| `snippet`      | text                      |         |                                            |
| `author`       | text                      |         |                                            |
| `published_at` | timestamptz               |         |                                            |
| `status`       | `mention_status` (enum)   |         | `new`, `archived`, `pinned` (défaut `new`) |

### `orphan_relances` — utilisateurs Auth sans `benevoles`

Traque les comptes Supabase Auth qui n'ont pas créé leur profil bénévole, pour pouvoir les relancer.

| Colonne           | Type         | NotNull | Description       |
| ----------------- | ------------ | :-----: | ----------------- |
| `auth_user_id`    | uuid (PK,FK) |   ✅    | → `auth.users.id` |
| `relance_sent_at` | timestamptz  |         |                   |
| `telephone`       | text         |         |                   |

---

## 4. Vues

### `public_planning` (lecture publique, anonymisée)

Source unique pour le planning grand public. **Les noms des bénévoles inscrits sont anonymisés** via `get_benevole_name()` (prénom + initiale, ex : "Marie D."). Inclut le décompte d'inscrits par poste et les coordonnées du référent (résolues via helpers SECURITY DEFINER).

### `admin_benevoles`

Vue agrégée par bénévole : nombre d'inscriptions, nombre de postes dont il est référent, choix de repas (JSON), périodes cagnotte forcées (JSON).

### `admin_inscriptions`

Vue à plat (inscription × bénévole × poste × période) pour les listings admin, triée par `periode_debut` puis `benevole.nom`.

### `admin_periodes`

Vue résumée des périodes avec le nombre de postes rattachés.

---

## 5. Enums

```sql
mention_platform : fb | insta | web
mention_status   : new | archived | pinned
```

---

## 6. Triggers et fonctions PL/pgSQL

### Triggers

| Trigger                       | Table          | Événement       | Timing | Logique                                                                                    |
| ----------------------------- | -------------- | --------------- | ------ | ------------------------------------------------------------------------------------------ |
| `trigger_check_capacity`      | `inscriptions` | INSERT          | BEFORE | Refuse l'inscription si `nb_max` du poste est déjà atteint                                 |
| `trigger_check_time_conflict` | `inscriptions` | INSERT + UPDATE | BEFORE | Refuse l'inscription si le bénévole est déjà inscrit sur un créneau qui chevauche celui-ci |
| `check_role_change`           | `benevoles`    | UPDATE          | BEFORE | Empêche un non-admin de modifier sa propre colonne `role` (privilege escalation)           |

### Fonctions métier

#### Helpers d'autorisation (utilisées dans les policies RLS)

| Fonction                         | Sécurité | Retour | Logique                                                                           |
| -------------------------------- | -------- | ------ | --------------------------------------------------------------------------------- |
| `is_admin()`                     | DEFINER  | bool   | `true` si `auth.uid()` correspond à un bénévole de `role = 'admin'`               |
| `is_admin_juge()`                | DEFINER  | bool   | `true` si `auth.uid()` correspond à un bénévole de `role = 'admin-juge'`          |
| `is_referent_for_benevole(uuid)` | DEFINER  | bool   | `true` si l'appelant est référent d'un poste auquel le bénévole cible est inscrit |
| `check_referent_access(uuid)`    | DEFINER  | bool   | Variante avec lookup explicite — usage RLS sur `benevoles`                        |

> **Pourquoi `SECURITY DEFINER`** : ces fonctions doivent lire `benevoles` (table RLS-protégée). Sans DEFINER, l'utilisateur ne pourrait pas vérifier son propre rôle, créant un deadlock RLS. Les migrations 006-008 historiques ont corrigé des récursions induites par ce point.

#### Helpers de présentation (utilisés dans `public_planning`)

| Fonction                             | Retour | Logique                                                            |
| ------------------------------------ | ------ | ------------------------------------------------------------------ |
| `get_benevole_name(uuid)`            | text   | Prénom + initiale du nom (`Marie D.`) — **anonymisation publique** |
| `get_benevole_full_name(uuid)`       | text   | Prénom + nom complet (référent uniquement)                         |
| `get_benevole_email(uuid)`           | text   | Email du référent                                                  |
| `get_benevole_phone(uuid)`           | text   | Téléphone du référent                                              |
| `get_public_benevole_info(uuid)`     | json   | Info publique d'un bénévole                                        |
| `get_public_tshirt_info(uuid)`       | json   | Statut t-shirt (taille, retrait)                                   |
| `get_family_tshirt_info(uuid)`       | json   | Statut t-shirt pour tous les profils liés à un `user_id`           |
| `get_family_tshirt_info_smart(uuid)` | json   | Variante "smart fetch" optimisée pour le scanner                   |

#### Opérations métier

| Fonction                                                               | Sécurité | Logique                                                                                                      |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `manage_inscriptions_transaction(uuid, jsonb)`                         | DEFINER  | Applique un batch d'inscriptions/désinscriptions dans une transaction (rollback global si un trigger refuse) |
| `public_debit_cagnotte(uuid, numeric, text)`                           | DEFINER  | Débit cagnotte depuis la borne buvette (vérifie solde, INSERT signé)                                         |
| `update_tshirt_status(uuid, text, bool)`                               | DEFINER  | Met à jour `taille_tshirt` et `t_shirt_recupere` après scan                                                  |
| `get_user_balance(uuid)`                                               | DEFINER  | `SUM(montant)` des transactions de l'utilisateur                                                             |
| `save_orphelin_phone(uuid, text)`                                      | DEFINER  | Enregistre le téléphone d'un utilisateur Auth sans profil bénévole                                           |
| `get_auth_users_without_benevole()`                                    | DEFINER  | Liste des utilisateurs Auth sans ligne `benevoles` (admin uniquement)                                        |
| `get_public_inscriptions()`                                            | DEFINER  | Inscriptions publiques anonymisées                                                                           |
| `check_capacity()` / `check_time_conflict()` / `prevent_role_change()` | INVOKER  | Fonctions appelées par les triggers correspondants                                                           |

---

## 7. Matrice RLS — qui peut faire quoi ?

> **Note** : toutes les tables ont RLS **activée** (`relrowsecurity = true`) mais **non forcée** (`relforcerowsecurity = false`). Le rôle propriétaire et tout rôle `BYPASSRLS` court-circuitent les policies — limitation à traiter en Phase 3.1 (cf. `audit/16_rls.md`).

**Lecture** : ✅ = autorisé pour le rôle, 👁️ = autorisé en SELECT public (anonyme), ⛔ = refusé.

| Table                        |  Public anon  |            Bénévole (soi)            | Référent (postes liés) |      Admin       |                 Admin-juge                 | Notes                                           |
| ---------------------------- | :-----------: | :----------------------------------: | :--------------------: | :--------------: | :----------------------------------------: | ----------------------------------------------- |
| `benevoles`                  |      ⛔       | ✅ SELECT/UPDATE/INSERT/DELETE (soi) |       ✅ SELECT        | ✅ SELECT/UPDATE |      ✅ SELECT (tous), UPDATE (juges)      | Pas de UPDATE.role par soi-même (trigger)       |
| `inscriptions`               |   👁️ SELECT   |      ✅ CRUD (ses inscriptions)      |           —            |     ✅ CRUD      |                     —                      | Triggers capacité/conflit en BEFORE INSERT      |
| `postes`                     |   👁️ SELECT   |                  —                   |           —            |     ✅ CRUD      |                     —                      |                                                 |
| `type_postes`                |   👁️ SELECT   |                  —                   |           —            |      ✅ ALL      |                     —                      |                                                 |
| `periodes`                   |   👁️ SELECT   |                  —                   |           —            |     ✅ CRUD      |                     —                      |                                                 |
| `jours`                      |   👁️ SELECT   |                  —                   |           —            |      ✅ ALL      |                     —                      |                                                 |
| `programme`                  |   👁️ SELECT   |                  —                   |           —            |     ✅ CRUD      |                     —                      |                                                 |
| `repas`                      |   👁️ SELECT   |                  —                   |           —            |      ✅ ALL      |                     —                      |                                                 |
| `benevole_repas`             |   👁️ SELECT   |       ✅ INSERT/DELETE (siens)       |           —            |     ✅ tout      |                     —                      |                                                 |
| `cagnotte_transactions`      |      ⛔       |         ✅ SELECT (siennes)          |           —            | ✅ SELECT/INSERT |                     —                      |                                                 |
| `config`                     |   👁️ SELECT   |           ✅ INSERT (auth)           |           —            |    ✅ UPDATE     | ✅ UPDATE `tarif_degaines_juge` uniquement |                                                 |
| `benevole_cagnotte_periodes` |   👁️ SELECT   |                  —                   |           —            |      ✅ ALL      |                     —                      |                                                 |
| `orphan_relances`            |      ⛔       |                  —                   |           —            |      ✅ ALL      |                     —                      |                                                 |
| `mentions`                   | ✅ ALL (anon) |                  —                   |           —            |        —         |                     —                      | **🔴 Policy `ALL true` — passoire**, voir audit |

### Détail des policies les plus sensibles

#### `benevoles`

- **Lecture** : un utilisateur lit son propre profil (`auth.uid() = user_id`). Les admins lisent tout (`is_admin()`). Les référents lisent les bénévoles inscrits sur leurs postes (`is_referent_for_benevole(id)` + `check_referent_access(id)`). Les admin-juges lisent tout (`is_admin_juge()`).
- **Écriture** : un utilisateur INSERT/UPDATE/DELETE son propre profil. Les admins UPDATE tous les profils. Les admin-juges UPDATE uniquement les profils `juge` et `admin-juge`.
- **Garde-fou** : le trigger `check_role_change` bloque toute tentative d'auto-promotion (`role` ne peut pas changer dans un UPDATE par soi-même).

#### `inscriptions`

- **Lecture publique** : la policy `Lecture publique des inscriptions` retourne `true` pour SELECT — l'info "qui est inscrit où" est publique (utilisée par `public_planning`).
- **Écriture par l'utilisateur** : un utilisateur INSERT/DELETE/UPDATE uniquement les inscriptions dont `benevole_id` lui appartient (`benevole_id IN (SELECT id FROM benevoles WHERE user_id = auth.uid())`). Cela couvre les profils multiples (famille).
- **Écriture admin** : les admins ont CRUD complet.

#### `cagnotte_transactions`

- **Lecture** : l'utilisateur voit ses propres transactions (`user_id = auth.uid()`) + les admins voient tout.
- **Écriture** : **uniquement les admins** peuvent INSERT (la borne buvette passe via `public_debit_cagnotte()` en `SECURITY DEFINER`).

#### `mentions` — **alerte**

- Policy unique : `Allow all for anon` avec `qual = true` sur `ALL`. N'importe qui peut INSERT/UPDATE/DELETE. **À traiter** (cf. `audit/16_rls.md` §4, HOLE). Hors scope Phase 7.

---

## 8. Liens utiles

- [`audit_db.md`](audit_db.md) — audit DB complet (Phase 1)
- [`audit/16_rls.md`](audit/16_rls.md) — analyse RLS détaillée (Phase 1.9)
- [`audit/06_functions_triggers.csv`](audit/06_functions_triggers.csv) — liste brute des fonctions et triggers
- [`audit/07_rls_policies.csv`](audit/07_rls_policies.csv) — toutes les policies sous forme tabulaire
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — vue d'ensemble et flux applicatifs
- [`CLAUDE.md`](CLAUDE.md) — avertissements critiques sur les triggers et RLS
