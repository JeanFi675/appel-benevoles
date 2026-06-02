# Audit 12 — Typage des colonnes

> Tâches Phase 1.5.x du `plan_refactoring.md`.
> Source : instance Supabase **locale** (`127.0.0.1:54322`), dump prod du 2026-05-25.
> Méthode : `information_schema.columns` + échantillonnage (cardinalité, longueur min/max/avg) + revue manuelle des conventions de typage Postgres modernes.

---

# Partie 1.5.1 — Colonnes `text` à typer plus strictement

## Périmètre

**19 colonnes `text`** détectées dans les tables de base de `public.*` (les vues sont exclues). Aucune colonne `varchar(n)` ni `character` n'a été trouvée.

> Convention Postgres moderne (cf. doc Supabase / wiki.postgresql.org/wiki/Don't_Do_This) : préférer `text + CHECK` à `varchar(n)`. La largeur fixe n'apporte aucun gain de performance. En conséquence, **aucune recommandation `varchar(n)`** n'est émise — les contraintes de longueur seront posées via `CHECK` en Phase 1.6.

## Tableau d'analyse

Légende : ✅ KEEP text = champ libre, conserver `text` ; 🎯 ENUM = candidat à conversion en `enum` Postgres ; 📧 EMAIL = conversion `citext` + CHECK ; 📞 PHONE = `text` + CHECK pattern.

| # | Colonne | NOT NULL | Cardinalité | Long. max | Échantillon | Recommandation | Justification |
|---|---|---|---|---|---|---|---|
| 1 | `benevoles.email` | ✅ | — | 33 | `…@gmail.com`, etc. | 📧 **`citext` + CHECK pattern email** | Email = identifiant de connexion ; doit être **case-insensitive** (`citext`) pour éviter les doublons (`Alice@x` vs `alice@x`). CHECK ajouté en Phase 1.6. Nécessite l'extension `citext` (déjà disponible sur Supabase). |
| 2 | `benevoles.prenom` | ✅ | — | 13 (max), 7 (avg) | "Marie", "Jean-Philippe" | ✅ KEEP `text` | Champ libre. Pas de format normalisé. CHECK longueur max raisonnable (ex : 100) à poser en Phase 1.6. |
| 3 | `benevoles.nom` | ✅ | — | 16 (max), 7 (avg) | "Dupont", "Müller-Schmidt" | ✅ KEEP `text` | Idem `prenom`. |
| 4 | `benevoles.telephone` | ⬜ | — | 14 (max), 10 (avg) | "0612345678", "+33612345678" | 📞 `text` + CHECK format | Format français + international. CHECK pattern `^[\+0-9 .-]{10,20}$` à poser en Phase 1.6. **Pas d'enum** (cardinalité infinie). |
| 5 | **`benevoles.taille_tshirt`** | ⬜ | **7** | 4 | `SANS`, `XS`, `S`, `M`, `L`, `XL`, `XXL` | 🎯 **ENUM `tshirt_size`** | Très faible cardinalité, valeurs strictement discrètes documentées dans CLAUDE.md. La présence de `SANS` (introduit par migration `20260226185500_tshirt_sans.sql`) est attendue. |
| 6 | **`benevoles.role`** | ✅ | **4 (présents) / 6 (documentés)** | 10 | `admin`, `admin-juge`, `benevole`, `referent` (+ `juge`, `officiel` documentés dans CLAUDE.md mais absents des données actuelles) | 🎯 **ENUM `role_type`** | Cf. CLAUDE.md : 6 rôles métiers documentés. Convertir en enum éliminera les bugs de typo. **Attention** : enum doit inclure les 6 valeurs documentées, pas seulement les 4 présentes dans les données. À croiser avec le code (`grep -r "'juge'"` etc.) en Phase 2.4. |
| 7 | **`benevoles.cagnotte_forcee_type`** | ⬜ | **2** | 7 | `journee`, `periode` | 🎯 **ENUM `cagnotte_forced_type`** | Très faible cardinalité, valeurs discrètes. Introduit récemment (commit `dd658ce feat: systeme de cagnotte forcee configurable`). NULL signifie « pas de cagnotte forcée » — l'enum reste compatible. |
| 8 | `cagnotte_transactions.description` | ⬜ | — | variable | "Crédit 10€ pour dégainés", etc. | ✅ KEEP `text` | Champ libre rédigé par le staff. |
| 9 | `config.key` | ✅ | 5 (et croît) | 23 | `cagnotte_active`, `tarif_cagnotte_journee`, `tarif_degaines_juge`, `tarif_degaines_officiel`, `tshirt_question_active` | ✅ KEEP `text` | Table KV par design — la liste des feature flags est appelée à croître. UNIQUE à poser en Phase 1.6 (probablement déjà PK, à vérifier). Un enum ici figerait l'extensibilité. |
| 10 | `mentions.title` | ✅ | — | — (table vide en dump) | n/a | ✅ KEEP `text` | Champ libre (mentions externes / presse). |
| 11 | `mentions.url` | ✅ | — | — | n/a | ✅ KEEP `text` (+ CHECK `^https?://` en 1.6) | URL libre ; format imposable via CHECK plutôt qu'enum. |
| 12 | `mentions.snippet` | ⬜ | — | — | n/a | ✅ KEEP `text` | Extrait libre. |
| 13 | `mentions.author` | ⬜ | — | — | n/a | ✅ KEEP `text` | Champ libre. |
| 14 | `orphan_relances.telephone` | ⬜ | — | 10 | numéro FR | 📞 `text` + CHECK format | Même traitement que `benevoles.telephone`. |
| 15 | `periodes.nom` | ✅ | — | 31 | "Samedi 16 mai - 06:30 / 09:00", etc. | ✅ KEEP `text` | Libellé libre (dates + créneaux variables par édition). |
| 16 | `programme.description` | ✅ | — | variable | descriptions du programme | ✅ KEEP `text` | Texte libre. |
| 17 | `repas.nom` | ✅ | 2 (actuel) | 13 | "Samedi soir", "Vendredi soir" | ✅ KEEP `text` | **PAS d'enum** : le commit `e0ba7bd feat: edition du nom des repas` confirme que ce champ est **éditable** par l'admin. Cardinalité faible aujourd'hui mais structurellement libre. |
| 18 | `type_postes.titre` | ✅ | 21 | 46 | "Accueil", "Buvette", etc. | ✅ KEEP `text` | Libellé libre, modifiable, varie par édition. |
| 19 | `type_postes.description` | ⬜ | — | — | description libre | ✅ KEEP `text` | Champ libre. |

## Synthèse Partie 1.5.1

| Catégorie | Compte | Colonnes |
|---|---|---|
| 🎯 **ENUM à créer** | **3** | `benevoles.role` (→ `role_type`), `benevoles.taille_tshirt` (→ `tshirt_size`), `benevoles.cagnotte_forcee_type` (→ `cagnotte_forced_type`) |
| 📧 **CITEXT (email)** | 1 | `benevoles.email` |
| 📞 **CHECK pattern téléphone** | 2 | `benevoles.telephone`, `orphan_relances.telephone` |
| ✅ KEEP `text` (champs libres) | 13 | toutes les autres |
| 🔄 **varchar(n)** | 0 | aucun (convention Postgres moderne) |

### Actions pour la Phase 2.4 (Conversion des typages)

1. Activer l'extension `citext` si absente : `CREATE EXTENSION IF NOT EXISTS citext;`
2. Créer 3 types `ENUM` :
   ```sql
   CREATE TYPE role_type AS ENUM ('benevole', 'referent', 'admin', 'juge', 'admin-juge', 'officiel');
   CREATE TYPE tshirt_size AS ENUM ('SANS', 'XS', 'S', 'M', 'L', 'XL', 'XXL');
   CREATE TYPE cagnotte_forced_type AS ENUM ('journee', 'periode');
   ```
3. Convertir les colonnes (avec `USING col::role_type`, etc.). Vérifier en amont qu'aucune valeur hors-enum n'existe dans les données.
4. Convertir `benevoles.email` en `citext`. Risque : doublons potentiels rendus visibles (ex : `User@x` et `user@x` existant simultanément) → audit pré-conversion requis.

### Validation préalable nécessaire (Phase 2)

- ⚠️ Pour `benevoles.role` : grep complet de `src/` et `supabase/functions/` pour identifier toutes les valeurs littérales utilisées par le code (s'assurer que les 6 valeurs documentées sont bien les seules), et **aucune autre**.
- ⚠️ Pour `benevoles.email` (citext) : `SELECT lower(email), COUNT(*) FROM benevoles GROUP BY 1 HAVING COUNT(*) > 1;` doit retourner 0 ligne avant conversion.

---

# Partie 1.5.2 — Timestamps sans timezone

## Périmètre

Inventaire de toutes les colonnes date/heure des tables de base du schéma `public` (vues exclues) : **21 colonnes** détectées.

## Résultats par type

| Type SQL | Nombre | Statut |
|---|---|---|
| `timestamp without time zone` | **0** | ✅ Aucune migration nécessaire |
| `timestamp with time zone` (`timestamptz`) | 17 | ✅ Conforme |
| `date` | 3 | ✅ Conforme (sémantique calendaire) |
| `time without time zone` | 1 | ⚠️ À analyser ponctuellement |

## Détail

### `timestamp with time zone` — 17 colonnes ✅

Toutes les colonnes d'horodatage applicatif sont déjà en `timestamptz`. Aucune action.

| Table.colonne | Default | Sémantique |
|---|---|---|
| `benevoles.created_at` | `now()` | Audit |
| `benevoles.updated_at` | `now()` | Audit |
| `benevoles.relance_sent_at` | — | Métier (date de relance) |
| `cagnotte_transactions.created_at` | `now()` | Audit |
| `config.updated_at` | `now()` | Audit |
| `inscriptions.created_at` | `now()` | Audit |
| `jours.created_at` | `now()` | Audit |
| `mentions.published_at` | `now()` | Métier (date de publication) |
| `mentions.created_at` | `now()` | Audit |
| `orphan_relances.relance_sent_at` | — | Métier |
| `periodes.created_at` | `now()` | Audit |
| `postes.periode_debut` | — | Métier (créneau de bénévolat) |
| `postes.periode_fin` | — | Métier (créneau de bénévolat) |
| `postes.created_at` | `now()` | Audit |
| `programme.created_at` | `now()` | Audit |
| `repas.created_at` | `now()` | Audit |
| `type_postes.created_at` | `now()` | Audit |

### `date` — 3 colonnes ✅

| Table.colonne | Recommandation | Justification |
|---|---|---|
| `jours.date_ref` | ✅ KEEP `date` | Identifiant calendaire d'une journée de compétition (PK logique). Pas d'heure ni de fuseau pertinent. |
| `programme.date_ref` | ✅ KEEP `date` | FK vers `jours.date_ref` — doit conserver le même type. |
| `type_postes.date_ref` | ✅ KEEP `date` | FK vers `jours.date_ref` — idem. |

### `time without time zone` — 1 colonne ⚠️

| Table.colonne | Recommandation | Justification |
|---|---|---|
| `programme.heure` | ✅ KEEP `time` | L'horaire seul (sans date) est correct pour un planning quotidien : l'association `(date_ref, heure)` reconstitue l'instant. La conversion en `timetz` n'apporterait rien car le championnat se déroule dans un fuseau unique (Europe/Paris). À garder, en documentant explicitement que l'application assume un fuseau unique côté front. **Aucune action en Phase 2.** |

## Synthèse Partie 1.5.2

- **Aucune migration `timestamp` → `timestamptz` nécessaire** : toutes les colonnes timestamp sont déjà au bon type. C'est probablement la conséquence des migrations historiques `20251207165000_fix_security_search_path.sql` / `20251223210000_fix_security_warnings.sql` (cf. dossier `migrations_archive_pre_refactor/`) où la convention a été appliquée à la création des tables.
- **Action Phase 2.4 (sur cette sous-tâche) : aucune** — la tâche du plan « Créer une migration qui convertit `timestamp` → `timestamptz` » devra être marquée `N/A — aucune colonne concernée`.

## Méthodologie (reproductibilité)

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND data_type IN ('timestamp without time zone','timestamp with time zone','date','time without time zone','time with time zone')
  AND table_name NOT IN (SELECT table_name FROM information_schema.views WHERE table_schema='public')
ORDER BY data_type, table_name, ordinal_position;
```

---

# Partie 1.5.3 — Booléens mal typés

## Périmètre

Recherche de colonnes booléennes stockées en `text`, `integer` ou autre type non-`boolean`, par triple croisement :
1. Heuristique de nommage : préfixes `is_*`, `has_*`, `est_*`, `a_*` ; suffixes `_actif`, `_active`, `_present`, `_paye`, `_envoye`, `_force`, `_forcee`, `_visible`, `_enabled`, `_confirme`, `_valide`, `_sent`, `_done`, `_cancelled`, `_deleted`, `_archived` ; noms directs (`actif`, `vegetarien`, …).
2. Faible cardinalité (≤ 2 valeurs distinctes) sur les colonnes `text` (croisé avec Partie 1.5.1).
3. Faible cardinalité sur les colonnes `integer` / `smallint` / `numeric` (croisé avec inventaire ci-dessous).

## Résultats

### Colonnes booléennes existantes — toutes au bon type ✅

| Table.colonne | NOT NULL | Default | Répartition (true/false/null) | Statut |
|---|---|---|---|---|
| `benevole_repas.vegetarien` | ✅ | `false` | 12 / 124 / 0 | ✅ `boolean` correct |
| `benevoles.cagnotte_forcee` | ✅ | `false` | 7 / 133 / 0 | ✅ `boolean` correct |
| `benevoles.presence_dimanche` | ⬜ | `false` | 12 / 128 / 0 | ✅ `boolean` correct |
| `benevoles.presence_samedi` | ⬜ | `false` | 13 / 127 / 0 | ✅ `boolean` correct |
| `benevoles.t_shirt_recupere` | ⬜ | `false` | 93 / 47 / 0 | ✅ `boolean` correct |

### Colonnes `integer` / `numeric` — aucun booléen déguisé ✅

| Table.colonne | Type | Sémantique | Statut |
|---|---|---|---|
| `cagnotte_transactions.montant` | `numeric` | Montant financier | ✅ Pas un booléen |
| `periodes.ordre` | `integer` | Ordre d'affichage | ✅ Pas un booléen |
| `periodes.montant_credit` | `numeric` | Montant crédité | ✅ Pas un booléen |
| `postes.nb_min` | `integer` | Compteur (capacité min) | ✅ Pas un booléen |
| `postes.nb_max` | `integer` | Compteur (capacité max) | ✅ Pas un booléen |
| `type_postes.ordre` | `integer` | Ordre d'affichage | ✅ Pas un booléen |

### Colonnes `text` à faible cardinalité — aucun booléen déguisé ✅

Croisement avec Partie 1.5.1 : les seules colonnes `text` à cardinalité ≤ 2 sont :
- `benevoles.cagnotte_forcee_type` (2 valeurs : `journee` / `periode`) — **enum**, pas un booléen (3 états avec NULL).
- `repas.nom` (2 valeurs au dump : `Samedi soir` / `Vendredi soir`) — texte libre éditable, pas un booléen.

## Synthèse Partie 1.5.3

- **0 booléen mal typé** détecté.
- Les 5 colonnes booléennes en base sont toutes correctement déclarées en `boolean`, avec `default false` et des données équilibrées (jamais 100% null ou 100% true/false → confirme un usage effectif).
- **Aucune action requise pour la Phase 2.4** sur cette sous-tâche.

## Méthodologie (reproductibilité)

```sql
-- Candidats par nommage + listing des booléens actuels
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name NOT IN (SELECT table_name FROM information_schema.views WHERE table_schema='public')
  AND (data_type='boolean'
    OR column_name ~* '^(is|has|est|a)_'
    OR column_name ~* '_(actif|active|present|paye|envoye|force|forcee|visible|enabled|confirme|confirmed|valide|valid|sent|done|cancelled|deleted|archived)$'
    OR column_name IN ('actif','active','confirme','valide','vegetarien','enabled','disabled','paye','sent','done'));

-- Inventaire des numériques pour exclure les booléens déguisés en 0/1
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND data_type IN ('integer','smallint','bigint','numeric');
```

---

# Partie 1.5.4 — Statuts/rôles à convertir en `enum`

## Périmètre

Approfondissement des 3 candidats enum identifiés en Partie 1.5.1 :
- `benevoles.role`
- `benevoles.taille_tshirt`
- `benevoles.cagnotte_forcee_type`

Vérifications additionnelles spécifiques aux statuts/rôles :
- Inventaire des `enum` Postgres déjà déclarés (`pg_type WHERE typtype='e'`).
- Valeurs autorisées **par les CHECK existants** vs valeurs **en données** vs valeurs **dans le code**.
- Stratégie de migration et points de vigilance.

## Enums déjà déclarés en base

| Schéma | Nom | Valeurs |
|---|---|---|
| `auth` | `aal_level` | `aal1, aal2, aal3` |
| `auth` | `code_challenge_method` | `s256, plain` |
| `auth` | `factor_status` | `unverified, verified` |
| `auth` | `factor_type` | `totp, webauthn, phone` |
| `auth` | `oauth_*` | (5 enums Supabase Auth) |
| `auth` | `one_time_token_type` | (6 valeurs) |
| `net` | `request_status` | `PENDING, SUCCESS, ERROR` |
| `public` | **`mention_platform`** | `fb, insta, web` |
| `public` | **`mention_status`** | `new, archived, pinned` |
| `realtime` | `action`, `equality_op` | … |
| `storage` | `buckettype` | `STANDARD, ANALYTICS, VECTOR` |

→ **2 enums `public.*` déjà existants** (`mention_platform`, `mention_status`) → la convention « enum pour statuts » est déjà appliquée pour la table `mentions`. Les 3 nouveaux enums suivront le même patron.

## ⚠️ Correction de la Partie 1.5.1

La Partie 1.5.1 indiquait « aucun CHECK sur les colonnes texte ». **C'était faux** — bug du filtre SQL utilisé (cf. `audit/notes.md` 2026-05-26 « Bug requête CHECK constraints »). Les CHECK constraints suivantes **existent déjà** :

| CHECK | Valeurs autorisées |
|---|---|
| `benevoles_role_check` | `'benevole', 'referent', 'admin', 'juge', 'admin-juge', 'officiel'` |
| `benevoles_taille_tshirt_check` | `'XS', 'S', 'M', 'L', 'XL', 'XXL', 'SANS'` |
| `benevoles_cagnotte_forcee_type_check` | `'journee', 'periode'` |
| `capacite_valide` (postes) | `nb_max >= nb_min AND nb_min > 0` |
| `periode_valide` (postes) | `periode_fin > periode_debut` |

**Conséquence sur les recommandations enum** : la conversion `text → enum` reste recommandée, mais sa **motivation change** :
- Avant : « combler un trou de sécurité » (faux).
- Après : « améliorer le typage » (gain : intégrité au niveau du type, meilleure introspection, ergonomie PL/pgSQL, économie de stockage ~50%).

## Tableau d'analyse détaillé

### 1. `benevoles.role` → ENUM `public.role_type`

| Source | Valeurs |
|---|---|
| CHECK constraint actuel | `benevole, referent, admin, juge, admin-juge, officiel` (6) |
| Données présentes en local | `admin, admin-juge, benevole, referent` (4 ; `juge` et `officiel` absents) |
| Code `src/` (littéraux trouvés) | `admin, referent, benevole` (3 — pas de `juge`/`admin-juge`/`officiel` en frontend) |
| Fonctions DB référençant les rôles "extra" | `is_admin_juge()`, `get_family_tshirt_info_smart()` |
| RLS référençant | `Admin-juges can update juges` (sur table `benevoles`) |
| Migrations archivées récentes | `20260225164500_add_juges_system`, `20260225172500_add_admin_juge`, `20260226180000_add_officiel_role`, `20260525040000_remove_juges_officiels` (datée 2026-05-25, archivée non rejouée) |

⚠️ **Bloqueur identifié** : la migration archivée `20260525040000_remove_juges_officiels.sql` supprime ces 3 rôles ; statut prod ambigu. **Décision mainteneur requise avant la Phase 2.4** — note ajoutée à `audit/notes.md`.

**Stratégie de migration (Phase 2.4)** :
- Pré-requis : confirmation mainteneur sur la liste finale des rôles (3 ou 6).
- `CREATE TYPE public.role_type AS ENUM (...);`
- `ALTER TABLE benevoles ALTER COLUMN role TYPE role_type USING role::role_type;`
- `DROP CONSTRAINT benevoles_role_check;` (devenu redondant).
- NULL : interdit (colonne déjà `NOT NULL`).
- Default : à conserver (probablement `'benevole'` à vérifier).

### 2. `benevoles.taille_tshirt` → ENUM `public.tshirt_size`

| Source | Valeurs |
|---|---|
| CHECK constraint actuel | `XS, S, M, L, XL, XXL, SANS` (7) |
| Données présentes | `L, M, S, SANS, XL, XS, XXL` (7, identique) |
| Code `src/` | `'SANS'` (1 référence : `tshirt.js:34` filtre `!== 'SANS'`) |

✅ **Pas d'ambiguïté** : 7 valeurs, parfaite cohérence base/CHECK/code.

**Stratégie de migration (Phase 2.4)** :
- `CREATE TYPE public.tshirt_size AS ENUM ('SANS', 'XS', 'S', 'M', 'L', 'XL', 'XXL');` (ordre = taille croissante, `SANS` à part en début).
- `ALTER TABLE benevoles ALTER COLUMN taille_tshirt TYPE tshirt_size USING taille_tshirt::tshirt_size;`
- `DROP CONSTRAINT benevoles_taille_tshirt_check;`
- NULL : autorisé (colonne actuellement NULL-able).
- Default : aucun.

### 3. `benevoles.cagnotte_forcee_type` → ENUM `public.cagnotte_forced_type`

| Source | Valeurs |
|---|---|
| CHECK constraint actuel | `journee, periode` (2) |
| Données présentes | `journee, periode` (2, identique) |
| Code `src/` | `'journee'`, `'periode'` (multiples occurrences, cohérent) |

✅ **Pas d'ambiguïté** : 2 valeurs, parfaite cohérence.

**Stratégie de migration (Phase 2.4)** :
- `CREATE TYPE public.cagnotte_forced_type AS ENUM ('journee', 'periode');`
- `ALTER TABLE benevoles ALTER COLUMN cagnotte_forcee_type TYPE cagnotte_forced_type USING cagnotte_forcee_type::cagnotte_forced_type;`
- `DROP CONSTRAINT benevoles_cagnotte_forcee_type_check;`
- NULL : autorisé (signifie « pas de cagnotte forcée »).
- Default : aucun.

## Synthèse Partie 1.5.4

| Enum cible | Valeurs | Bloqueur | Action Phase 2.4 |
|---|---|---|---|
| `role_type` | 3 ou 6 (à arbitrer) | ⚠️ Statut migration `remove_juges_officiels` | À traiter **après décision mainteneur** |
| `tshirt_size` | 7 | — | ✅ Migration directe |
| `cagnotte_forced_type` | 2 | — | ✅ Migration directe |

**Bénéfices attendus** :
- Stockage : 4 octets/ligne au lieu de la longueur du label (économie marginale sur 140 lignes, mais bonne pratique).
- Typage : élimination définitive des typos non détectées (`'Admin'` vs `'admin'`).
- Introspection : `pg_enum` exposé via `information_schema` → meilleur tooling Postman/Studio.
- Migrations futures : ajouter une valeur via `ALTER TYPE ... ADD VALUE` (plus propre que `DROP CONSTRAINT ... CHECK (... IN ...)`).

**Aucune action requise** sur d'autres colonnes que les 3 ci-dessus : aucune autre colonne `text` du schéma n'a la sémantique d'un statut/rôle.

## Méthodologie (reproductibilité)

```sql
-- Enums existants
SELECT n.nspname, t.typname, ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace
GROUP BY n.nspname, t.typname;

-- CHECK constraints public (filtre CORRECT)
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace;

-- Fonctions DB référençant des valeurs de rôle
SELECT proname FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND prosrc ~* '''juge''|''officiel''|''admin-juge''';
```

---

## Méthodologie globale (reproductibilité Partie 1.5.1)

```sql
-- Liste des colonnes text/varchar du schéma public
SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND data_type IN ('text','character varying','character')
  AND table_name NOT IN (SELECT table_name FROM information_schema.views WHERE table_schema='public');

-- Cardinalité d'une colonne candidate à enum
SELECT COUNT(DISTINCT col), MAX(LENGTH(col)), STRING_AGG(DISTINCT col, ',' ORDER BY col)
FROM public.<table>;

-- CHECK constraints actuels (audit complémentaire — aucun trouvé sur les colonnes ci-dessus)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype='c' AND conrelid::regclass::text LIKE 'public.%';
```
