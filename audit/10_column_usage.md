# 10 — Audit d'utilisation des colonnes (Phase 1.3)

> Date : 2026-05-26
> Périmètre grep : `src/`, `supabase/functions/`
> Méthodologie : pour chaque colonne de `02_columns.csv`, comptage `rg -c "\\bCOLUMN\\b"` (sensible aux limites de mot).
> Croisement : vérification que les colonnes 0-occurrence ne sont pas référencées par les vues (`05_views.csv`) ni les fonctions/triggers PG (`pg_proc.prosrc`).

## Légende statuts

- **USED** : ≥ 1 occurrence dans `src/` ou `supabase/functions/`.
- **UNUSED** : 0 occurrence dans le code applicatif. Décision DROP / KEEP documentée pour chacune.

> ℹ️ Le DoD demande une classification `READ_WRITE / READ_ONLY / WRITE_ONLY / UNUSED`. La détection automatique fiable de READ vs WRITE par grep n'est pas faisable à l'échelle (les colonnes apparaissent dans des templates Alpine, des destructurings, des objets bruts, etc.). La granularité retenue ici est binaire (`USED` / `UNUSED`) avec une section `LOW_USE` (1-3 occurrences) à inspecter manuellement avant tout DROP. Cette simplification est notée dans `audit/notes.md`.

## Synthèse

| Catégorie | Nombre |
|---|---|
| Colonnes totales (table × col) | 125 |
| UNUSED (0 occurrence) | 12 |
| LOW_USE (1-3 occurrences) | 8 |
| USED (4+ occurrences) | 105 |

## Colonnes UNUSED — décisions

| Table | Colonne | Vue / fonction PG ? | Décision Phase 2.2 | Justification |
|---|---|---|---|---|
| `admin_inscriptions` | `benevole_nom` | colonne d'une VUE `admin_inscriptions` | **REFACTOR VIEW** | retirer du SELECT de la vue ; aucun consommateur frontend |
| `admin_inscriptions` | `benevole_email` | colonne de VUE | **REFACTOR VIEW** | idem |
| `admin_inscriptions` | `poste_periode` | colonne de VUE | **REFACTOR VIEW** | idem |
| `admin_periodes` | `nb_postes` | colonne de VUE | **REFACTOR VIEW** | retirer du SELECT |
| `benevoles` | `presence_samedi` | non | **DROP COLUMN** | aucune vue, aucune fonction, aucun trigger ne la lit/écrit |
| `benevoles` | `presence_dimanche` | non | **DROP COLUMN** | idem |
| `cagnotte_transactions` | `auteur_id` | **OUI** : fonction `public_debit_cagnotte` y insère `NULL` | **DROP COLUMN après MAJ fonction** | la fonction écrit `auteur_id=NULL` mais ne lit jamais la colonne. Adapter `public_debit_cagnotte` (retirer du INSERT) avant DROP |
| `config` | `updated_by` | non | **DROP COLUMN** | champ d'audit jamais consommé ; aucune trace dans vues/fonctions |
| `mentions` | `platform` | table entière UNUSED | **DROP avec la table** | cf. `audit/09_table_usage.md` |
| `mentions` | `snippet` | table entière UNUSED | **DROP avec la table** | idem |
| `mentions` | `author` | table entière UNUSED | **DROP avec la table** | idem |
| `mentions` | `published_at` | table entière UNUSED | **DROP avec la table** | idem |

