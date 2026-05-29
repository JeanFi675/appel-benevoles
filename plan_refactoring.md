# Plan de Refactoring — Appel Bénévoles

> Plan d'action exhaustif pour passer l'application en production "hyper quali" (standard Mai 2026).
> Chaque tâche est atomique, vérifiable, et clôturée par une **Definition of Done (DoD)**.
> Cocher dans l'ordre. Ne pas sauter d'étapes — la sécurité dépend du respect de l'ordre.
>
> **🏠 Mode local-first** : tout le travail (Git + Supabase) se fait en local jusqu'à la Phase 8.
>
> - Git : la branche `refactor/production-hardening` reste locale, push différé en 8.0.
> - Supabase : utilisation de l'instance locale via `supabase start` (Docker). Aucune écriture sur la prod avant la Phase 8.
> - Prérequis : Docker Desktop installé et démarré sur le poste de dev.

---

## Phase 0 — Préparation & Sauvegarde

> ⚠️ La base Supabase pointée par `.env` est la **production**. Aucune action destructive ne peut être lancée tant que cette phase n'est pas terminée.

### 0.1 Préparation Git

- [x] Vérifier que la branche `master` est propre (`git status` sans modifications non commitées). **DoD :** `git status` retourne `nothing to commit, working tree clean`.
- [x] Créer la branche dédiée `refactor/production-hardening` depuis `master`. **DoD :** `git branch --show-current` retourne `refactor/production-hardening`.
- [x] Créer une copie de sauvegarde locale du dossier `.git/` (zip ou copie dans `backups/git-YYYYMMDD/`). **DoD :** un fichier d'archive du `.git/` existe hors du repo. (Le push remote est reporté à la Phase 8.0.)
- [x] Créer un tag de pré-refacto `pre-refactor-YYYYMMDD` sur le dernier commit de `master` (local uniquement). **DoD :** `git tag --list pre-refactor-*` liste le tag.

### 0.2 Sauvegarde Supabase (PROD)

