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
- [x] Pour chaque ligne de la matrice, écrire la policy correspondante dans une migration `..._rls_policies.sql`. **DoD :** la migration s'applique sur Supabase local et `pg_policies` est cohérent avec la matrice. — **2026-05-27** : migration `20260527110100_rls_policies.sql` (DROP idempotent des 44 anciennes policies + DROP `check_referent_access` D7/R06 + CREATE 37 policies). Répartition : benevoles(3), inscriptions(7), benevole_repas(6), cagnotte_transactions(3), benevole_cagnotte_periodes(2), config(3), orphan_relances(1), 6 tables référentielles ×2 = 12. Convention `<table>_<role>_<op>[_<scope>]` respectée. UPDATE absent sur inscriptions/benevole_repas et UPDATE/DELETE absent sur cagnotte_transactions = DENY effectif (immutabilité comptable).
- [x] S'assurer qu'aucune policy n'utilise une sous-requête sur une table avec RLS sans passer par `auth_has_role` ou une autre fonction `SECURITY DEFINER`. **DoD :** revue manuelle de toutes les policies (commit signé `chore: rls recursion review`). — **2026-05-27** : revue des 37 policies. Expressions utilisées exclusivement : `auth.uid() = col` (direct), `auth_has_role('admin'::role_type)` (SECURITY DEFINER), `is_own_benevole(uuid)` (SECURITY DEFINER), `is_referent_for_benevole(uuid)` (SECURITY DEFINER), `is_referent_for_poste(uuid)` (SECURITY DEFINER), `true` (public_select). Aucune sous-requête `SELECT ... FROM <table_à_RLS>` dans une expression de policy → 0 risque de récursion. Commit signé `chore: rls recursion review`.

### 3.4 Tests de sécurité

- [ ] Créer `security/rls_tests.sql` : un script qui teste chaque policy en simulant chaque rôle.
  ```sql
  -- Exemple
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub": "uuid-benevole-X", "role": "benevole"}';
  SELECT count(*) FROM inscriptions WHERE benevole_id <> 'uuid-benevole-X';
  -- Attendu : 0
  ```
  **DoD :** le script existe et couvre les rôles `benevole`, `referent`, `admin`, `juge`, `admin-juge`, `officiel`.
- [ ] Exécuter le script sur Supabase local et vérifier que tous les tests passent. **DoD :** un fichier `security/rls_results.md` recense les résultats avec timestamp.
- [ ] Pour chaque policy échouée, corriger et retester jusqu'à 100% de réussite. **DoD :** `rls_results.md` montre uniquement des `PASS`.

### 3.5 Gestion des secrets

- [ ] Vérifier qu'aucun fichier `.env*` n'est commité (sauf `.env.example`). **DoD :** `git ls-files | grep -E '^\.env'` retourne uniquement `.env.example`.
- [ ] Vérifier qu'aucune `service_role` key n'apparaît dans `src/`. **DoD :** `grep -r "service_role" src/` ne retourne rien.
- [ ] Auditer toutes les variables `VITE_*` exposées au build : seules les clés publiques (anon) sont autorisées. **DoD :** un commentaire dans `.env.example` documente chaque variable et son périmètre de diffusion.
- [ ] Vérifier que la `service_role` key utilisée par les Edge Functions est uniquement configurée via `supabase secrets set`. **DoD :** `supabase secrets list` montre `SUPABASE_SERVICE_ROLE_KEY` côté Edge Functions et absente du repo.
- [ ] Auditer les secrets SMTP de `send-planning` : vérifier qu'ils sont uniquement en `supabase secrets`. **DoD :** ils n'apparaissent dans aucun fichier versionné.

### 3.6 Storage policies (si applicable)

- [ ] Lister les buckets Storage utilisés. **DoD :** `audit/18_storage.md` liste chaque bucket et son usage.
- [ ] Pour chaque bucket, vérifier que les policies INSERT/SELECT/UPDATE/DELETE sont définies. **DoD :** chaque bucket a une matrice complète documentée.
- [ ] Tester les policies Storage en accédant à un fichier avec un rôle non autorisé. **DoD :** l'accès est refusé (`403`).

### 3.7 Configuration Auth