_Note_ : la colonne `mentions.id`, `mentions.title`, `mentions.url`, `mentions.created_at`, `mentions.status` apparaissent comme USED dans le scan (matchs ambigus sur des noms communs comme `id`, `title`, `url`, `created_at`, `status` partagés avec d'autres tables) — mais la table elle-même est marquée UNUSED, donc toutes ses colonnes meurent ensemble.

## Colonnes LOW_USE (1-3 occurrences) — à inspecter manuellement

| Table | Colonne | src/ | functions/ | Note |
|---|---|---|---|---|
| `admin_benevoles` | `updated_at` | 2 | 0 | _à investiguer_ |
| `admin_inscriptions` | `poste_titre` | 3 | 0 | _à investiguer_ |
| `benevoles` | `updated_at` | 2 | 0 | _à investiguer_ |
| `cagnotte_transactions` | `montant` | 3 | 0 | _à investiguer_ |
| `config` | `updated_at` | 2 | 0 | _à investiguer_ |
| `postes` | `type_poste_id` | 1 | 0 | _à investiguer_ |
| `public_planning` | `referent_email` | 1 | 0 | _à investiguer_ |
| `public_planning` | `referent_telephone` | 1 | 0 | _à investiguer_ |

## Détail complet — colonnes USED (4+ occurrences)

Comptages bruts pour traçabilité. Statut implicite `USED` ; classification fine READ/WRITE déférée.


### `admin_benevoles`

| Colonne | src/ | functions/ |
|---|---|---|
| `cagnotte_forcee` | 15 | 0 |
| `cagnotte_forcee_jours` | 12 | 0 |
| `cagnotte_forcee_periodes_ids` | 11 | 0 |
| `cagnotte_forcee_type` | 19 | 0 |
| `created_at` | 13 | 0 |
| `email` | 62 | 39 |
| `id` | 287 | 23 |
| `nb_inscriptions` | 11 | 0 |
| `nb_postes_referent` | 6 | 0 |
| `nom` | 101 | 15 |
| `prenom` | 60 | 15 |
| `relance_sent_at` | 2 | 6 |
| `repas` | 72 | 0 |
| `role` | 26 | 17 |
| `taille_tshirt` | 20 | 0 |
| `telephone` | 21 | 0 |
| `user_id` | 17 | 14 |

### `admin_inscriptions`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `id` | 287 | 23 |
| `periode_debut` | 53 | 2 |
| `periode_fin` | 28 | 2 |

### `admin_periodes`

| Colonne | src/ | functions/ |
|---|---|---|
| `id` | 287 | 23 |
| `nom` | 101 | 15 |
| `ordre` | 34 | 4 |

### `benevole_cagnotte_periodes`

| Colonne | src/ | functions/ |
|---|---|---|
| `benevole_id` | 27 | 7 |
| `periode_id` | 36 | 0 |

### `benevole_repas`

| Colonne | src/ | functions/ |
|---|---|---|
| `benevole_id` | 27 | 7 |
| `repas_id` | 17 | 0 |
| `vegetarien` | 7 | 0 |

### `benevoles`

| Colonne | src/ | functions/ |
|---|---|---|
| `cagnotte_forcee` | 15 | 0 |
| `cagnotte_forcee_jours` | 12 | 0 |
| `cagnotte_forcee_type` | 19 | 0 |
| `created_at` | 13 | 0 |
| `email` | 62 | 39 |
| `id` | 287 | 23 |
| `nom` | 101 | 15 |
| `prenom` | 60 | 15 |
| `relance_sent_at` | 2 | 6 |
| `role` | 26 | 17 |
| `t_shirt_recupere` | 7 | 0 |
| `taille_tshirt` | 20 | 0 |
| `telephone` | 21 | 0 |
| `user_id` | 17 | 14 |

### `cagnotte_transactions`

| Colonne | src/ | functions/ |
|---|---|---|
| `benevole_id` | 27 | 7 |
| `created_at` | 13 | 0 |
| `description` | 39 | 0 |
| `id` | 287 | 23 |
| `user_id` | 17 | 14 |

### `config`

| Colonne | src/ | functions/ |
|---|---|---|
| `key` | 133 | 0 |
| `value` | 76 | 0 |

### `inscriptions`

| Colonne | src/ | functions/ |
|---|---|---|
| `benevole_id` | 27 | 7 |
| `created_at` | 13 | 0 |
| `id` | 287 | 23 |
| `poste_id` | 59 | 0 |

### `jours`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `date_ref` | 15 | 0 |

### `mentions`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `id` | 287 | 23 |
| `status` | 5 | 31 |
| `title` | 55 | 0 |
| `url` | 2 | 4 |

### `orphan_relances`

| Colonne | src/ | functions/ |
|---|---|---|
| `auth_user_id` | 1 | 5 |
| `relance_sent_at` | 2 | 6 |
| `telephone` | 21 | 0 |

### `periodes`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `id` | 287 | 23 |
| `montant_credit` | 18 | 0 |
| `nom` | 101 | 15 |
| `ordre` | 34 | 4 |

### `postes`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `id` | 287 | 23 |
| `nb_max` | 49 | 0 |
| `nb_min` | 45 | 0 |
| `periode_debut` | 53 | 2 |
| `periode_fin` | 28 | 2 |
| `periode_id` | 36 | 0 |
| `referent_id` | 34 | 0 |

### `programme`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `date_ref` | 15 | 0 |
| `description` | 39 | 0 |
| `heure` | 10 | 0 |
| `id` | 287 | 23 |

### `public_planning`

| Colonne | src/ | functions/ |
|---|---|---|
| `description` | 39 | 0 |
| `inscrits_actuels` | 43 | 0 |
| `liste_benevoles` | 9 | 0 |
| `nb_max` | 49 | 0 |
| `nb_min` | 45 | 0 |
| `periode` | 51 | 14 |
| `periode_debut` | 53 | 2 |
| `periode_fin` | 28 | 2 |
| `periode_ordre` | 10 | 0 |
| `poste_id` | 59 | 0 |
| `referent_id` | 34 | 0 |
| `referent_nom` | 6 | 0 |
| `titre` | 104 | 4 |
| `type_poste_ordre` | 4 | 0 |

### `repas`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `id` | 287 | 23 |
| `nom` | 101 | 15 |

### `type_postes`

| Colonne | src/ | functions/ |
|---|---|---|
| `created_at` | 13 | 0 |
| `date_ref` | 15 | 0 |
| `description` | 39 | 0 |
| `id` | 287 | 23 |
| `ordre` | 34 | 4 |
| `titre` | 104 | 4 |
