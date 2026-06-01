# Audit 13 — Contraintes manquantes (NOT NULL / UNIQUE / CHECK)

> Tâches Phase 1.6.x du `plan_refactoring.md`.
> Source : instance Supabase **locale** (`127.0.0.1:54322`), dump prod du 2026-05-25 (140 bénévoles, 308 inscriptions, 58 postes, 189 transactions cagnotte).
> Méthode : croisement (a) `information_schema.columns` (nullables), (b) comptage des NULL / doublons / valeurs hors-plage sur les données réelles, (c) revue du frontend (`src/partials/*.html`, `src/js/**/*`) pour identifier les champs requis par l'UI, (d) revue des contraintes existantes (`03_constraints.csv`).
> Hypothèses : aucun écrasement de la table — toute contrainte ajoutée doit être backfill-safe (pas de violation sur les 140 lignes existantes).

---

## Partie 1.6.1 — Colonnes qui devraient être `NOT NULL`

### Méthodologie

Pour chaque colonne actuellement `is_nullable = YES` (33 colonnes recensées en `02_columns.csv`) :
1. Compter les NULL réels dans le dump prod.
2. Identifier si l'UI traite le champ comme requis (label `*`, attribut HTML `required`, validation JS).
3. Identifier si une `DEFAULT` existe (auto-backfill possible).
4. Vérifier que la colonne n'est pas déjà flaggée `DROP COLUMN` en `audit/10_column_usage.md`.

### Tableau d'analyse

Légende : ✅ NOT NULL safe = 0 NULL en base et default ou valeur métier déterminable ; ⚠️ NOT NULL avec backfill = NULL présents, backfill manuel requis ; ⬜ KEEP nullable = optionnel par design ; 🗑️ DROP planned = à supprimer en Phase 2.2, pas de NOT NULL.