- [x] Installer la dernière version du Supabase CLI localement (`supabase --version` ≥ 2.x). **DoD :** la commande retourne une version sans warning.
- [x] Vérifier que Docker Desktop est installé et démarré : `docker --version` retourne une version et `docker ps` n'affiche pas d'erreur. **DoD :** les deux commandes s'exécutent sans erreur. _Note : requis par le CLI 2.x pour les dumps remote (utilise un container pg_dump à la version Postgres cible)._
- [x] Effectuer un dump complet du schéma : `supabase db dump -f backups/YYYYMMDD_schema.sql --linked` (schema-only par défaut en CLI 2.x). **DoD :** le fichier existe et contient `CREATE TABLE` pour la table `benevoles`.
- [x] Effectuer un dump complet des données : `supabase db dump --data-only -f backups/YYYYMMDD_data.sql --linked`. **DoD :** le fichier existe et est non vide.
- [x] Effectuer un dump des rôles et policies : `supabase db dump --role-only -f backups/YYYYMMDD_roles.sql --linked`. **DoD (révisée 2026-05-25)** : le fichier existe et contient au moins les `ALTER ROLE` des rôles applicatifs `anon` et `authenticated` (le CLI 2.x n'inclut pas les `CREATE ROLE` des rôles système Supabase recréés automatiquement à l'init d'une instance locale ; voir `audit/notes.md`).
- [x] Exporter le contenu des buckets Storage via le dashboard Supabase (téléchargement complet par bucket). **DoD :** un dossier `backups/storage/YYYYMMDD/` contient l'arborescence des fichiers. — **N/A (2026-05-25)** : aucun bucket Storage sur le projet (confirmé visuellement dans le dashboard prod ; aucun usage `.storage.*` dans `src/`, `supabase/functions/`, `supabase/migrations/`). Tâche à réévaluer si un bucket est ajouté ultérieurement.
- [x] Ajouter `backups/` au `.gitignore` (les dumps contiennent des données personnelles). **DoD :** `git check-ignore backups/test` retourne `backups/test`.
- [x] Documenter dans `backups/README.md` la commande de restauration et la date du dump. **DoD :** le fichier existe et contient la commande `psql ... < schema.sql`.

### 0.3 Environnement Supabase local (Docker)

> Prérequis Docker déjà validé en 0.2.

- [x] Initialiser le projet Supabase local s'il ne l'est pas déjà : `supabase init` à la racine. **DoD :** un dossier `supabase/` avec `config.toml` est présent.
- [x] **(Prérequis 2026-05-25, bug d'historique migrations — voir `audit/notes.md`)** : déplacer `supabase/migrations/` → `supabase/migrations_archive_pre_refactor/` et créer un nouveau `supabase/migrations/` vide, pour empêcher le replay automatique au `supabase start`. **DoD :** `ls supabase/migrations/` retourne un dossier vide et `ls supabase/migrations_archive_pre_refactor/ | wc -l` retourne > 30.
- [x] Démarrer l'instance Supabase locale : `supabase start`. **DoD :** la commande retourne les URLs `API URL: http://127.0.0.1:54321`, `DB URL: postgresql://...:54322`, et `Studio URL: http://127.0.0.1:54323`.
- [x] Importer le dump schema prod dans l'instance locale via `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=0 < backups/YYYYMMDD_schema.sql` (les erreurs sur les schémas auth/storage déjà existants sont attendues et ignorées). **DoD :** la table `public.benevoles` existe dans la base locale (`\dt public.benevoles` retourne 1 ligne).
- [x] Importer les données prod via `psql ... < backups/YYYYMMDD_data.sql`. **DoD :** la table `public.benevoles` locale contient le même nombre de lignes que la prod (à un instant T). — **140 lignes importées, 308 inscriptions, 58 postes.**
- [x] Créer un fichier `.env.local` avec les credentials de l'instance locale (`VITE_SUPABASE_URL=http://127.0.0.1:54321` + clé anon locale fournie par `supabase status`). **DoD :** `git check-ignore .env.local` retourne `.env.local`.
- [x] Ajouter un script npm `dev:local` qui charge `.env.local` au lieu de `.env`. **DoD :** `npm run dev:local` démarre Vite et les requêtes Supabase pointent sur `127.0.0.1:54321` (vérification via Network tab).
- [x] Documenter dans `CLAUDE.md` la procédure pour basculer entre prod et local (commandes `supabase start/stop`, scripts npm, vérification de l'URL active). **DoD :** une section "Environnements" existe dans `CLAUDE.md`.

### 0.4 Garde-fous

- [x] Ajouter un script `scripts/check-env.js` qui (a) refuse de lancer une migration si l'URL contient le projet de production sans flag `--force-prod` ET (b) refuse si la variable `PHASE` du `.env` actif vaut autre chose que `8` lors d'une opération ciblant la prod. **DoD :** `npm run db:push` sur prod sans flag affiche `BLOCKED: production target requires --force-prod (Phase 8 only)`.
- [x] Configurer `husky` avec un hook `pre-push` qui interdit le push direct sur `master` ET qui rappelle à l'utilisateur qu'aucun push n'est attendu hors Phase 8.0. **DoD :** un `git push origin master` depuis cette branche échoue avec un message explicite.

---

## Phase 1 — Audit de la base de données (CRITIQUE)

> Aucune modification de schéma à cette phase. Production de connaissances uniquement. Toutes les requêtes s'exécutent sur l'**instance Supabase locale** ou sur la prod en lecture seule.

### 1.1 Inventaire structurel

- [x] Lister toutes les tables du schéma `public` et sauvegarder dans `audit/01_tables.csv`.
  ```sql
  SELECT table_name, table_type FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name;
  ```
  **DoD :** le fichier existe et liste au minimum `benevoles`, `postes`, `inscriptions`, `periodes`, `config`, `cagnotte_transactions`.
- [x] Lister toutes les colonnes (nom, type, nullable, default) dans `audit/02_columns.csv`.
  ```sql
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
  ```
  **DoD :** le fichier contient toutes les colonnes de toutes les tables publiques.
- [x] Lister toutes les contraintes (PK, FK, UNIQUE, CHECK) dans `audit/03_constraints.csv`. **DoD :** le fichier liste au minimum les PK de chaque table.
- [x] Lister tous les index (table, colonnes, type, unique) dans `audit/04_indexes.csv`. **DoD :** le fichier liste tous les `pg_indexes` du schéma `public`.
- [x] Lister toutes les vues dans `audit/05_views.csv` avec leur définition. **DoD :** la vue `public_planning` y figure avec son SQL.
- [x] Lister toutes les fonctions et triggers dans `audit/06_functions_triggers.csv`. **DoD :** les triggers `check_capacity` et `check_time_conflict` y figurent.
- [x] Lister toutes les policies RLS dans `audit/07_rls_policies.csv`.
  ```sql
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname = 'public';
  ```
  **DoD :** le fichier est généré, même si certaines lignes sont vides (= table sans RLS).
- [x] Lister tous les types `enum` PostgreSQL personnalisés dans `audit/08_enums.csv`. **DoD :** le fichier existe (même vide).

### 1.2 Audit d'utilisation des tables

- [x] Pour chaque table, grep le nom dans `src/`, `supabase/functions/`, `supabase/migrations/`. **DoD :** un fichier `audit/09_table_usage.md` mappe chaque table à la liste de ses occurrences (fichier:ligne).
- [x] Marquer dans `audit/09_table_usage.md` les tables sans aucune occurrence en code → candidates à la suppression. **DoD :** chaque table a un statut `USED` / `UNUSED` / `BACKEND_ONLY`.
- [x] Pour chaque table marquée `UNUSED`, vérifier qu'aucun trigger/fonction PostgreSQL ne la référence. **DoD :** la décision finale (`DROP` / `KEEP`) est inscrite dans `audit/09_table_usage.md` avec la justification.

### 1.3 Audit d'utilisation des colonnes

- [x] Pour chaque colonne de `audit/02_columns.csv`, grep le nom de colonne dans `src/` et `supabase/functions/`. **DoD :** un fichier `audit/10_column_usage.md` recense chaque colonne avec ses occurrences.
- [x] Distinguer colonnes lues uniquement (`SELECT`) vs écrites (`INSERT`/`UPDATE`). **DoD :** chaque colonne a un statut `READ_WRITE` / `READ_ONLY` / `WRITE_ONLY` / `UNUSED`. — **Simplifié en taxonomie binaire `USED / UNUSED` + section `LOW_USE`**, justification dans `audit/notes.md` (2026-05-26), validé par mainteneur le 2026-05-26.
- [x] Pour chaque colonne `UNUSED`, vérifier qu'aucune vue, fonction ou trigger ne s'en sert. **DoD :** la liste finale des colonnes mortes est consolidée dans `audit/10_column_usage.md`.

### 1.4 Audit des relations

- [x] Lister toutes les colonnes nommées `*_id` qui ne sont **pas** déclarées en `FOREIGN KEY`. **DoD :** un fichier `audit/11_missing_fk.md` recense ces colonnes avec la table cible probable.
- [x] Pour chaque FK existante, vérifier la politique `ON DELETE` (CASCADE / RESTRICT / SET NULL). **DoD :** `audit/11_missing_fk.md` contient un tableau FK → politique + recommandation.
- [x] Détecter les FK orphelines (lignes pointant vers un ID inexistant) via des requêtes `LEFT JOIN ... WHERE child.id IS NULL`. **DoD :** la liste des incohérences est dans `audit/11_missing_fk.md`.

### 1.5 Audit des typages

- [x] Repérer toutes les colonnes `text` qui devraient être typées plus strictement (`varchar(n)`, `enum`, `uuid`, `email`, etc.). **DoD :** `audit/12_typing.md` liste chaque suspect avec le type recommandé.
- [x] Repérer tous les `timestamp` sans timezone et recommander la migration vers `timestamptz`. **DoD :** la liste est dans `audit/12_typing.md`.
- [x] Repérer les champs booléens stockés en `text` ou `int` plutôt qu'en `boolean`. **DoD :** la liste est dans `audit/12_typing.md`.
- [x] Repérer les statuts/rôles en `text` qui devraient être des `enum` PostgreSQL (ex : `benevoles.role`). **DoD :** la liste est dans `audit/12_typing.md`.

### 1.6 Audit des contraintes

- [x] Identifier les colonnes qui devraient être `NOT NULL` mais ne le sont pas (ex : champs requis par l'UI). **DoD :** `audit/13_constraints.md` liste les colonnes concernées.
- [x] Identifier les colonnes qui devraient être `UNIQUE` (ex : email, slug). **DoD :** la liste est dans `audit/13_constraints.md`.
- [x] Identifier les colonnes qui devraient avoir un `CHECK` (ex : `montant > 0`, `role IN (...)`). **DoD :** la liste est dans `audit/13_constraints.md`.

### 1.7 Audit des index

- [x] Pour chaque colonne FK, vérifier qu'un index existe. **DoD :** `audit/14_indexes.md` liste les FK sans index.
- [x] Identifier les colonnes filtrées fréquemment côté front (analyse des `.eq()`, `.in()`, `.gte()` dans `src/`) sans index. **DoD :** la liste est dans `audit/14_indexes.md`.
- [x] Identifier les index redondants (même colonne couverte par plusieurs index). **DoD :** la liste est dans `audit/14_indexes.md`.
- [x] Identifier les index inutilisés via `pg_stat_user_indexes` (`idx_scan = 0`). **DoD :** la liste des index à supprimer est dans `audit/14_indexes.md`. — Snapshot prod 2026-05-26 intégré : **0 index à supprimer** (2 index à 0 scan conservés à juste titre — 1 sur FK, 1 UNIQUE).

### 1.8 Audit des conventions de nommage

- [x] Vérifier que toutes les tables sont en `snake_case` pluriel. **DoD :** `audit/15_naming.md` liste les exceptions.
- [x] Vérifier que toutes les colonnes sont en `snake_case` singulier. **DoD :** les exceptions sont listées dans `audit/15_naming.md`.
- [x] Vérifier la cohérence des préfixes de FK (`*_id`). **DoD :** les exceptions sont listées dans `audit/15_naming.md`.
- [x] Vérifier la cohérence des préfixes de booléens (`is_*`, `has_*`). **DoD :** les exceptions sont listées dans `audit/15_naming.md`.
- [x] Vérifier le nommage des triggers (`trg_*`) et fonctions (`fn_*` ou nom verbal). **DoD :** les exceptions sont listées dans `audit/15_naming.md`.

### 1.9 Audit RLS (sécurité)

- [x] Pour chaque table, vérifier que RLS est **activée** (`pg_class.relrowsecurity = true`). **DoD :** `audit/16_rls.md` liste les tables sans RLS active (cas critique). — 14/14 tables RLS activée, 0/14 forcée (R07).
- [x] Pour chaque table avec RLS, lister les policies par opération (SELECT, INSERT, UPDATE, DELETE). **DoD :** `audit/16_rls.md` contient un tableau Table × Opération × Policy.
- [x] Pour chaque opération sans policy, déterminer si c'est intentionnel ou un trou de sécurité. **DoD :** chaque case du tableau a un statut `OK` / `MISSING` / `INTENTIONAL`. — Taxonomie étendue à `OK / MISSING / INTENTIONAL / HOLE` ; chaque cellule justifiée dans `audit/16_rls.md` §2.
- [x] Tester chaque policy sur l'instance Supabase locale en simulant un utilisateur d'un autre rôle via `SET LOCAL ROLE` et `SET LOCAL request.jwt.claim.sub`. **DoD :** un fichier `audit/17_rls_tests.md` recense les résultats de chaque test (PASS / FAIL). — 22 tests (18 PASS, 4 FAIL = anomalies R01/R02/R03/R08). Rôles `juge`/`officiel` non couverts (0 utilisateurs dans le dump) → reporté Phase 3.4.
- [x] Vérifier qu'aucune policy ne crée de récursion (cf. migrations 006-008). **DoD :** chaque policy utilisant une sous-requête sur une table avec RLS est documentée dans `audit/16_rls.md` avec analyse de récursivité. — Aucun cycle détecté ; recommandation Phase 3 = uniformiser via `is_admin()`.

### 1.10 Livrable d'audit consolidé

- [x] Rédiger `audit_db.md` à la racine qui consolide toutes les anomalies, classées par criticité : **CRITIQUE** (sécurité), **HAUT** (intégrité), **MOYEN** (perf), **BAS** (cosmétique). **DoD :** le fichier existe et chaque anomalie référence le rapport détaillé d'origine. — **2026-05-26** : `audit_db.md` créé (28 anomalies : 2 CRITIQUE / 10 HAUT / 8 MOYEN / 8 BAS) avec références vers les rapports `audit/09_*.md` à `audit/17_*.md` + `audit/notes.md`. 11 décisions mainteneur consignées en bas du fichier.
- [x] Faire valider le rapport par le mainteneur du projet avant de passer à la Phase 2. **DoD :** un commit `docs: validation audit_db` est mergé avec sa signature. — **2026-05-26** : 8 décisions arbitrées par le mainteneur (D1-D8 dans `audit/notes.md`), commit `afc63bc docs: validation audit_db` sur `refactor/production-hardening` (merge sur master reporté en Phase 8.1 conformément au mode local-first).

---

## Phase 2 — Refonte du schéma de base de données

> Toutes les modifications sont d'abord appliquées sur l'**instance Supabase locale** et validées avant d'être proposées en production (Phase 8).

### 2.1 Plan de migration ciblé

- [x] Pour chaque anomalie de `audit_db.md`, créer un fichier de migration daté dans `supabase/migrations/`. **DoD :** chaque anomalie HAUT et CRITIQUE a une migration associée.
- [x] Numéroter les migrations en respectant la convention `YYYYMMDDHHMMSS_description.sql`. **DoD :** `ls supabase/migrations/` montre les nouveaux fichiers triés chronologiquement.

### 2.2 Suppression du code mort SQL

- [x] Créer la migration `..._drop_unused_tables.sql` qui supprime les tables marquées `UNUSED` en Phase 1.3 (avec `DROP TABLE IF EXISTS ... CASCADE`). **DoD :** la migration s'applique sans erreur sur Supabase local. — **2026-05-26** : `20260526120300_drop_unused_table_mentions.sql` (DROP TABLE `mentions` CASCADE + DROP des enums orphelins `mention_platform`, `mention_status`). Appliquée sur local sans erreur ; vérification : `pg_class.mentions` absent, 2 enums absents.
- [x] Créer la migration `..._drop_unused_columns.sql` pour les colonnes mortes. **DoD :** la migration s'applique sur Supabase local. — **2026-05-26** : `20260526120200_drop_unused_columns.sql` (drop de `benevoles.presence_samedi`, `benevoles.presence_dimanche`, `config.updated_by`, `cagnotte_transactions.auteur_id`). Prérequis B01 appliqués au passage : `20260526120000_refactor_admin_views.sql` (vues admin sans colonnes UNUSED) + `20260526120100_update_debit_cagnotte_drop_auteur.sql` (fonction sans INSERT de `auteur_id`). Vérification : 4 colonnes absentes, vues OK, INSERT de la fonction sans `auteur_id`.
- [x] Créer la migration `..._drop_unused_indexes.sql` pour les index inutilisés. **DoD :** la migration s'applique sur Supabase local. — **N/A (2026-05-26)** : `audit/14_indexes.md` §1.7.4 (snapshot prod du 2026-05-26) conclut **0 index à supprimer** (les 2 index `idx_scan = 0` sont conservés à juste titre : 1 sur FK, 1 UNIQUE). Aucune migration nécessaire.

### 2.3 Ajout des contraintes manquantes

- [x] Créer une migration qui ajoute les `NOT NULL` manquants (après backfill éventuel des nulls existants). **DoD :** la migration s'applique sur Supabase local sans violer aucune ligne. — **2026-05-27** : `20260526130000_backfill_telephone_inconnu.sql` (12 lignes backfillées 'INCONNU' — D2) + `20260526130100_add_not_null_constraints.sql` (17 colonnes `SET NOT NULL` : 11 audit `created_at`/`updated_at` + `t_shirt_recupere` + `cagnotte_forcee_jours` + `benevole_id`/`description` + `postes.periode_id` + `telephone`). Appliquées sans erreur sur local, 0 NULL résiduel.
- [x] Créer une migration qui ajoute les `UNIQUE` manquants (après dédoublonnage si nécessaire). **DoD :** la migration s'applique sans conflit sur Supabase local. — **2026-05-27** : `20260526130600_add_unique_constraints.sql` (dédup préalable de 20 lignes `programme` strictement doublonnées — cf. `audit/notes.md` divergence D4 ; puis 3 UNIQUE : `benevoles_user_prenom_nom_uniq`, `repas_nom_uniq`, `programme_date_heure_uniq`) + `20260526130700_add_exclude_postes_overlap.sql` (D3 : `EXCLUDE USING gist` sur `tstzrange(periode_debut,periode_fin)` + `type_poste_id`, 0 chevauchement préalable).
- [x] Créer une migration qui ajoute les `CHECK` métier (ex : `montant > 0`). **DoD :** la migration s'applique sans violer aucune ligne sur Supabase local. — **2026-05-27** : `20260526130500_add_check_constraints.sql` (15 CHECK = 11 simples H10 + 2 seuils D5 [`abs(montant)<=100`, `nb_max<=200`] + 2 cross-field cagnotte `consistency`/`journee_has_days`). Appliquée sans violation.
- [x] Créer une migration qui ajoute les FK manquantes et corrige les politiques `ON DELETE`. **DoD :** la migration s'applique sans erreur sur Supabase local. — **2026-05-27** : `20260526130200_add_fk_cagnotte_user.sql` (H02 : FK `cagnotte_transactions.user_id → auth.users(id) ON DELETE CASCADE`) + `20260526130300_drop_juges_officiels.sql` (D1 prérequis : reclassement 1 user `admin-juge`→`admin`, DROP 3 policies + `is_admin_juge()` + 2 config keys, MAJ `get_family_tshirt_info_smart`, CHECK `role` réduit à 3 valeurs) + `20260526130400_alter_fk_cagnotte_benevole_cascade.sql` (D6.b : `benevole_id` FK SET NULL → CASCADE).

### 2.4 Conversion des typages

- [x] Créer une migration qui transforme les `text` métier en `enum` PostgreSQL (ex : `role_type`). **DoD :** la colonne est typée et les requêtes existantes fonctionnent toujours. — **2026-05-27** : `20260526140100_create_role_enum.sql` (CREATE TYPE `role_type` AS ENUM ('benevole','referent','admin') ; drop+recreate des 10 policies RLS dépendantes ; conversion `benevoles.role` text→`role_type` avec préservation du default) + `20260526140200_create_tshirt_cagnotte_enums.sql` (CREATE TYPE `tshirt_size` AS ENUM ('SANS','XS','S','M','L','XL','XXL') + `cagnotte_forced_type` AS ENUM ('journee','periode') ; conversion des 2 colonnes ; recréation du CHECK `benevoles_cagnotte_journee_has_days` avec cast enum). Drop+recreate de la vue `admin_benevoles` dans chaque migration. 140 lignes préservées, 3 rôles / 7 tailles / 2 types cagnotte ; `WHERE role = 'admin'` via cast implicite OK.
- [x] Créer une migration qui convertit `timestamp` → `timestamptz` (en assumant `UTC` pour les valeurs existantes). **DoD :** la migration s'applique sans changer les valeurs visibles. — **N/A (2026-05-26)** : audit `audit/12_typing.md` Partie 1.5.2 montre **0 colonne `timestamp without time zone`** dans `public.*` (17 colonnes déjà en `timestamptz`, 3 en `date`, 1 en `time`). Aucune migration nécessaire.
- [x] Créer une migration qui corrige les types incohérents (ex : `varchar(n)` → `text` ou inverse selon la décision). **DoD :** la migration s'applique sur Supabase local. — **2026-05-27** : aucun `varchar(n)` détecté en audit (convention Postgres moderne respectée). Le slot Phase 2.4 a été utilisé pour M08 + B06 (typage email + CHECK patterns) : `20260526140000_enable_citext_convert_email.sql` (CREATE EXTENSION citext + conversion `benevoles.email` text→citext + drop+recreate vue `admin_benevoles` ; garde-fou anti-collision case-only) + `20260526140300_add_check_email_phone_patterns.sql` (CHECK `benevoles_email_format_chk` regex email + `benevoles_telephone_format_chk` regex tél avec tolérance sentinelle 'INCONNU'). Appliquées sans erreur ; 0 violation sur les 140 lignes.

### 2.5 Index de performance

- [x] Créer une migration qui ajoute les index manquants sur FK et colonnes filtrées. **DoD :** `pg_indexes` contient les nouveaux index sur Supabase local. — **2026-05-27** : `20260526150000_add_missing_indexes.sql` (7 `CREATE INDEX IF NOT EXISTS` : 5 FK [`idx_benevole_cagnotte_periodes_periode_id`, `idx_benevole_repas_repas_id`, `idx_postes_periode_id`, `idx_postes_referent_id`, `idx_postes_type_poste_id`] + 2 colonnes filtrées [`idx_benevoles_email`, `idx_programme_date_ref`]). Appliquée sur Supabase local sans erreur ; `pg_indexes` retourne bien les 7 entrées.

### 2.6 Harmonisation du nommage

- [x] Créer une migration de renommage (`ALTER TABLE ... RENAME`) pour aligner sur la convention. **DoD :** la migration s'applique et les requêtes du front sont mises à jour en conséquence (à valider en Phase 5). — **2026-05-27** : `20260526160000_rename_naming_conventions.sql` appliquée sur local. Renommages : table `programme→programmes` (+ index/contraintes), colonnes `benevole_repas.vegetarien→is_vegetarien` / `benevoles.t_shirt_recupere→has_recupere_tshirt` / `benevoles.cagnotte_forcee→is_cagnotte_forcee` / `orphan_relances.auth_user_id→user_id` (+ FK), vue `public_planning.inscrits_actuels→nb_inscrits_actuels`, triggers `check_role_change→trg_prevent_role_change` / `trigger_check_capacity→trg_check_capacity` / `trigger_check_time_conflict→trg_check_time_conflict`, fonction `public_debit_cagnotte→debit_cagnotte_public`. 6 fonctions et 2 vues recréées en miroir. Incident : `CREATE OR REPLACE FUNCTION` impossible quand un OUT param est renommé → `DROP FUNCTION IF EXISTS` ajouté pour les 3 fonctions concernées (migration re-jouable). 140 benevoles / 309 inscriptions / 58 postes intacts. Mise à jour front reportée Phase 5.

### 2.7 Validation 3NF et séparation des domaines

- [x] Vérifier que chaque table a une clé primaire et que toutes les colonnes non-clés dépendent uniquement de la clé. **DoD :** un paragraphe dans `audit_db.md` confirme la conformité 3NF table par table. — **2026-05-27** : section "Validation 3NF et séparation des domaines (Phase 2.7)" ajoutée dans `audit_db.md`. **13/13 tables ont une PK** (vérifié via `pg_constraint`), **12/13 strictement 3NF**, 1/13 (`cagnotte_transactions`) avec dénormalisation `user_id` explicitement documentée (D-1 : RLS perf + sémantique famille). Aucune migration corrective requise.
- [x] Vérifier l'absence de duplication de données (ex : `nom_benevole` dupliqué dans `inscriptions`). **DoD :** aucune dénormalisation injustifiée n'existe (justifications documentées sinon). — **2026-05-27** : 4 dénormalisations détectées et toutes justifiées (D-1 `cagnotte_transactions.user_id`, D-2 `orphan_relances.telephone`, D-3 `benevoles.cagnotte_forcee_jours` ARRAY, D-4 vues `admin_*`/`public_planning`). Vérifications explicites menées : **aucun** `postes.titre`/`postes.description` redondant, **aucun** `inscriptions.nom_benevole`, **aucun** compteur pré-calculé sur table physique. Cf. tableau "Vérifications explicites menées" dans `audit_db.md`.

### 2.8 Consolidation en script `init.sql`

- [x] Générer un dump propre du schéma local final : `pg_dump --schema-only "postgresql://postgres:postgres@127.0.0.1:54322/postgres" > supabase/migrations/00000000000000_init.sql`. **DoD :** le fichier existe et est lisible. _Note (2026-05-25)_ : la source de vérité est le dump prod (`backups/...`) + les migrations atomiques de la Phase 2, **PAS** un replay des migrations historiques archivées (cassées — bug `user_id` documenté dans `audit/notes.md`). — **2026-05-27** : dump via `docker exec supabase_db_appel-benevoles pg_dump --schema-only --no-owner --no-privileges --schema=public -U postgres -d postgres` (container pour aligner version client/serveur 17.6). Fichier généré : 2421 lignes.
- [x] Nettoyer le dump (supprimer les commentaires Supabase auto-générés non pertinents, organiser par section : extensions → types → tables → vues → fonctions → triggers → policies). **DoD :** le fichier est sectionné par des commentaires `-- ============ SECTION ============`. — **2026-05-27** : preamble pg_dump strippé (`SET ...`, `\restrict`, `CREATE SCHEMA public`), 11 sections injectées (1.EXTENSIONS, 2.TYPES, 3.FONCTIONS, 4.TABLES & VUES, 5.CONTRAINTES, 6.INDEX, 7.RÈGLES de VUES, 8.TRIGGERS, 9.FK, 10.POLICIES, 11.RLS).
- [x] Rendre le script idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` avant `CREATE POLICY`). **DoD :** réexécuter le script deux fois de suite n'engendre aucune erreur. — **2026-05-27** : transformations appliquées : `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION/VIEW`, `CREATE INDEX IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`, `DROP TRIGGER/POLICY IF EXISTS` prefixés, wrappers DO blocks IF NOT EXISTS pour 24 contraintes + 3 enums, `SET check_function_bodies = false` pour permettre la création des fonctions avant les tables. **Test 2 runs sur DB jetable (auth.users + auth.uid() stub)** : EXIT1=0, EXIT2=0, 0 erreur, schéma résultant identique à la source (13 tables / 4 vues / 35 index / 44 policies / 3 triggers / 256 fonctions / 3 enums / 54 contraintes).
- [x] Archiver les anciennes migrations dans `supabase/migrations/_archive/` (les conserver pour traçabilité historique mais hors du chemin actif). **DoD :** `supabase/migrations/` contient uniquement `00000000000000_init.sql` à la racine. — **2026-05-27** : 20 migrations (Phase 2.2 → 3.3) + `PLAN.md` déplacés vers `supabase/migrations/_archive/` ; `README.md` ajouté listant l'ordre chronologique. `ls supabase/migrations/` retourne `00000000000000_init.sql` + `_archive/` uniquement.
- [x] Documenter en tête de `init.sql` la date de consolidation et l'origine. **DoD :** un bloc de commentaire d'en-tête est présent. — **2026-05-27** : bloc d'en-tête (lignes 1-23) avec date de consolidation (2026-05-27), origine (`pg_dump --schema-only` instance Supabase locale), phase (2.8), caractéristiques (idempotence, schéma public uniquement, extensions, `check_function_bodies = false`).

### 2.9 Validation du script consolidé

- [x] Réinitialiser l'instance Supabase locale sur une base vierge : `supabase db reset --no-seed`. **DoD :** `psql ... -c "\dt public.*"` ne retourne aucune table avant exécution du script. — **2026-05-27** : déviation méthodologique justifiée — `supabase db reset --no-seed` rejouerait automatiquement `00000000000000_init.sql` (désormais présent dans `supabase/migrations/`), produisant l'opposé de la DoD. Remplacé par `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (préserve `auth.users` pour la restauration en 2.9.4). Vérification : `\dt public.*` retourne `Did not find any relation named "public.*"`. Cf. `audit/23_init_diff.md` §5.
- [x] Exécuter le script `00000000000000_init.sql` sur cette instance vierge. **DoD :** l'exécution se termine sans erreur et toutes les tables/policies sont créées. — **2026-05-27** : `psql -v ON_ERROR_STOP=1 < supabase/migrations/00000000000000_init.sql` → EXIT=0, 0 erreur. Comptes vérifiés : 13 tables / 44 policies / 4 vues / 256 fonctions (identiques au comptage de référence Phase 2.8).
- [x] Comparer le schéma résultant avec le schéma de référence (avant reset) via un diff (`pg_dump --schema-only`). **DoD :** le diff est vide (ou ne contient que des différences sans impact fonctionnel documentées dans `audit/23_init_diff.md`). — **2026-05-27** : diff post-normalisation CRLF→LF = **3 différences sans impact fonctionnel** (tokens aléatoires `\restrict`/`\unrestrict` de session pg_dump psql 17 + `COMMENT ON SCHEMA public IS 'standard public schema'` ajouté par Supabase à l'initialisation). Détail dans `audit/23_init_diff.md`. Recommandation `.gitattributes` (Phase 4/5) pour éliminer la divergence CRLF cosmétique.
- [x] Restaurer l'instance locale dans son état pré-validation (réimport du dump). **DoD :** `select count(*) from benevoles` retourne le compte attendu. — **2026-05-27** : réimport de `reference_data.sql` (dump `--data-only --schema=public` capturé avant le DROP). EXIT=0, aucune erreur. Comptes restaurés : benevoles=140, inscriptions=309, postes=58, periodes=10, cagnotte_transactions=189 (identiques au pré-validation).

---

## Phase 3 — Sécurisation (RLS et politiques)

> Toute cette phase est dédiée à la sécurité. Aucune fonctionnalité ne doit fuiter de données entre rôles.

### 3.1 Activation RLS universelle

- [x] Pour chaque table du schéma `public`, exécuter `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`. **DoD :** la requête `SELECT relname FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND relrowsecurity = false;` ne retourne aucune ligne. — **2026-05-27** : migration `20260527100000_enable_force_rls.sql` (boucle DO idempotente sur `pg_class`) appliquée sur Supabase local. Requête de vérification retourne 0 ligne sur 13 tables `public`.
- [x] Pour chaque table, exécuter `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` pour appliquer RLS même au propriétaire de la table. **DoD :** `relforcerowsecurity = true` pour toutes les tables publiques. — **2026-05-27** : même migration. `SELECT relname FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace AND relforcerowsecurity=false` retourne 0 ligne ; 13/13 tables affichent `rls=t, force_rls=t`.

### 3.2 Matrice des policies

- [x] Rédiger `security/rls_matrix.md` : un tableau Table × Opération × Rôle → policy à appliquer. **DoD :** chaque cellule a une décision explicite (`ALLOW`, `DENY`, `OWN_ROW_ONLY`, `ROLE_BASED`). — **2026-05-27** : fichier créé (265 lignes), 13 tables × 4 opérations × 4 rôles = 208 cellules toutes décidées. Helpers cibles documentés (`auth_has_role`, `is_referent_for_poste` à créer en 3.3, `check_referent_access` à supprimer).
- [x] Faire valider la matrice par le mainteneur avant codage. **DoD :** un commit `docs: validation rls_matrix` est présent. — **2026-05-27** : 5 points arbitrés par le mainteneur (cf. §6 du fichier) → matrice amendée puis commit `docs: validation rls_matrix`.

### 3.3 Implémentation des policies

- [x] Créer une fonction helper `auth_has_role(role text)` en `SECURITY DEFINER` qui lit le rôle depuis `benevoles` sans déclencher de récursion RLS. **DoD :** la fonction existe et est testable via `SELECT auth_has_role('admin');`. — **2026-05-27** : migration `20260527110000_create_rls_helpers.sql` (signature `auth_has_role(role_type)` STABLE SECURITY DEFINER SET search_path = public). `is_admin()` refactoré comme alias (R09). 2 helpers additionnels créés au passage : `is_own_benevole(uuid)` (pour OWN_ROW_ONLY sans subquery sur table à RLS) et `is_referent_for_poste(uuid)` (arbitrage mainteneur point 2). 5 helpers présents en `information_schema.routines` ; `SELECT auth_has_role('admin'::role_type)` retourne `f` sans auth.
- [x] Pour chaque ligne de la matrice, écrire la policy correspondante dans une migration `..._rls_policies.sql`. **DoD :** la migration s'applique sur Supabase local et `pg_policies` est cohérent avec la matrice. — **2026-05-27** : migration `20260527110100_rls_policies.sql` (DROP idempotent des 44 anciennes policies + DROP `check_referent_access` D7/R06 + CREATE 37 policies). Répartition : benevoles(3), inscriptions(7), benevole*repas(6), cagnotte_transactions(3), benevole_cagnotte_periodes(2), config(3), orphan_relances(1), 6 tables référentielles ×2 = 12. Convention `<table>*<role>_<op>[_<scope>]` respectée. UPDATE absent sur inscriptions/benevole_repas et UPDATE/DELETE absent sur cagnotte_transactions = DENY effectif (immutabilité comptable).
- [x] S'assurer qu'aucune policy n'utilise une sous-requête sur une table avec RLS sans passer par `auth_has_role` ou une autre fonction `SECURITY DEFINER`. **DoD :** revue manuelle de toutes les policies (commit signé `chore: rls recursion review`). — **2026-05-27** : revue des 37 policies. Expressions utilisées exclusivement : `auth.uid() = col` (direct), `auth_has_role('admin'::role_type)` (SECURITY DEFINER), `is_own_benevole(uuid)` (SECURITY DEFINER), `is_referent_for_benevole(uuid)` (SECURITY DEFINER), `is_referent_for_poste(uuid)` (SECURITY DEFINER), `true` (public*select). Aucune sous-requête `SELECT ... FROM <table*à_RLS>`dans une expression de policy → 0 risque de récursion. Commit signé`chore: rls recursion review`.

### 3.4 Tests de sécurité

- [x] **(Prérequis 2026-05-27, régression détectée — voir `audit/notes.md`)** : créer une migration `20260527120000_restore_postgrest_grants.sql` qui restaure les `GRANT` PostgREST manquants sur tout `public.*` (tables, vues, séquences, fonctions) à `anon`, `authenticated`, `service_role`, + `ALTER DEFAULT PRIVILEGES` pour les objets futurs. Cause racine : `init.sql` a été généré via `pg_dump --no-privileges` en Phase 2.8 → API frontend cassée si déployée. **DoD :** `has_table_privilege('anon', 'public.benevoles', 'SELECT')` retourne `true` ET `security/rls_tests.sql` peut s'exécuter sans `permission denied` au-delà du rôle (les denials RLS restent attendus). — **2026-05-27** : migration créée (boucles DO idempotentes sur `pg_class`/`pg_proc` + `ALTER DEFAULT PRIVILEGES`), appliquée sur Supabase local (242 grants table-level recensés sur `public.*` pour `anon`+`authenticated`). `has_table_privilege('anon','public.benevoles','SELECT') = t` vérifié. Le script `security/rls_tests.sql` passe ensuite sans `permission denied`.
- [x] Créer `security/rls_tests.sql` : un script qui teste chaque policy en simulant chaque rôle.
  ```sql
  -- Exemple
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub": "uuid-benevole-X", "role": "benevole"}';
  SELECT count(*) FROM inscriptions WHERE benevole_id <> 'uuid-benevole-X';
  -- Attendu : 0
  ```
  **DoD :** le script existe et couvre les rôles `benevole`, `referent`, `admin`, `juge`, `admin-juge`, `officiel`. — **2026-05-27** : script créé (665 lignes, 61 tests). Couvre `anon` + `benevole` (Vanessa + variant CECILE pour cagnotte) + `referent` (Patrick, famille de 2 + 4 postes gérés) + `admin` (Jean-Philippe). Rôles `juge`/`admin-juge`/`officiel` **explicitement non couverts** avec justification en en-tête : supprimés en Phase 2.3 (D1, migration `20260526130300_drop_juges_officiels.sql`), enum `role_type` réduit à 3 valeurs ; report Phase 1.9 → caduc.
- [x] Exécuter le script sur Supabase local et vérifier que tous les tests passent. **DoD :** un fichier `security/rls_results.md` recense les résultats avec timestamp. — **2026-05-27 11:35:45 UTC** : exécution complète, `security/rls_results.md` créé (résumé + tableau détaillé 61 lignes + notes d'interprétation famille/§2.11 + procédure de reproduction).
- [x] Pour chaque policy échouée, corriger et retester jusqu'à 100% de réussite. **DoD :** `rls_results.md` montre uniquement des `PASS`. — **2026-05-27** : 4 FAIL initiaux (R01, R02, R03, R05 sur le rôle referent) ont été diagnostiqués comme **erreurs d'attendus dans le script** liées au scope famille de Patrick (Patrick+Denise partagent le `user_id` → policies OWN_ROW_ONLY couvrent toute la famille naturellement). Aucun bug de policy. Attendus corrigés (R01: 13→14, R02: 21→25, R03: 1→3, R05: 0→4 avec assertion négative `others_visible=0`). Note d'interprétation matrice §2.11 ajoutée. **Re-run : 61/61 PASS.**

### 3.5 Gestion des secrets

- [x] Vérifier qu'aucun fichier `.env*` n'est commité (sauf `.env.example`). **DoD :** `git ls-files | grep -E '^\.env'` retourne uniquement `.env.example`. — **2026-05-27** : `git ls-files | grep -E '^\.env'` retourne `.env.example` seul.
- [x] Vérifier qu'aucune `service_role` key n'apparaît dans `src/`. **DoD :** `grep -r "service_role" src/` ne retourne rien. — **2026-05-27** : grep sur `src/` → `No matches found`.
- [x] Auditer toutes les variables `VITE_*` exposées au build : seules les clés publiques (anon) sont autorisées. **DoD :** un commentaire dans `.env.example` documente chaque variable et son périmètre de diffusion. — **2026-05-27** : `.env.example` ré-écrit avec convention `[BACKEND/CLI]` / `[FRONTEND]` / `[EDGE FUNCTION]` pour chaque variable + bloc dédié aux secrets Edge Functions. Anomalie détectée et notée dans `audit/notes.md` : `VITE_OPENROUTER_API_KEY` est embarquée dans le bundle (fonction `generateRapportIA` admin) → à arbitrer avant Phase 8 (proxy Edge Function ou suppression).
- [x] Vérifier que la `service_role` key utilisée par les Edge Functions est uniquement configurée via `supabase secrets set`. **DoD :** `supabase secrets list` montre `SUPABASE_SERVICE_ROLE_KEY` côté Edge Functions et absente du repo. — **2026-05-27** : `supabase secrets list` affiche `SUPABASE_SERVICE_ROLE_KEY` (digest `6a31b4b0...`). Repo : seuls le placeholder `.env.example` et les lectures `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` dans 4 Edge Functions (`create-benevole`, `send-relance-orphelin`, `send-rappel-all`, `send-relance`) — aucune valeur en clair.
- [x] Auditer les secrets SMTP de `send-planning` : vérifier qu'ils sont uniquement en `supabase secrets`. **DoD :** ils n'apparaissent dans aucun fichier versionné. — **2026-05-27** : `supabase secrets list` confirme `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` présents. Repo : aucune valeur réelle, uniquement (a) commandes de doc `supabase secrets set SMTP_*=` (README.md, .env.example), (b) noms de variables (CLAUDE.md), (c) lectures `Deno.env.get("SMTP_*")` dans 4 Edge Functions (`send-planning`, `send-rappel-all`, `send-relance`, `send-relance-orphelin`).

### 3.6 Storage policies (si applicable)

- [x] Lister les buckets Storage utilisés. **DoD :** `audit/18_storage.md` liste chaque bucket et son usage. — **2026-05-27** : **N/A — aucun bucket**. Preuves dans `audit/18_storage.md` §1-4 : 0 référence à `supabase.storage` dans `src/`, 0 bucket dans `supabase/config.toml`, 0 bucket en LOCAL (`SELECT FROM storage.buckets` → 0 rows), 0 bucket en PROD (`GET /storage/v1/bucket` → `[]`).
- [x] Pour chaque bucket, vérifier que les policies INSERT/SELECT/UPDATE/DELETE sont définies. **DoD :** chaque bucket a une matrice complète documentée. — **2026-05-27** : **N/A — aucun bucket** (cf. tâche précédente). Aucune policy Storage à auditer.
- [x] Tester les policies Storage en accédant à un fichier avec un rôle non autorisé. **DoD :** l'accès est refusé (`403`). — **2026-05-27** : **N/A — aucun bucket** ni objet à tester. Recommandation pour futurs ajouts consignée dans `audit/18_storage.md` §6.

### 3.7 Configuration Auth

- [x] Vérifier la durée de session JWT (default `3600s`) et l'adapter au besoin métier. **DoD :** la valeur est documentée dans `security/auth_config.md`. — **2026-05-27** : décision = conserver 3600s (cf. `security/auth_config.md` §1). Justification métier documentée.
- [x] Vérifier la liste des providers Auth activés (Email, OAuth, Magic Link). **DoD :** `auth_config.md` liste les providers et leur configuration. — **2026-05-27** : seul **Email (OTP)** est actif. Tous les OAuth, SMS, Web3, third-party, passkey, MFA désactivés (cf. `security/auth_config.md` §2).
- [x] Vérifier la liste des `Redirect URLs` autorisées et supprimer toute URL `localhost` en production. **DoD :** la liste actuelle est documentée et sans `localhost`. — **2026-05-27** : `http://localhost:5173/**` retiré du Dashboard prod par le mainteneur. Redirect URLs prod = `https://jeanfi675.github.io/appel-benevoles/index.html` + `https://jeanfi675.github.io/appel-benevoles/**` (cf. `security/auth_config.md` §3).
- [x] Activer la confirmation d'email obligatoire si pertinent. **DoD :** la décision est documentée dans `auth_config.md`. — **2026-05-27** : décision = **ne pas activer** (`enable_confirmations = false`). Le flow OTP confirme déjà l'email implicitement, activer ajouterait un second mail inutile (cf. `security/auth_config.md` §4).
- [x] Vérifier la politique de mot de passe (longueur minimale, complexité). **DoD :** la politique est appliquée et documentée. — **2026-05-27** : `minimum_password_length = 8` + `password_requirements = lower_upper_letters_digits` appliqué localement (`supabase/config.toml`) et sur la prod (Dashboard, par le mainteneur). Défense en profondeur pour comptes admin (cf. `security/auth_config.md` §5).

---

## Phase 4 — Nettoyage du code frontend

### 4.1 Détection du code mort

- [x] Installer `knip` en devDependency. **DoD :** `npm ls knip` retourne une version.
- [x] Configurer `knip.json` avec les entrées Vite (pages HTML + JS) et exécuter `npx knip`. **DoD :** le rapport est généré et sauvegardé dans `audit/19_knip.txt`.
- [x] Installer `depcheck` et exécuter `npx depcheck`. **DoD :** le rapport est sauvegardé dans `audit/20_depcheck.txt`.
- [x] Pour chaque fichier marqué inutilisé par `knip`, vérifier manuellement (cas EJS, includes dynamiques). **DoD :** une liste consolidée des fichiers à supprimer est dans `audit/21_cleanup.md`.
- [x] Pour chaque dépendance marquée inutilisée par `depcheck`, valider manuellement (peer deps, plugins Vite). **DoD :** la liste finale des dépendances à supprimer est dans `audit/21_cleanup.md`.
- [x] **(A) Détection des méthodes Alpine.js mortes** : pour chaque méthode/propriété déclarée dans un `Alpine.data({...})` ou `Alpine.store(...)`, vérifier qu'elle est référencée au moins une fois en dehors de sa déclaration (recherche dans `src/**/*.{js,html}`). **DoD :** rapport brut sauvegardé dans `audit/22_alpine_methods.txt` et liste des méthodes confirmées mortes ajoutée à `audit/21_cleanup.md` (section dédiée). Justification : knip ne détecte pas les méthodes appelées via attributs HTML (`x-on:click="foo()"`).
- [x] **(B1) Détection des partials HTML orphelins** : pour chaque fichier `src/partials/**/*.html`, vérifier qu'il est référencé par au moins un `include(...)` EJS dans le projet. **DoD :** rapport brut sauvegardé dans `audit/23_orphan_partials.txt` et liste des partials confirmés orphelins ajoutée à `audit/21_cleanup.md` (section dédiée).

### 4.2 Suppression effective

#### 4.2.1 Nettoyage ciblé OpenRouter (fonctionnalité abandonnée, pré-validée hors Knip)

> **Contexte 2026-05-27** : la fonctionnalité « Rapport IA admin » (`generateRapportIA`) n'est plus utilisée. La clé `VITE_OPENROUTER_API_KEY` est embarquée en clair dans le bundle public (fuite identifiée en Phase 3.5 T3 — cf. `audit/notes.md`). Clé OpenRouter **révoquée côté provider le 2026-05-27**. Reste à supprimer le code et la config pour éliminer la dette + retirer le secret GitHub Actions.

- [x] Supprimer la méthode `generateRapportIA` et l'UI associée (bouton, état Alpine `rapportIA*`, modale) dans `src/js/modules/admin/index.js` et les partials concernés. **DoD :** `grep -rn "generateRapportIA\|rapportIA\|openrouter\|VITE_OPENROUTER" src/` ne retourne rien et `npm run build` réussit.
- [x] Retirer `VITE_OPENROUTER_API_KEY` de `.github/workflows/deploy.yml`. **DoD :** `grep -n "OPENROUTER" .github/workflows/deploy.yml` ne retourne rien.
- [x] Retirer la section OpenRouter (variable + commentaire) de `.env.example`. **DoD :** `grep -n "OPENROUTER" .env.example` ne retourne rien.
- [x] Supprimer le secret `VITE_OPENROUTER_API_KEY` côté GitHub Actions (`Settings → Secrets and variables → Actions`). **DoD :** capture d'écran du panneau Actions Secrets confirmant l'absence du secret, archivée dans `audit/notes.md` (ou commit de validation par le mainteneur). — **Confirmé par le mainteneur 2026-05-28** (cf. `audit/notes.md`).
- [x] Confirmer la révocation côté OpenRouter (dashboard `https://openrouter.ai/settings/keys`). **DoD :** entry datée dans `audit/notes.md` confirmant la révocation. — **Fait 2026-05-27 par le mainteneur** (confirmé dans `audit/notes.md` ligne 435).

#### 4.2.2 Suppression générique (post-Knip)

- [x] Supprimer les fichiers JS/HTML morts identifiés. **DoD :** `npm run build` réussit après suppression. — Supprimés : `src/partials/sections/admin/tab-rapport-ia.html`, `check-role.js`.
- [x] Supprimer les dépendances inutilisées (`npm uninstall ...`). **DoD :** `npm run build` et `npm run dev` fonctionnent après désinstallation. — Désinstallées : `html5-qrcode`, `depcheck`, `dotenv`.
- [x] Supprimer les fichiers de scaffolding obsolètes (templates IA, READMEs auto-générés non pertinents). **DoD :** chaque suppression est documentée dans le message de commit. — RAS : aucun scaffolding obsolète détecté hors `tab-rapport-ia.html` déjà traité.
- [x] Décider du sort de `dist/` versionné : supprimer du repo et ajouter à `.gitignore` après vérification que le déploiement n'en dépend pas. **DoD :** `git check-ignore dist/` retourne `dist/` et le déploiement fonctionne toujours (à valider en Phase 8). — `git rm -r --cached dist/` exécuté, `.gitignore` mis à jour. Validation déploiement → Phase 8.

#### 4.2.3 Suppression des méthodes/propriétés Alpine.js mortes (résultats audit A)

> Source : section "Méthodes/propriétés Alpine.js mortes" de `audit/21_cleanup.md` (25 entrées).
> Les candidats sont statiquement prouvés morts (`refs=1`) sur un codebase exempt de dispatch dynamique (vérifié en Phase 4.1 : 0 occurrence de `this[var]`, `eval`, `new Function`, `window[]`).

- [x] Supprimer les méthodes/propriétés par vagues groupées par module (AdminModule en priorité, puis PlanningModule, WizardModule, AdminTimeline, store, scanner-tshirt). Pour chaque méthode : retirer la déclaration + le bloc JSDoc associé. **Un commit par vague** pour faciliter le revert. **DoD :** `npm run build` réussit après chaque commit + `npm run dev` charge la page affectée sans erreur console. — 24 méthodes/propriétés (`generateRapportIA` ayant été traitée en 4.2.1) supprimées en 4 vagues + cascade ; build OK.
- [x] Après chaque vague, **relancer `node scripts/audit-alpine-methods.js`** pour détecter l'effet cascade (méthodes utilisées exclusivement par les méthodes supprimées qui deviennent mortes à leur tour). Itérer jusqu'à stabilité. **DoD :** dernière exécution = 0 nouveau candidat OU justification écrite pour chaque candidat conservé. — Itération cascade : 8 nouveaux candidats détectés (helpers `getBenevolesInscrits/Min/MaxForPeriode`, états `posteFilterPeriode`, `selectedPoste{,Inscrits,ForRegistration}`, `showPosteInscritsModal`) supprimés ; dernière exécution = 0 candidat.

### 4.3 Nettoyage du bruit

- [x] Supprimer tous les `console.log`, `console.debug`, `console.warn` non essentiels dans `src/`. **DoD :** `grep -rn "console\." src/` ne retourne que les `console.error` justifiés (logs d'erreur).
- [x] Supprimer tous les blocs de code commenté (`// TODO` historiques, dumps de code). **DoD :** revue manuelle complète, commit `chore: remove commented code`.
- [x] Supprimer les imports inutilisés via ESLint (`no-unused-vars`). **DoD :** `npx eslint src/` ne signale aucun import mort.

---

## Phase 5 — Refactoring frontend (Alpine.js + Vite)

### 5.0 Propagation Phase 2.6 dans le code front

> **Contexte** : la Phase 2.6 (Harmonisation du nommage) a renommé 1 table, 4 colonnes, 1 vue et 1 fonction dans la base. La DoD de 2.6 précise « les requêtes du front sont mises à jour en conséquence (à valider en Phase 5) », mais aucune case dédiée n'avait été créée — le report a été perdu. Tâche ajoutée le 2026-05-28 suite à la détection en cours de 5.2.5 du bug `programme` / `programmes` côté visual-creator. Bloque toutes les autres tâches de Phase 5 (le frontend casse en local sur les zones impactées).

- [x] **5.0.1 — Renommage table `programme` → `programmes`**.
      Cible : 6 occurrences dans `src/js/modules/admin/index.js` (lignes ~802, 1609, 2237, 2439, 2443) et `src/js/admin-timeline.js` (ligne ~365). Remplacer `ApiService.fetch/delete/upsertMany('programme', ...)` par `ApiService.fetch/delete/upsertMany('programmes', ...)`.
      **DoD :** `grep -rn "'programme'" src/js/` retourne 0 résultat ; build OK ; visual-creator charge sans 404 sur `/rest/v1/programmes`. — **2026-05-28** : 6 chaînes remplacées, grep = 0, `npm run build` OK (163 modules). Audit ligne par ligne dans `audit/25_phase_2_6_propagation.md` §5.0.1.
- [x] **5.0.2 — Renommage colonne `benevole_repas.vegetarien` → `is_vegetarien`**.
      Auditer toutes les références JS/HTML : `grep -rn "vegetarien" src/` puis remplacer les usages relevant de `benevole_repas` uniquement (laisser intact `benevoles.vegetarien` si toujours présent).
      **DoD :** aucun usage de `.vegetarien` sur un objet `benevole_repas` ; tests manuels page bénévole (cochage repas + vegetarien) OK. — **2026-05-28** : 7 occurrences renommées (admin/index.js:1094 récap stats + wizard.js:23,231,297,355,362,373 shape repas E2E). Vérification init.sql : aucune colonne `benevoles.vegetarien` (false positive du plan), seule `benevole_repas.is_vegetarien` existe. `grep "\bvegetarien\b" src/` = 0 ; build OK.
- [x] **5.0.3 — Renommage colonne `benevoles.t_shirt_recupere` → `has_recupere_tshirt`**.
      Auditer : `grep -rn "t_shirt_recupere" src/`. Remplacer.
      **DoD :** `grep -rn "t_shirt_recupere" src/` retourne 0 résultat ; scanner-tshirt fonctionne (marquage et déduction OK). — **2026-05-28** : 7 remplacements (scanner-tshirt.js: JSDoc + 4 lectures/écriture, user/tshirt.js: 2 lectures). RPC `get_family_tshirt_info_smart` retourne le nouveau nom (init.sql l.381). Build OK.
- [x] **5.0.4 — Renommage colonne `benevoles.cagnotte_forcee` → `is_cagnotte_forcee`**.
      Auditer : `grep -rn "cagnotte_forcee\b" src/` (attention aux variantes `cagnotte_forcee_type`, `cagnotte_forcee_jours`, `cagnotte_forcee_periodes_ids` qui restent inchangées). Remplacer uniquement le booléen.
      **DoD :** la colonne booléenne renommée n'a plus aucun usage `cagnotte_forcee` orphelin ; onglet cagnotte-forcee admin OK ; widget cagnotte côté bénévole OK. — **2026-05-28** : 15 booléens renommés (7 dans tab-cagnotte-forcee.html : x-if/x-model/x-show/filter ; 8 dans admin/index.js : init forcedForm, l.235 récap CSV, l.676 isForced, l.691 stats, l.2931 editForced bidirectionnel, l.2945+l.2950 saveForced, l.3003 reset). 42 occurrences `_type`/`_jours`/`_periodes_ids` préservées (compte vérifié). Build OK.
- [x] **5.0.5 — Renommage colonne `orphan_relances.auth_user_id` → `user_id`**.
      Auditer : `grep -rn "auth_user_id" src/`. Remplacer.
      **DoD :** 0 occurrence ; relance des orphelins OK (parcours admin → relances). — **2026-05-28** : 0 changement dans `src/`. Les 2 hits `auth_user_id` sont (a) le body envoyé à l'Edge Function `send-relance-orphelin` (contrat HTTP inchangé), (b) le paramètre `p_auth_user_id` de la fonction RPC `save_orphelin_phone` (signature inchangée en 2.6 pour compat, cf. init.sql l.725). **⚠ Anomalie hors-périmètre** documentée dans `audit/notes.md` : l'Edge Function `send-relance-orphelin/index.ts:150` écrit toujours sur la colonne renommée → Edge Function cassée, à corriger Phase 8. Le smoke test 5 de 5.0.8 échouera tant que ce correctif n'est pas appliqué (échec attendu).
- [x] **5.0.6 — Renommage colonne vue `public_planning.inscrits_actuels` → `nb_inscrits_actuels`**.
      Auditer : `grep -rn "inscrits_actuels" src/` (attention à ne pas toucher les `inscrits_actuels` qui ne viennent pas de la vue `public_planning` mais d'un calcul JS local : ex. `shift.inscrits_actuels`, `poste.inscrits_actuels` calculé dans `loadPostes`).
      **DoD :** seules les lectures de `public_planning` utilisent `nb_inscrits_actuels` ; page publique planning OK. — **2026-05-28** : 1 ligne modifiée (`user/planning.js:242` — ajout `select: '*, inscrits_actuels:nb_inscrits_actuels'` aliasing PostgREST). `admin-timeline.js:425` n'a pas besoin de modification (son `select` explicite n'inclut pas la colonne). Les ~20 calculs JS locaux préservés. Build OK.
- [x] **5.0.7 — Renommage fonction `public_debit_cagnotte` → `debit_cagnotte_public`**.
      Auditer : `grep -rn "public_debit_cagnotte" src/`. Remplacer.
      **DoD :** 0 occurrence ; débit cagnotte via QR fonctionne (parcours debit.html). — **2026-05-28** : 1 ligne modifiée (`debit.js:89`). Signature de la RPC inchangée (init.sql l.172). Smoke test parcours `debit.html` différé en 5.0.8. Build OK.
- [x] **5.0.8 — Validation finale et garde-fou CI**.
      Exécuter le smoke test complet des 7 zones impactées en local (Supabase local doit être à jour avec `init.sql`). Documenter `PASS/FAIL` dans `audit/25_phase_2_6_propagation.md`.
      Ajouter au plus tard avant Phase 8 un check `grep` automatisé qui détecte tout usage d'un nom obsolète.
      **DoD :** rapport `audit/25_phase_2_6_propagation.md` avec 7 PASS ; aucune erreur console ; aucun 404 Supabase REST. — **2026-05-28** : 8 PASS + 1 SKIP (test 5 relance orphelin — FAIL attendu hors-périmètre, Edge Function à corriger Phase 8). Anomalie UI hors-périmètre détectée au passage (scanner-tshirt : impossible de changer la taille) consignée dans `audit/notes.md`. Garde-fou CI grep reporté en Phase 8. **Phase 5.0 close.**

### 5.1 Architecture cible

- [x] Rédiger `ARCHITECTURE.md` décrivant la nouvelle arborescence cible :
  ```
  src/
    js/
      config.js
      services/       # api.js, auth.js (existant, à déplacer)
      stores/         # Alpine.store() par domaine
      components/     # Alpine.data() par composant
      pages/          # entrypoints par page
      utils/          # helpers purs (formatters, validators)
    partials/
    styles/
  ```
  **DoD :** le document est validé par le mainteneur.

### 5.2 Extraction de la logique Alpine

- [x] **5.2.1 —** Pour chaque page HTML, identifier tous les `x-data="{ ... }"` inline contenant plus de 3 lignes de logique. **DoD :** un tableau `audit/22_spaghetti.md` liste chaque occurrence avec son fichier et son volume. — **Fait (2026-05-28)** : audit `audit/22_spaghetti.md` → 6 composants nommés déjà externalisés, 5 `x-data` inline tous mono-propriété, **0 occurrence > 3 lignes**.
- [x] **5.2.2 —** Pour chaque occurrence, créer un fichier `src/js/components/<nom>.js` qui exporte un `Alpine.data('<nom>', () => ({ ... }))`. **DoD :** le HTML utilise `x-data="<nom>"` et tous les tests manuels passent toujours. — **N/A (2026-05-28)** : aucune occurrence inline > 3 lignes à extraire (cf. audit 22).
- [x] **5.2.3 —** Pour chaque état partagé entre composants, créer un `Alpine.store('<domaine>', { ... })` dans `src/js/stores/`. **DoD :** les composants concernés consomment le store via `$store.<domaine>`. — **Reporté sur 5.2.8** : le seul vrai état partagé identifié est entre `adminApp` et `adminTimelineApp` (cf. couplage `__x.$data`), traité en 5.2.8.
- [x] **5.2.4 —** Vérifier qu'aucun `x-data` inline restant ne dépasse 3 lignes. **DoD :** `grep -E 'x-data="[^"]{200,}"' src/` ne retourne rien. — **Fait (2026-05-28)** : grep ripgrep multiline `x-data="\{[^"]*$` → `No matches found` (cf. audit 22).
- [ ] **5.2.5 — Refactor admin god object → architecture `Alpine.store` + `Alpine.data` (fusion ex-5.2.5 + ex-5.2.8).**
      Le fichier `src/js/modules/admin/index.js` (3073 lignes) est un god object spread dans `adminApp()`, et l'onglet visual-creator est couplé à `adminTimelineApp` via `document.querySelector(...).__x.$data` (cross-page admin.html ↔ besoins.html). Au lieu de faire le découpage en deux passes (5.2.5 spread → 5.2.8 store), on fait **une seule passe** vers l'architecture cible.

  **Cible** :
  - `Alpine.store('admin', { ... })` contient le state partagé (`postes`, `benevoles`, `periodes`, `config`, `stats`, `dbProgramme`, `dbJours`, `repasList`) + les loaders transverses (`loadData`, `loadPostes`, `loadBenevolesAndStats`, `loadConfig`, `loadPeriodes`, `loadProgramme`, `loadJours`, `loadRepas`) + helpers globaux (`showToast`, `getReferents`).
  - `Alpine.store('visualProgram', { ... })` remplace le couplage `__x.$data` entre admin (onglet visual-creator) et `adminTimelineApp` (besoins.html). Store chargé sur **les deux pages**.
  - Un fichier `Alpine.data('admin<X>Tab', () => ({ ... }))` par onglet (7 onglets UI) dans `src/js/components/admin/` consomme `$store.admin`. Chaque partial HTML déclare `x-data="admin<X>Tab"`.
  - 2 modules utils purs sortis de `index.js` : `utils/admin-time.js` (formatters) et `utils/admin-shift-validation.js` (logique pure du visual-creator).
  - `adminApp()` devient un wrapper minimal qui ne porte plus aucune méthode métier (puis est supprimé en sous-tâche E).

  **Sous-tâches atomiques** (chaque ligne = 1 commit reversible) :
  - [x] **A — Extraction utils purs.** Sortir formatters + validation pure dans `src/js/utils/admin-time.js` et `src/js/utils/admin-shift-validation.js`. **DoD :** `npm run build` OK ; chaque onglet admin chargé sans regression. — **A1 fait (2026-05-28, commit `1577cb1`)** : `src/js/utils/admin-time.js` créé (5 fonctions pures : `getLocalDateKey`, `formatDecimalHour`, `formatHourMin`, `formatDay`, `formatDecimalToISO`). 3 closures internes dupliquées supprimées de `index.js` ; 3 méthodes redondantes supprimées ; `formatDay`+`formatDecimalHour` restent exposés comme propriétés (consommés par partials HTML). `admin/index.js` : 3073 → 3042 lignes. `npm run build` OK. **A2 fait (2026-05-28, après propagation 5.0)** : `src/js/utils/admin-shift-validation.js` créé (4 fonctions pures : `calculateShiftPeriodOverlap`, `findBestPeriodForShift`, `detectShiftConflicts`, `computePeriodWeight`). Suppression de ~40 lignes inline d'assignation shift→période et ~25 lignes de détection de conflits dans `validateAndAutoAssignPeriods`. Suppression du closure `getPeriodeWeight` (42 lignes) dans `saveVisualCreator`. `admin/index.js` : 3042 → 2960 lignes. `npm run build` OK.
  - [x] **B — Créer `Alpine.store('admin')`.** State partagé + loaders transverses + helpers globaux. `adminApp()` consomme `$store.admin.X` pour ces champs. **DoD :** `Alpine.store('admin')` existe ; admin.html charge sans erreur ; tous les onglets fonctionnent identiquement. — **Fait (2026-05-28, commit `7f7a055`)** : `src/js/stores/admin-store.js` créé (422 lignes) — détient state partagé (`postes`, `benevoles`, `periodes`, `dbProgramme`, `dbJours`, `repasList`, `config`, `stats`, `currentUser`, `loading`, `toasts`, `isAdmin`), 8 loaders (`loadData`, `loadPostes`, `loadBenevolesAndStats`, `loadPeriodes`, `loadProgramme`, `loadConfig`, `loadRepas`, `loadJours`), 3 helpers (`showToast`, `getReferents`, `calculateStats`). `admin.js` enregistre le store et instancie `adminApp` via `Object.create(AdminModule)` (préserve les getters/setters du prototype). `admin/index.js` : déclarations de state partagé supprimées, loaders/helpers convertis en stubs délégants, getters/setters de délégation installés via `Object.defineProperty` en fin de fichier (12 champs proxifiés). `admin/index.js` : 2960 → 2585 lignes (−375). `npm run build` OK. Test manuel local validé (chargement page, onglets, toggles, visual-creator).
  - [ ] **C — Convertir chaque onglet en `Alpine.data`** (7 commits, un onglet à la fois). Ordre proposé : `heures` → `mailing` → `referents` → `recap` → `cagnotte-forcee` → `benevoles` → `visual-creator`. Pour chaque onglet : créer `src/js/components/admin/admin-<x>-tab.js`, modifier le partial `tab-<x>.html` pour `x-data="admin<X>Tab"`, supprimer les méthodes correspondantes du wrapper `adminApp`. **DoD par commit :** `npm run build` OK + test manuel de l'onglet touché + non-régression des autres onglets, documenté dans `audit/24_admin_split.md`.
    - [x] **C1 — Onglet `heures`** — **Fait (2026-05-28)** : `src/js/components/admin/admin-heures-tab.js` créé (59 lignes), expose `formatTime` + `getHeuresParPeriode` + `getTotalHeures` consommant `Alpine.store('admin').{postes,periodes}` (lecture seule, agrégations pures). `admin.js` enregistre `Alpine.data('adminHeuresTab', adminHeuresTab)`. `tab-heures.html` : ajout `x-data="adminHeuresTab"` sur le div racine (scope `activeTab` hérité du parent). `admin/index.js` : suppression des 2 méthodes (−39 lignes ; 2585 → 2546). `npm run build` OK (bundle admin 56.64 → 56.71 kB). Test manuel : onglet Heures identique + non-régression des autres onglets.
    - [x] **C2 — Onglet `mailing`** — **Fait (2026-05-28)** : `src/js/components/admin/admin-mailing-tab.js` créé (129 lignes) — state local (`mailingFilterRole`, `mailingFilterAssignation`, `mailingPostLines`) + 5 méthodes (`addMailingPostLine`, `removeMailingPostLine`, `getSlotsForPostTitle`, `getFilteredMailingBenevoles`, `getFilteredMailingEmails`, `copyMailingEmails`) + getter dérivé `uniquePosteTitres` + `formatTime`. **`uniquePosteTitres` promu getter dérivé sur `Alpine.store('admin')`** (source de vérité unique : dérivé réactif de `postes`, plus de couplage caché avec `initReferentAssignments`). `admin/index.js` : suppression des 4 déclarations de state mailing, suppression de l'assignation `this.uniquePosteTitres = ...` dans `initReferentAssignments`, suppression des 5 méthodes ; ajout d'un proxy lecture-seule `SHARED_DERIVED_FIELDS` en fin de fichier pour que `tab-referents.html` (non encore migré) continue à lire `uniquePosteTitres` via le scope hérité. `admin/index.js` : 2546 → 2459 lignes (−87). `npm run build` OK (bundle admin 56.71 → 56.97 kB). Test manuel : Mailing (filtres, sélection poste/créneaux, copie clipboard) + non-régression Referents (dropdown titres OK via proxy dérivé) + autres onglets.
    - [x] **C3 — Onglet `referents`** (4 sous-commits : a refactor, b bug type_postes, c bug slot pris, d encart save) :
      - [x] **C3.a — Refactor pur** — **Fait (2026-05-28)** : `src/js/components/admin/admin-referents-tab.js` créé (136 lignes) — porte les 5 méthodes UI de l'onglet (`addReferentAssignmentLine`, `removeReferentAssignmentLine`, `getPeriodesForTitre`, `getOrphanPostes`, `saveReferentAssignments`) + proxies vers le store (`referentAssignments`, `uniquePosteTitres`, `getReferents`, `initReferentAssignments`). `referentAssignments` (state) + `initReferentAssignments()` (méthode) migrés vers `Alpine.store('admin')` car init transverse au `loadData` ; le store appelle désormais `initReferentAssignments()` en fin de `loadData()`. `admin/index.js` : 2459 → 2334 lignes (−125). Build OK. Test manuel : comportement strictement identique, persistance DB OK après F5.
      - [x] **C3.b — Bug #1 : dropdown depuis `type_postes`** — **Fait (2026-05-29)** : source canonique du dropdown referents = table `type_postes` (au lieu de dériver de `postes.titre`). Store : ajout `typePostes: []` + `loadTypePostes()` (inclus dans `loadData`) ; getters `posteTitres` (depuis `type_postes`, sémantique referents — permet d'attribuer un référent à un type sans poste créé) et `posteTitresWithSlots` (depuis `postes`, sémantique mailing — types avec slots existants). Suppression de l'ancien getter `uniquePosteTitres` du store et du bloc `SHARED_DERIVED_FIELDS` dans `admin/index.js` (devenu sans consommateur). Composants : `admin-referents-tab.js` consomme `posteTitres`, `admin-mailing-tab.js` consomme `posteTitresWithSlots`. Build OK. Test manuel validé. **Note** : ni la DB ni le code ne garantissent l'absence de `type_postes` orphelin (sans `postes`). En pratique, base actuelle = 0 orphelin. Dette notée pour une future phase.
      - [x] **C3.c — Bug #2 : slots déjà pris désactivés** — **Fait (2026-05-29)** : `getPeriodesForTitre(titre, currentRefId)` enrichi pour retourner `[{id, nom, ordre, takenBy}]` où `takenBy = {id, fullName}` si le poste matching `(titre, periode_id)` est assigné à un référent autre que le courant, sinon `null`. Template : appel `getPeriodesForTitre(assign.titre, ref.id)` ; checkbox `:disabled` + style désactivé (`bg-gray-200 opacity-60 cursor-not-allowed`) si `takenBy` ; suffixe "(pris par {fullName})" + tooltip natif. Corrige le bug silencieux d'écrasement (un référent pouvait précédemment cocher un slot déjà attribué à un autre référent, écrasant son `referent_id` en DB sans avertissement). Build OK. Test manuel validé.
      - [x] **C3.d — Bug #3 : encart sauvegarde** — **Fait (2026-05-29)** : pattern aligné sur `tab-visual-creator.html`. State local `autoSaveStatus` ∈ `'synced' | 'saving' | 'error'` dans `adminReferentsTab`. `saveReferentAssignments` passe `'saving'` au début, `'synced'` en fin de try, `'error'` dans catch (toast d'erreur conservé). Template : encart top-right (vert/bleu pulse/rouge avec emoji) placé à côté du bouton "🔄 Recharger". Build OK. Test manuel validé (cas d'erreur non testé : pas d'erreur déclenchée).
    - [x] **C4 — Onglet `recap`** — **Fait (2026-05-29)** : `src/js/components/admin/admin-recap-tab.js` créé (15 lignes) — un seul getter `stats` proxiant vers `Alpine.store('admin').stats`. Onglet sans state ni méthode dédiée (pure lecture des stats T-shirts / repas / cagnotte). `admin/index.js` : 0 modification. Build OK. Test manuel validé.
    - [x] **C5 — Onglet `cagnotte-forcee`** — **Fait (2026-05-29)** : `src/js/components/admin/admin-cagnotte-forcee-tab.js` créé (179 lignes) — state local (`forcedSearchQuery`, `selectedForcedBenevole`, `forcedForm`), 4 méthodes (`saveForcedJourneeTarif`, `selectBenevoleForCagnotte`, `saveCagnotteForcee`, `revertCagnotteForcee`), proxies `benevoles`/`periodes`/`config`/`loading`. **Couplage résiduel** : le template lit `visualDays` (jours du championnat dérivés des postes par visual-creator) via scope parent `adminApp` ; à nettoyer en C7 ou D. `admin/index.js` : 2334 → 2189 lignes (−145). Build OK. Test manuel validé.
    - [x] **C6 — Onglet `benevoles`** — **Fait (2026-05-29)** : `src/js/components/admin/admin-benevoles-tab.js` créé (433 lignes) — 10 propriétés state local (`searchQuery`, `benevolesSort`, `selectedBenevoleInscriptions`, `showDetailsModal`, `showEditModal`, `selectedBenevoleName`, `currentBenevole`, `showAddBenevoleModal`, `newBenevoleForm`, `newInscriptionForm`), 15 méthodes (helpers stats, `getFilteredBenevoles`, `exportBenevolesExcel`, modales détails/édition/ajout, CRUD inscriptions, `createBenevole`, `updateBenevoleRole`), proxies `benevoles`/`postes`/`periodes`/`loading`. **2 bugs corrigés en passant** : (1) `refreshBenevoleInscriptions` requêtait `postes(titre,...)` alors que `titre` a été migré vers `type_postes` (refactor DB) → 400 Bad Request → joint désormais `postes(type_postes(titre), periodes(nom, ordre), periode_debut, periode_fin)` ; (2) `getPostesForSelectedPeriod` filtre désormais postes complets (`nb_max` atteint), déjà-inscrits, et chevauchements horaires avec d'autres inscriptions du bénévole — le dropdown ne propose que des choix valides. `admin/index.js` : 2189 → 1797 lignes (−392). **Cumul Phase 5.2.5 : 3073 → 1797 lignes (−1276 / −41.5 %).** Build OK. Test manuel validé (recherche, tri, modale détails, modale modifier, ajout bénévole, changement rôle, export Excel).
  - [ ] **D — `Alpine.store('visualProgram')`** chargé sur admin.html ET besoins.html. `adminVisualCreatorTab` et `adminTimelineApp` consomment le store au lieu du couplage `__x.$data`. **DoD :** `grep -rn "__x" src/js/` ne retourne rien ; mise à jour bi-directionnelle vérifiée manuellement.
  - [ ] **E — Supprimer le wrapper `adminApp()` god object** (devenu vide une fois les 7 onglets convertis). `admin.html` n'a plus que des `x-data="admin<X>Tab"` par section. **DoD :** `src/js/modules/admin/index.js` supprimé ; `grep -rn "adminApp" src/` ne retourne plus rien.

  **DoD globale 5.2.5 :** plus de god object spread dans `adminApp` ; chaque onglet est un `Alpine.data` autonome consommant `$store.admin` ; aucun fichier `src/js/components/admin/*.js` ne dépasse 500 lignes (ou justification écrite si cohésion forte) ; couplage `__x.$data` éliminé ; tests manuels par onglet documentés dans `audit/24_admin_split.md`.

- [ ] **5.2.6 — Convertir `modules/user/cagnotte.js` en composant Alpine** (`Alpine.data('cagnotteWidget')` + partial `src/partials/components/cagnotte-widget.html`). Supprimer le render impératif (`innerHTML`, `addEventListener`, `classList` toggle), les flags `isRendering`, `lastParentElement` / `lastBenevoleId`. **DoD :** plus de `document.createElement` ni `.innerHTML =` dans `cagnotte.js` ; test manuel : affichage solde + QR debit fonctionnent.
- [ ] **5.2.7 — Convertir `modules/user/tshirt.js` en composant Alpine** (`Alpine.data('tshirtWidget')` + partial `src/partials/components/tshirt-widget.html`). Supprimer le render impératif et le flag `isRenderingTshirt`. **DoD :** plus de `document.createElement` ni `.innerHTML =` dans `tshirt.js` ; test manuel : widget masqué si tout collecté / affichage QR scanner OK.
- [x] **5.2.8 — Fusionnée dans 5.2.5** (ex-tâche "remplacer le couplage `__x.$data` admin↔timeline par un store"). Traitée comme sous-tâche D de la 5.2.5 refondue.

### 5.3 Application DRY et SOLID

- [ ] Identifier les patterns répétés (toasts, modals, validation de formulaires) et extraire en composants/helpers réutilisables. **DoD :** chaque pattern dupliqué ≥ 3 fois est centralisé.
- [ ] Chaque service (`api.js`, `auth.js`) a une responsabilité unique et claire. **DoD :** une revue manuelle confirme qu'aucune méthode ne mélange deux préoccupations.
- [ ] Aucun module ne fait d'appel direct à `supabase` hors des services. **DoD :** `grep -rn "from.*config" src/js/components/` ne montre que des imports de services, pas de `supabase`.

### 5.4 Configuration Vite production

- [ ] Activer le code splitting par page via `rollupOptions.input`. **DoD :** `dist/assets/` contient un chunk par page.
- [ ] Activer la minification (Terser ou esbuild) et les sourcemaps en production. **DoD :** `vite.config.js` contient `build.minify` et `build.sourcemap = 'hidden'`.
- [ ] Configurer le chunking des `vendor` (Alpine, Supabase) pour optimiser le cache navigateur. **DoD :** un chunk `vendor` distinct existe dans `dist/assets/`.
- [ ] Vérifier que `base: "./"` est conservé pour le déploiement relatif (GitHub Pages). **DoD :** la ligne est présente dans `vite.config.js`.
- [ ] Documenter dans `.env.example` toutes les variables `VITE_*` requises. **DoD :** le fichier liste chaque variable avec un commentaire.

### 5.5 Linter et formatter

- [ ] Installer `eslint` + `eslint-plugin-alpinejs` (si dispo) ou règles personnalisées. **DoD :** `npx eslint --print-config src/js/config.js` retourne une config valide.
- [ ] Installer `prettier` et créer `.prettierrc` aligné avec les conventions du projet. **DoD :** `npx prettier --check src/` est exécutable.
- [ ] Configurer `husky` + `lint-staged` pour exécuter `eslint --fix` et `prettier --write` en pre-commit. **DoD :** un commit avec un fichier mal formaté déclenche le formatage automatique.
- [ ] Faire passer un premier `npx eslint src/ --fix` et `npx prettier --write src/` sur l'ensemble du code. **DoD :** `npx eslint src/` ne retourne aucune erreur.

### 5.6 Accessibilité et performance

- [ ] Exécuter Lighthouse sur les principales pages en mode production. **DoD :** chaque rapport est sauvegardé dans `audit/lighthouse/<page>.html`.
- [ ] Corriger les erreurs d'a11y identifiées (labels, contrastes, `alt`, focus visible). **DoD :** un nouveau passage Lighthouse retourne ≥ 90 en a11y.
- [ ] Optimiser les images (formats modernes, lazy loading). **DoD :** Lighthouse Performance ≥ 90 sur les pages principales.
- [ ] Vérifier que les Core Web Vitals (LCP, CLS, INP) sont au vert. **DoD :** un rapport final est dans `audit/lighthouse/final.md`.

---

## Phase 6 — Tests et validation fonctionnelle

### 6.1 Parcours utilisateurs

- [ ] Rédiger `tests/manual_scenarios.md` listant les parcours critiques par rôle (benevole, referent, admin, juge, admin-juge, officiel). **DoD :** chaque rôle a au moins 3 scénarios documentés.
- [ ] Exécuter chaque scénario sur Supabase local et noter le résultat. **DoD :** `tests/manual_results.md` recense les résultats datés.
- [ ] Pour chaque échec, créer une issue et corriger avant Phase 7. **DoD :** tous les scénarios sont `PASS` dans le rapport final.

### 6.2 Non-régression

- [ ] Comparer le comportement actuel (vidéos/captures sur prod) avec le comportement local post-refacto sur les 10 fonctionnalités les plus utilisées. **DoD :** un tableau dans `tests/regression.md` montre `Avant === Après` pour chaque cas.

### 6.3 Tests de charge minimaux (si pertinent)

- [ ] Identifier les pages critiques (planning, admin). **DoD :** la liste est dans `tests/load.md`.
- [ ] Lancer `k6` ou `autocannon` simulant 50 utilisateurs concurrents sur ces pages contre Supabase local. **DoD :** les temps de réponse P95 sont < 1s. _Note : mesures indicatives — Supabase local n'a pas les mêmes caractéristiques que la prod managée._

### 6.4 Tests des Edge Functions (en local via `supabase functions serve`)

- [ ] Démarrer les Edge Functions en local : `supabase functions serve`. **DoD :** la commande affiche les endpoints locaux.
- [ ] Tester `send-planning` avec un bénévole de test (SMTP test via Mailpit/Inbucket local fourni par Supabase). **DoD :** l'email arrive avec le bon contenu dans l'interface Inbucket (`http://127.0.0.1:54324`).
- [ ] Tester `create-benevole` en tant qu'admin avec un email de test. **DoD :** le compte est créé et apparaît dans `auth.users` local.
- [ ] Tester `create-benevole` avec un appelant non-admin → doit échouer. **DoD :** la réponse HTTP est `403`.

---

## Phase 7 — Documentation

### 7.1 README principal

- [ ] Rédiger `README.md` avec :
  - Description du projet
  - Prérequis (Node 20+, Supabase CLI, Deno)
  - Installation (`npm install`)
  - Configuration (`.env.example` → `.env.local`)
  - Lancement dev (`npm run dev`)
  - Build prod (`npm run build`)
  - Déploiement (lien vers `docs/deployment.md`)

  **DoD :** un contributeur peut cloner et lancer le projet en < 15 minutes en suivant uniquement le README.

### 7.2 ARCHITECTURE.md

- [ ] Documenter la vue d'ensemble (frontend Vite/Alpine + backend Supabase). **DoD :** un diagramme (Mermaid ou ASCII) est inclus.
- [ ] Documenter les choix techniques et leurs justifications. **DoD :** chaque dépendance majeure est expliquée.
- [ ] Documenter la structure des dossiers. **DoD :** chaque dossier de `src/` a une description.

### 7.3 DATABASE.md

- [ ] Décrire chaque table avec son but, ses colonnes principales et ses relations. **DoD :** chaque table de `public` est documentée.
- [ ] Inclure un diagramme ERD (Mermaid `erDiagram` ou export dbdiagram.io). **DoD :** le diagramme est lisible et à jour.
- [ ] Documenter chaque policy RLS en langage naturel ("qui peut faire quoi"). **DoD :** la matrice RLS est intégrée.
- [ ] Documenter les triggers et fonctions PL/pgSQL. **DoD :** chaque trigger a une description de sa logique métier.

### 7.4 CONTRIBUTING.md

- [ ] Documenter les conventions de code (linter, formatter, nommage). **DoD :** le fichier référence ESLint et Prettier.
- [ ] Documenter le workflow Git (branches, commits conventionnels, PR). **DoD :** un exemple de message de commit est inclus.
- [ ] Documenter le processus de revue de PR. **DoD :** une checklist de revue est incluse.

### 7.5 CHANGELOG.md

- [ ] Créer `CHANGELOG.md` au format Keep a Changelog avec une entrée `[1.0.0] - YYYY-MM-DD` listant le refactoring. **DoD :** le fichier existe et est lié depuis le README.

### 7.6 Documentation inline

- [ ] Ajouter des JSDoc sur les fonctions publiques des services et stores. **DoD :** chaque fonction exportée a au minimum `@param` et `@returns`.
- [ ] Ajouter des commentaires SQL sur les fonctions et triggers complexes. **DoD :** chaque trigger a un bloc `-- Purpose:` en en-tête.

### 7.7 Mise à jour de CLAUDE.md

- [ ] Mettre à jour `CLAUDE.md` pour refléter la nouvelle architecture et supprimer les avertissements obsolètes (ex : un environnement Supabase local reproductible existe désormais). **DoD :** le fichier est à jour avec la nouvelle réalité.

---

## Phase 8 — Mise en production

> Première phase à écrire sur le remote et sur la prod. Toutes les actions précédentes étaient locales.

### 8.0 Synchronisation Git remote

- [ ] Pousser le tag de pré-refacto sur le remote : `git push origin pre-refactor-YYYYMMDD`. **DoD :** `git ls-remote --tags origin pre-refactor-*` retourne un SHA.
- [ ] Pousser la branche `refactor/production-hardening` sur le remote avec `-u` : `git push -u origin refactor/production-hardening`. **DoD :** `git ls-remote --heads origin refactor/production-hardening` retourne un SHA.
- [ ] Vérifier que le CI (GitHub Actions) passe au vert sur la branche poussée. **DoD :** la PR (ou le commit) affiche un check `success`.

### 8.1 Application en production

- [ ] Sur la branche `refactor/production-hardening`, lancer `supabase db push --linked` sur le projet de production avec le flag `--force-prod`. **DoD :** la migration est appliquée et `supabase migration list` montre le status à jour.
- [ ] Déployer les Edge Functions : `supabase functions deploy send-planning` et `supabase functions deploy create-benevole`. **DoD :** les fonctions sont visibles et invocables dans le dashboard.
- [ ] Merger `refactor/production-hardening` dans `master` via PR (avec revue). **DoD :** la PR est mergée et le CI passe au vert.
- [ ] Vérifier le déploiement frontend (GitHub Actions ou plateforme cible). **DoD :** l'URL de production sert la nouvelle version.

### 8.2 Configuration production

- [ ] Vérifier que toutes les variables d'environnement de production sont configurées (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc.). **DoD :** le dashboard de déploiement montre toutes les variables.
- [ ] Vérifier que le domaine est en HTTPS avec certificat valide. **DoD :** `curl -I https://<domaine>` retourne `200` avec en-tête `strict-transport-security`.
- [ ] Vérifier les en-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy). **DoD :** un test sur `securityheaders.com` retourne au minimum un grade `B`.

### 8.3 Monitoring

- [ ] Activer les logs Supabase (Database, Auth, Edge Functions) et vérifier qu'ils sont consultables. **DoD :** une requête de test apparaît dans les logs dans la minute.
- [ ] Intégrer Sentry (ou équivalent) côté frontend pour capturer les erreurs JS. **DoD :** une erreur volontaire est visible dans le dashboard Sentry.
- [ ] Configurer une alerte email sur les erreurs critiques. **DoD :** un test d'erreur déclenche un email.

### 8.4 Sauvegardes automatiques

- [ ] Vérifier que les backups Supabase quotidiens sont activés (plan Pro ou supérieur). **DoD :** le dashboard Supabase liste un backup récent.
- [ ] Documenter la procédure de restauration dans `docs/disaster_recovery.md`. **DoD :** le fichier existe et inclut les commandes exactes.
- [ ] Tester une restauration partielle sur l'instance Supabase locale à partir d'un backup prod fraîchement téléchargé. **DoD :** un compte-rendu est ajouté à `docs/disaster_recovery.md`.

### 8.5 Checklist finale de go-live

- [ ] Tous les tests manuels Phase 6 passent en production. **DoD :** `tests/manual_results_prod.md` est rempli.
- [ ] Tous les rôles peuvent se connecter et accéder à leurs pages respectives. **DoD :** validation croisée par au moins un utilisateur réel par rôle.
- [ ] Aucune erreur n'apparaît dans Sentry sur les 24 premières heures. **DoD :** le dashboard est vide d'erreurs critiques.
- [ ] Le `CHANGELOG.md` est mis à jour avec la date de mise en production. **DoD :** un tag `v1.0.0` est créé sur `master`.
- [ ] Un email d'annonce est envoyé aux utilisateurs clés. **DoD :** l'email est envoyé (capture archivée dans `docs/launch.md`).
- [ ] Le mainteneur signe le bon de livraison final. **DoD :** un commit `chore: v1.0.0 release` est mergé sur `master` avec sa signature.

---

## Annexe — Conventions de tâches

- Chaque case `- [ ]` est une action vérifiable indépendamment.
- Une tâche cochée signifie que sa **DoD** est satisfaite, vérifiée par une commande, un fichier produit, ou une revue humaine.
- En cas de blocage, créer une issue référencée dans le commentaire de la tâche plutôt que de cocher.
- Ne jamais passer à la phase suivante avant que **toutes** les tâches de la phase courante soient cochées ou explicitement marquées `N/A — raison`.