- [ ] Vérifier la durée de session JWT (default `3600s`) et l'adapter au besoin métier. **DoD :** la valeur est documentée dans `security/auth_config.md`.
- [ ] Vérifier la liste des providers Auth activés (Email, OAuth, Magic Link). **DoD :** `auth_config.md` liste les providers et leur configuration.
- [ ] Vérifier la liste des `Redirect URLs` autorisées et supprimer toute URL `localhost` en production. **DoD :** la liste actuelle est documentée et sans `localhost`.
- [ ] Activer la confirmation d'email obligatoire si pertinent. **DoD :** la décision est documentée dans `auth_config.md`.
- [ ] Vérifier la politique de mot de passe (longueur minimale, complexité). **DoD :** la politique est appliquée et documentée.

---

## Phase 4 — Nettoyage du code frontend

### 4.1 Détection du code mort

- [ ] Installer `knip` en devDependency. **DoD :** `npm ls knip` retourne une version.
- [ ] Configurer `knip.json` avec les entrées Vite (pages HTML + JS) et exécuter `npx knip`. **DoD :** le rapport est généré et sauvegardé dans `audit/19_knip.txt`.
- [ ] Installer `depcheck` et exécuter `npx depcheck`. **DoD :** le rapport est sauvegardé dans `audit/20_depcheck.txt`.
- [ ] Pour chaque fichier marqué inutilisé par `knip`, vérifier manuellement (cas EJS, includes dynamiques). **DoD :** une liste consolidée des fichiers à supprimer est dans `audit/21_cleanup.md`.
- [ ] Pour chaque dépendance marquée inutilisée par `depcheck`, valider manuellement (peer deps, plugins Vite). **DoD :** la liste finale des dépendances à supprimer est dans `audit/21_cleanup.md`.

### 4.2 Suppression effective

- [ ] Supprimer les fichiers JS/HTML morts identifiés. **DoD :** `npm run build` réussit après suppression.
- [ ] Supprimer les dépendances inutilisées (`npm uninstall ...`). **DoD :** `npm run build` et `npm run dev` fonctionnent après désinstallation.
- [ ] Supprimer les fichiers de scaffolding obsolètes (templates IA, READMEs auto-générés non pertinents). **DoD :** chaque suppression est documentée dans le message de commit.
- [ ] Décider du sort de `dist/` versionné : supprimer du repo et ajouter à `.gitignore` après vérification que le déploiement n'en dépend pas. **DoD :** `git check-ignore dist/` retourne `dist/` et le déploiement fonctionne toujours (à valider en Phase 8).

### 4.3 Nettoyage du bruit

- [ ] Supprimer tous les `console.log`, `console.debug`, `console.warn` non essentiels dans `src/`. **DoD :** `grep -rn "console\." src/` ne retourne que les `console.error` justifiés (logs d'erreur).
- [ ] Supprimer tous les blocs de code commenté (`// TODO` historiques, dumps de code). **DoD :** revue manuelle complète, commit `chore: remove commented code`.
- [ ] Supprimer les imports inutilisés via ESLint (`no-unused-vars`). **DoD :** `npx eslint src/` ne signale aucun import mort.

---

## Phase 5 — Refactoring frontend (Alpine.js + Vite)

### 5.1 Architecture cible

- [ ] Rédiger `ARCHITECTURE.md` décrivant la nouvelle arborescence cible :
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

- [ ] Pour chaque page HTML, identifier tous les `x-data="{ ... }"` inline contenant plus de 3 lignes de logique. **DoD :** un tableau `audit/22_spaghetti.md` liste chaque occurrence avec son fichier et son volume.
- [ ] Pour chaque occurrence, créer un fichier `src/js/components/<nom>.js` qui exporte un `Alpine.data('<nom>', () => ({ ... }))`. **DoD :** le HTML utilise `x-data="<nom>"` et tous les tests manuels passent toujours.
- [ ] Pour chaque état partagé entre composants, créer un `Alpine.store('<domaine>', { ... })` dans `src/js/stores/`. **DoD :** les composants concernés consomment le store via `$store.<domaine>`.
- [ ] Vérifier qu'aucun `x-data` inline restant ne dépasse 3 lignes. **DoD :** `grep -E 'x-data="[^"]{200,}"' src/` ne retourne rien.

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