| # | Table.colonne | Type | NULL réels / total | Default | UI requis ? | Recommandation | Justification |
|---|---|---|---|---|---|---|---|
| 1 | `benevoles.telephone` | text | **12 / 140** | — | ✅ label `Téléphone *` (wizard.html:75) | ⚠️ **NOT NULL après backfill** | Phase 2.3 : `UPDATE benevoles SET telephone='INCONNU' WHERE telephone IS NULL;` puis `ALTER ... SET NOT NULL`. Couplé au CHECK pattern (Partie 1.6.3) appliqué **après** backfill avec valeur conforme. |
| 2 | `benevoles.taille_tshirt` | text | 2 / 140 | — | ⚠️ conditionnel à `config.tshirt_question_active` | ⬜ **KEEP nullable** | Champ optionnel quand le toggle config est désactivé. Garder nullable pour respecter le comportement. |
| 3 | `benevoles.created_at` | timestamptz | 0 / 140 | `now()` | non | ✅ **NOT NULL** | Audit, 0 NULL en base, default `now()` couvre les futures insertions. |
| 4 | `benevoles.updated_at` | timestamptz | 0 / 140 | `now()` | non | ✅ **NOT NULL** | Idem. |
| 5 | `benevoles.t_shirt_recupere` | boolean | 0 / 140 | `false` | non | ✅ **NOT NULL** | Default `false`, 0 NULL ; sémantique tri-état (NULL = inconnu) non utilisée par le code. |
| 6 | `benevoles.presence_samedi` | boolean | 0 / 140 | `false` | non | 🗑️ **DROP planned** | Marquée `DROP COLUMN` dans `audit/10_column_usage.md` (UNUSED) — pas de NOT NULL à poser. |
| 7 | `benevoles.presence_dimanche` | boolean | 0 / 140 | `false` | non | 🗑️ **DROP planned** | Idem. |
| 8 | `benevoles.relance_sent_at` | timestamptz | — | — | non | ⬜ **KEEP nullable** | NULL = "jamais relancé" — sémantique correcte. |
| 9 | `benevoles.cagnotte_forcee_type` | text | — | — | conditionnel | ⬜ **KEEP nullable** | NULL = "pas de cagnotte forcée" — sémantique métier. Couplé au CHECK cross-field (Partie 1.6.3). |
| 10 | `benevoles.cagnotte_forcee_jours` | ARRAY (text[]) | 0 / 140 | `'{}'::text[]` | non | ✅ **NOT NULL** | Default tableau vide, 0 NULL. Cohérent avec `cagnotte_forcee = false`. |
| 11 | `cagnotte_transactions.benevole_id` | uuid | 0 / 189 | — | oui (toutes les insertions UI passent par benevole_id) | ✅ **NOT NULL** | FK obligatoire métier. 0 NULL en données. Note : la colonne `user_id` distincte (déjà NOT NULL) est la FK vers `auth.users`, `benevole_id` la FK vers `public.benevoles` (cf. migration `012_smart_debit.sql`). |
| 12 | `cagnotte_transactions.description` | text | 0 / 189 | — | oui (lib métier) | ✅ **NOT NULL** | 0 NULL — toutes les transactions ont un libellé. Ajouter aussi CHECK `length(description) > 0` (Partie 1.6.3). |
| 13 | `cagnotte_transactions.auteur_id` | uuid | **189 / 189 (100%)** | — | — | 🗑️ **DROP planned** | Colonne UNUSED (cf. `audit/10_column_usage.md`) — supprimer en Phase 2.2 plutôt que NOT NULL. |
| 14 | `cagnotte_transactions.created_at` | timestamptz | 0 / 189 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 15 | `config.updated_at` | timestamptz | 0 / 5 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 16 | `config.updated_by` | uuid | **5 / 5 (100%)** | — | — | 🗑️ **DROP planned** | Colonne UNUSED — supprimer en Phase 2.2. |
| 17 | `inscriptions.created_at` | timestamptz | 0 / 308 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 18 | `jours.created_at` | timestamptz | 0 / 4 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 19 | `orphan_relances.relance_sent_at` | timestamptz | — | — | non | ⬜ **KEEP nullable** | NULL = "non envoyée" — sémantique métier. |
| 20 | `orphan_relances.telephone` | text | — | — | non | ⬜ **KEEP nullable** | Téléphone peut être inconnu pour un orphelin Auth. |
| 21 | `periodes.created_at` | timestamptz | 0 / 10 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 22 | `postes.referent_id` | uuid | **3 / 58** | — | non | ⬜ **KEEP nullable** | NULL intentionnel = "poste sans référent" (3 cas en base, comportement supporté par le code et la vue `public_planning`). |
| 23 | `postes.created_at` | timestamptz | 0 / 58 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 24 | `postes.periode_id` | uuid | 0 / 58 | — | oui (création UI exige une période) | ✅ **NOT NULL** | 0 NULL réel, et la création de poste passe par la sélection d'une période. À valider en Phase 2.3 : aucune Edge Function ne crée de poste sans `periode_id` (vérification grep avant migration). |
| 25 | `programme.created_at` | timestamptz | 0 / 40 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 26 | `repas.created_at` | timestamptz | 0 / 2 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 27 | `type_postes.description` | text | 2 / 29 | — | non | ⬜ **KEEP nullable** | Champ libre optionnel. |
| 28 | `type_postes.created_at` | timestamptz | 0 / 29 | `now()` | non | ✅ **NOT NULL** | Audit. |
| 29 | `mentions.snippet`, `mentions.author`, `mentions.published_at`, `mentions.created_at`, `mentions.status` | divers | — | — | — | 🗑️ **DROP planned** | Table `mentions` entière marquée UNUSED dans `audit/09_table_usage.md` — DROP en Phase 2.2. |

### Synthèse Partie 1.6.1

| Catégorie | Compte | Action Phase 2.3 |
|---|---|---|
| ✅ NOT NULL safe (default + 0 NULL) | **14** | Migration unique `ALTER ... SET NOT NULL` pour les 14 colonnes audit/booléennes/`cagnotte_forcee_jours`/`cagnotte_transactions.{benevole_id,description}`/`postes.periode_id` |
| ⚠️ NOT NULL avec backfill | **1** | `benevoles.telephone` — backfill `'INCONNU'` ou contact mainteneur pour reconstituer les 12 numéros |
| ⬜ KEEP nullable (sémantique métier) | **6** | Documenter dans `DATABASE.md` la sémantique du NULL (Phase 7.3) |
| 🗑️ DROP planned (déjà couvert Phase 2.2) | **12** | Aucune NOT NULL à poser — les colonnes meurent |

### Validation préalable Phase 2.3

```sql
-- Vérifier qu'aucune insertion concurrente ne crée des NULL avant ALTER NOT NULL
-- (à exécuter immédiatement avant la migration)
SELECT 'benevoles.telephone' AS col, COUNT(*) AS nulls FROM benevoles WHERE telephone IS NULL
UNION ALL SELECT 'postes.periode_id', COUNT(*) FROM postes WHERE periode_id IS NULL
UNION ALL SELECT 'cagnotte_transactions.benevole_id', COUNT(*) FROM cagnotte_transactions WHERE benevole_id IS NULL
UNION ALL SELECT 'cagnotte_transactions.description', COUNT(*) FROM cagnotte_transactions WHERE description IS NULL;
-- Toutes les lignes doivent retourner nulls=0 (sauf telephone après backfill)
```

---

## Partie 1.6.2 — Colonnes qui devraient être `UNIQUE`

### Contraintes UNIQUE existantes (rappel `03_constraints.csv`)

| Table | Colonnes | Statut |
|---|---|---|
| `inscriptions` | `(poste_id, benevole_id)` | ✅ déjà UNIQUE |
| `mentions` | `url` | ✅ déjà UNIQUE |
| `periodes` | `nom` | ✅ déjà UNIQUE |
| `periodes` | `ordre` | ✅ déjà UNIQUE |
| `type_postes` | `(date_ref, titre)` | ✅ déjà UNIQUE |
| `config` | `key` | ✅ déjà UNIQUE (PK) |

### Analyse des candidats

| # | Table.colonne(s) | Doublons réels | Recommandation | Justification |
|---|---|---|---|---|
| 1 | `benevoles.email` | **22 doublons sur 140 lignes** | ❌ **PAS UNIQUE** | **Découverte critique** : les doublons sont **intentionnels** — patron "famille" (cf. migration archivée `20251229140000_tshirt_family_support.sql`). Exemple : 3 lignes `dvrfc2016@outlook.fr` partageant le même `user_id`, représentant Violaine + David + Célestin Bouchet-Vindret. Imposer UNIQUE casserait l'inscription multi-bénévoles d'une même famille avec un seul compte Auth. |
| 2 | `benevoles.email` (insensible à la casse) | 22 doublons | ❌ **PAS UNIQUE** | Idem ci-dessus. La recommandation `citext` de `audit/12_typing.md` reste valide pour l'ergonomie de connexion (pas de typo de casse), mais sans contrainte UNIQUE. |
| 3 | `benevoles.user_id` | **22 doublons sur 140 lignes** | ❌ **PAS UNIQUE** | Idem — un compte Auth peut porter plusieurs bénévoles (famille). FK `benevoles.user_id → auth.users.id` correcte mais cardinalité **1:N** assumée. À documenter explicitement dans `DATABASE.md`. |
| 4 | `benevoles.(user_id, prenom, nom)` | **À vérifier** | 🎯 **UNIQUE candidat** | Au sein d'une famille (même `user_id`), deux bénévoles avec le même `(prénom, nom)` n'auraient aucun sens fonctionnel. Vérification préalable nécessaire (cf. requête ci-dessous). |
| 5 | `benevoles.telephone` | 13 doublons (sur valeurs non-NULL) | ❌ **PAS UNIQUE** | Cohérent avec le patron famille : les membres d'une famille partagent le téléphone du parent référent. |
| 6 | `cagnotte_transactions.id` | 0 doublon | ✅ déjà PK | Aucune contrainte additionnelle. |
| 7 | `postes.(periode_id, type_poste_id)` | 0 doublon (58 lignes) | 🎯 **UNIQUE candidat** | Un type de poste ne peut logiquement apparaître qu'une fois par période (ex : "Accueil samedi 09:00" en double = ambiguïté). Cohérent avec la modélisation. **À valider avec le mainteneur** — possible existence légitime de "doublons" (deux créneaux du même type dans la même période ?). Si non, contrainte à poser en Phase 2.3. |
| 8 | `jours.date_ref` | 0 doublon | ✅ déjà PK | — |
| 9 | `repas.nom` | 0 doublon | 🎯 **UNIQUE candidat** | Deux repas avec le même nom n'a pas de sens fonctionnel. Cardinalité actuelle : 2 lignes ("Samedi soir", "Vendredi soir"). Poser UNIQUE est prudent et coûteux à zéro. |
| 10 | `programme.(date_ref, heure)` | À vérifier | 🤔 **À évaluer** | Deux entrées au même horaire le même jour = possible (multiples annonces) ou doublon ? Décision mainteneur. |
| 11 | `orphan_relances.auth_user_id` | 0 doublon | ✅ déjà PK | — |

### Validations préalables Phase 2.3

```sql
-- #4 : doublons (user_id, prenom, nom)
SELECT user_id, prenom, nom, COUNT(*)
FROM benevoles
GROUP BY 1,2,3 HAVING COUNT(*) > 1;
-- Attendu : 0 ligne

-- #7 : doublons (periode_id, type_poste_id)
SELECT periode_id, type_poste_id, COUNT(*)
FROM postes
WHERE periode_id IS NOT NULL
GROUP BY 1,2 HAVING COUNT(*) > 1;
-- Si > 0 : décision mainteneur requise

-- #10 : doublons (date_ref, heure)
SELECT date_ref, heure, COUNT(*)
FROM programme
GROUP BY 1,2 HAVING COUNT(*) > 1;
```

### Synthèse Partie 1.6.2

| Catégorie | Compte |
|---|---|
| ✅ UNIQUE existants | **6** |
| 🎯 UNIQUE à ajouter (sans bloqueur) | **2** (`benevoles.(user_id, prenom, nom)`, `repas.nom`) |
| 🎯 UNIQUE à ajouter (décision mainteneur) | **2** (`postes.(periode_id, type_poste_id)`, `programme.(date_ref, heure)`) |
| ❌ Fausses pistes (cas famille) | **3** (`email`, `user_id`, `telephone`) — **à documenter explicitement dans `DATABASE.md`** |

### ⚠️ Anomalie à classer dans `audit_db.md` (Phase 1.10)

Le patron "famille" (`benevoles.user_id` cardinalité 1:N) est **non documenté en dehors d'une migration archivée**. C'est une décision architecturale forte qui :
- Empêche les contraintes UNIQUE évidentes sur `email`/`user_id`.
- Complique les requêtes "qui est connecté" (la session JWT donne `user_id`, qui peut correspondre à plusieurs `benevoles.id`).
- Doit être visible dans `DATABASE.md` Phase 7.3.

Criticité : **MOYEN** (impact intégrité, mais comportement actuel correct).

---

## Partie 1.6.3 — Colonnes qui devraient avoir un `CHECK`

### CHECK existants (rappel `03_constraints.csv` + `audit/notes.md` 2026-05-26)

| Contrainte | Définition |
|---|---|
| `benevoles_role_check` | `role IN ('benevole','referent','admin','juge','admin-juge','officiel')` |
| `benevoles_taille_tshirt_check` | `taille_tshirt IN ('XS','S','M','L','XL','XXL','SANS')` |
| `benevoles_cagnotte_forcee_type_check` | `cagnotte_forcee_type IN ('journee','periode')` |
| `postes.capacite_valide` | `nb_max >= nb_min AND nb_min > 0` |
| `postes.periode_valide` | `periode_fin > periode_debut` |

> ℹ️ Les 3 premiers CHECK seront **remplacés par des `ENUM`** en Phase 2.4 (cf. `audit/12_typing.md` Partie 1.5.4). Les 2 derniers (`postes.*`) sont des règles métier non-enum et restent en place.

### Candidats à ajouter

| # | Cible | CHECK proposé | Données actuelles | Justification |
|---|---|---|---|---|
| 1 | `cagnotte_transactions.montant` | `montant <> 0` | min=-19.00, max=-1.00, 0 lignes à zéro | Une transaction nulle n'a aucun sens métier (ni crédit ni débit). Convention dans les systèmes de cagnotte. |
| 2 | `cagnotte_transactions.montant` | `abs(montant) <= 10000` | max abs = 19.00 | Garde-fou contre une saisie erronée (ex : 100000 au lieu de 100). Seuil large à valider avec mainteneur. |
| 3 | `cagnotte_transactions.description` | `length(trim(description)) > 0` | 0 chaînes vides | Couplé à NOT NULL (Partie 1.6.1 #12). Empêche `""` comme description. |
| 4 | `periodes.montant_credit` | `montant_credit >= 0` | min=0, max=10 | Le crédit ne peut pas être négatif (un débit se modélise via `cagnotte_transactions.montant`, pas via cette colonne). |
| 5 | `periodes.ordre` | `ordre > 0` | min=1 | Ordre d'affichage 1-based dans le code. Évite `0` et négatifs. |
| 6 | `type_postes.ordre` | `ordre >= 0` | min=0 | Convention 0-based déjà présente en données. Empêche les négatifs. |
| 7 | `benevoles.email` | `email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'` | aucune adresse invalide | Format email minimal. À poser **après** conversion `citext` (Phase 2.4). Pattern simple, non-RFC complet (suffisant pour bloquer les saisies absurdes). |
| 8 | `benevoles.telephone` | `telephone ~ '^[+0-9 .-]{10,20}$'` | max len = 14 | Pattern souple FR + international. Recommandé en `audit/12_typing.md` Partie 1.5.1. À poser **après** backfill (Partie 1.6.1 #1). |
| 9 | `orphan_relances.telephone` | identique #8, NULL-permissif | — | Cohérence avec `benevoles.telephone`. La contrainte doit autoriser NULL (`telephone IS NULL OR telephone ~ ...`). |
| 10 | `benevoles` (cross-field cagnotte forcée) | `(cagnotte_forcee = false AND cagnotte_forcee_type IS NULL AND cagnotte_forcee_jours = '{}') OR (cagnotte_forcee = true AND cagnotte_forcee_type IS NOT NULL)` | 0 violation en base | Empêche les états incohérents : cagnotte forcée sans type, ou type sans flag actif. Validé par requête : `forcee=true AND type IS NULL → 0`, `forcee=false AND type IS NOT NULL → 0`. |
| 11 | `benevoles` (cross-field journée) | `cagnotte_forcee_type <> 'journee' OR cardinality(cagnotte_forcee_jours) > 0` | 0 violation en base | Si type='journee', il doit y avoir au moins un jour sélectionné. Validé par requête (`forcee=true AND type='journee' AND jours empty → 0`). |
| 12 | `benevoles.prenom`, `benevoles.nom` | `length(trim(prenom)) > 0` (idem nom) | aucune chaîne vide | Empêche `""` (déjà NOT NULL, mais "" passe). Coût zéro. |
| 13 | `postes.nb_min`, `postes.nb_max` | borne sup raisonnable, ex : `nb_max <= 200` | max=30 | Garde-fou contre une saisie erronée (ex : `nb_max = 99999`). Seuil large à valider avec mainteneur. |
| 14 | `periodes.nom`, `repas.nom`, `type_postes.titre` | `length(trim(...)) > 0` | aucune chaîne vide | Empêche `""` comme libellé. Coût zéro. |
| 15 | `mentions.url` | `url ~* '^https?://'` | — | URL valide. Recommandé en `audit/12_typing.md`. *N/A si table `mentions` DROP planned (cf. `09_table_usage.md`).* |
| 16 | `config.key` | `length(trim(key)) > 0` | 0 vide | Garde-fou. |

### Synthèse Partie 1.6.3

| Catégorie | Compte | Action Phase 2.3 |
|---|---|---|
| CHECK existants conservés | 2 (`capacite_valide`, `periode_valide`) | — |
| CHECK existants remplacés par ENUM | 3 | Phase 2.4 |
| 🎯 CHECK simples à ajouter (zéro risque) | **11** | #1, #3, #4, #5, #6, #10, #11, #12, #14, #16, et #9 (idem #8 mais NULL-permissif) |
| 🎯 CHECK pattern (après conversion type) | **2** | #7 (email, après citext), #8 (téléphone, après backfill) |
| 🤔 CHECK à arbitrer avec mainteneur (seuils) | **2** | #2 (montant max), #13 (nb_max sup) |
| 🗑️ N/A si table DROP planned | 1 | #15 (mentions.url) |

### Migration consolidée proposée (Phase 2.3)

```sql
-- Bloc 1 : checks simples (à appliquer immédiatement, 0 violation en base)
ALTER TABLE cagnotte_transactions
  ADD CONSTRAINT cagnotte_transactions_montant_nonzero CHECK (montant <> 0),
  ADD CONSTRAINT cagnotte_transactions_description_nonempty CHECK (length(trim(description)) > 0);

ALTER TABLE periodes
  ADD CONSTRAINT periodes_montant_credit_positive CHECK (montant_credit >= 0),
  ADD CONSTRAINT periodes_ordre_positive CHECK (ordre > 0),
  ADD CONSTRAINT periodes_nom_nonempty CHECK (length(trim(nom)) > 0);

ALTER TABLE type_postes
  ADD CONSTRAINT type_postes_ordre_positive CHECK (ordre >= 0),
  ADD CONSTRAINT type_postes_titre_nonempty CHECK (length(trim(titre)) > 0);

ALTER TABLE repas
  ADD CONSTRAINT repas_nom_nonempty CHECK (length(trim(nom)) > 0);

ALTER TABLE config
  ADD CONSTRAINT config_key_nonempty CHECK (length(trim(key)) > 0);

ALTER TABLE benevoles
  ADD CONSTRAINT benevoles_prenom_nonempty CHECK (length(trim(prenom)) > 0),
  ADD CONSTRAINT benevoles_nom_nonempty CHECK (length(trim(nom)) > 0),
  ADD CONSTRAINT benevoles_cagnotte_consistency CHECK (
    (cagnotte_forcee = false AND cagnotte_forcee_type IS NULL)
    OR (cagnotte_forcee = true AND cagnotte_forcee_type IS NOT NULL)
  ),
  ADD CONSTRAINT benevoles_cagnotte_journee_has_days CHECK (
    cagnotte_forcee_type IS DISTINCT FROM 'journee'
    OR cardinality(cagnotte_forcee_jours) > 0
  );

-- Bloc 2 : checks pattern (à appliquer APRÈS Phase 2.4 + backfill telephone)
ALTER TABLE benevoles
  ADD CONSTRAINT benevoles_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  ADD CONSTRAINT benevoles_telephone_format CHECK (telephone ~ '^[+0-9 .-]{10,20}$');

ALTER TABLE orphan_relances
  ADD CONSTRAINT orphan_relances_telephone_format CHECK (
    telephone IS NULL OR telephone ~ '^[+0-9 .-]{10,20}$'
  );

-- Bloc 3 : seuils métier (après décision mainteneur)
-- ALTER TABLE cagnotte_transactions ADD CONSTRAINT cagnotte_transactions_montant_bound CHECK (abs(montant) <= 10000);
-- ALTER TABLE postes ADD CONSTRAINT postes_nb_max_bound CHECK (nb_max <= 200);
```

---

## Synthèse globale Phase 1.6

| Action Phase 2.3 | Compte | Bloqueur |
|---|---|---|
| `SET NOT NULL` sans backfill | **14** | — |
| `SET NOT NULL` avec backfill | **1** (`benevoles.telephone`) | Valeur de backfill à arbitrer (`'INCONNU'` vs reconstitution) |
| `ADD UNIQUE` sans bloqueur | **2** (`benevoles.(user_id, prenom, nom)`, `repas.nom`) | Vérifier 0 doublon avant migration |
| `ADD UNIQUE` à arbitrer | **2** (`postes.(periode_id, type_poste_id)`, `programme.(date_ref, heure)`) | Décision mainteneur |
| `ADD CHECK` simples | **11** | — |
| `ADD CHECK` pattern | **2** (email, téléphone) | Dépendances : Phase 2.4 + backfill |
| `ADD CHECK` à arbitrer (seuils) | **2** (montant max, nb_max max) | Décision mainteneur |

### Décisions mainteneur en attente avant Phase 2.3

1. **Backfill `benevoles.telephone`** : valeur sentinelle `'INCONNU'` ou tentative de reconstitution sur les 12 lignes manquantes ?
2. **UNIQUE `postes.(periode_id, type_poste_id)`** : est-ce que deux postes du même type dans la même période est un cas légitime ? Si non, contrainte ajoutée.
3. **UNIQUE `programme.(date_ref, heure)`** : idem, doublon possible ou non ?
4. **CHECK seuils** : `cagnotte_transactions.montant` max = 10 000 € ? `postes.nb_max` plafond = 200 ?
5. **Patron famille** (`benevoles.user_id` cardinalité 1:N) à documenter formellement dans `DATABASE.md` — confirmer que c'est bien la modélisation cible (et pas un bug à résoudre).

### Anomalie à classer dans `audit_db.md` (Phase 1.10)

- **MOYEN** : `benevoles.user_id` cardinalité 1:N non documentée hors migration archivée (cf. Partie 1.6.2).
- **BAS** : aucune contrainte d'intégrité cross-field sur `cagnotte_forcee` / `_type` / `_jours` aujourd'hui — l'app maintient la cohérence côté JS uniquement (cf. Partie 1.6.3 #10, #11).

---

## Méthodologie (reproductibilité)

```sql
-- (a) NOT NULL : compter les NULL par colonne nullable
SELECT 'table.col' AS col, COUNT(*) FILTER (WHERE col IS NULL), COUNT(*) FROM table;

-- (b) UNIQUE : détecter les doublons
SELECT col, COUNT(*) FROM table GROUP BY 1 HAVING COUNT(*) > 1;

-- (c) CHECK : détecter min/max/zéros sur numériques, longueurs sur texte
SELECT MIN(col), MAX(col), COUNT(*) FILTER (WHERE col = 0) FROM table;
SELECT MIN(length(col)), COUNT(*) FILTER (WHERE length(trim(col)) = 0) FROM table;

-- (d) Cross-field : vérifier 0 violation avant CHECK
SELECT COUNT(*) FROM benevoles WHERE cagnotte_forcee = true AND cagnotte_forcee_type IS NULL;

-- (e) CHECK existants (filtre correct par OID — cf. notes.md 2026-05-26)
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace;
```
