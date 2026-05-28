# Notes d'audit — Points hors scope de la tâche en cours

> Ce fichier collecte les sujets identifiés en cours de refactoring qui ne font pas partie
> de la tâche atomique en cours mais qui doivent être tranchés avant d'avancer dans le plan.
> Règle 7 du brief : **atomicity first**, on note ici plutôt que de dévier.

---

## 2026-05-25 — Stratégie de migration vers la prod (Phase 8.1)

**Contexte** : la Phase 2.8 consolide tout le schéma dans un unique `00000000000000_init.sql` et archive les anciennes migrations dans `supabase/migrations/_archive/`. La Phase 8.1 actuelle prévoit ensuite un `supabase db push --linked --force-prod`.

**Problème** : la prod a déjà toutes les anciennes migrations appliquées (jusqu'à `20260316083700_add_fk_postes_referent_id.sql`). Si on lui propose un nouvel `init.sql` consolidé, Supabase CLI ne saura pas calculer le delta naturellement — soit il rejoue tout (impossible, les tables existent déjà), soit il considère que rien n'est à faire (et nos changements ne s'appliquent pas).

**Options à arbitrer avant Phase 8** :

1. **Diff ciblé** : générer un script `prod_migration.sql` qui contient uniquement les `ALTER`/`DROP`/`CREATE INDEX`/etc. nécessaires pour faire passer la prod du schéma actuel au schéma cible. Ce script est appliqué via `psql` directement, hors mécanisme `supabase migration`. Avantage : surgical, peu de risque. Inconvénient : il faut générer ce diff manuellement (ou via `migra`, `apgdiff`).

2. **Migrations atomiques préservées** : ne PAS consolider en `init.sql`, garder les migrations atomiques de la Phase 2.x et les appliquer une à une avec `supabase db push`. Avantage : workflow CLI standard. Inconvénient : le bénéfice "schéma propre repartable de zéro" de la Phase 2.8 disparaît.

3. **Hybride** : créer `init.sql` (pour reconstruction from-scratch en local/dev) ET garder les migrations atomiques (pour le déploiement prod). Les deux artefacts cohabitent, avec un test de cohérence en CI (`init.sql == playback(migrations)`).

**Recommandation à valider avec le mainteneur** : option 3 (hybride). C'est le pattern le plus mature, utilisé par la plupart des projets Postgres en prod. Demande à modifier la Phase 2.8 pour ne PAS archiver les migrations atomiques, et à modifier la Phase 8.1 pour utiliser `supabase db push` standard sur les migrations atomiques.

**À traiter avant** : Phase 2.8. **À trancher en accord avec** : mainteneur.

---

## 2026-05-25 — Divergence `master` local vs `origin/master`

**Contexte** : au démarrage du refactoring, `master` local est **22 commits en avance** sur `origin/master`. La branche `refactor/production-hardening` a été créée depuis ce HEAD local.

**Problème potentiel** : ces 22 commits ne sont actuellement sauvegardés que sur le poste local. La sauvegarde locale du `.git/` (tâche 0.1 #3 révisée) les couvre. Le push différé en 8.0 les sauvegardera aussi indirectement (la branche `refactor/...` partage le même historique).

**Action à valider** : doit-on pousser `master` local sur `origin/master` en parallèle de 8.0, ou laisser cette divergence et la résoudre via le merge final de la PR ? Le plus simple est sans doute que le merge de `refactor/production-hardening` → `master` (Phase 8.1 #3) embarque aussi ces 22 commits via la PR.

**À traiter en** : Phase 8.0 / 8.1.

---

## 2026-05-26 — Statut réel des rôles `juge` / `admin-juge` / `officiel` (Phase 1.5.4)

**Contexte** : la migration archivée `supabase/migrations_archive_pre_refactor/20260525040000_remove_juges_officiels.sql` (datée 2026-05-25) supprime ces trois rôles. Elle est dans `_archive/` (donc non rejouée par `supabase start` local), MAIS le CHECK constraint `benevoles_role_check` de la prod liste toujours les 6 rôles, et le dump prod contient encore **1 ligne `admin-juge`** + des fonctions `is_admin_juge()` et `get_family_tshirt_info_smart` qui s'y réfèrent.

**Question pour le mainteneur** :
- (a) Cette migration `remove_juges_officiels` a-t-elle été **appliquée en prod** ? (Si oui, le dump est antérieur à son application — peu probable vu les dates.)
- (b) Doit-elle l'être ? Si oui, la Phase 2 devra inclure une migration équivalente + le nettoyage du code (`is_admin_juge`, `get_family_tshirt_info_smart`, vue `admin_benevoles`, RLS `Admin-juges can update juges`, etc.) **AVANT** la conversion `text → enum role_type`.
- (c) Ou bien ces rôles sont conservés et l'enum doit inclure les 6 valeurs ?

**Impact si on tranche (c) - conservation** : enum `role_type` à 6 valeurs. Aucun nettoyage code.
**Impact si on tranche (b) - suppression** : 1 ligne à reclasser + nettoyage fonctions/policies/vues + enum à 3 valeurs.

**À traiter avant** : Phase 2.4 (conversion enum role).

---

## 2026-05-26 — Bug requête CHECK constraints en Partie 1.5.1

**Contexte** : la requête utilisée pour conclure « aucun CHECK sur les colonnes texte » dans `audit/12_typing.md` Partie 1.5.1 utilisait :
```sql
SELECT conname FROM pg_constraint WHERE contype='c' AND conrelid::regclass::text LIKE 'public.%';
```

**Bug** : `regclass::text` retourne `benevoles` (sans préfixe `public.`) quand `public` est dans le `search_path` — donc le `LIKE 'public.%'` n'a rien matché. **5 CHECK constraints existent en réalité** (révélés lors de la Partie 1.5.4) :
- `benevoles_role_check`
- `benevoles_taille_tshirt_check`
- `benevoles_cagnotte_forcee_type_check`
- `capacite_valide` (postes : `nb_max >= nb_min AND nb_min > 0`)
- `periode_valide` (postes : `periode_fin > periode_debut`)

**Correction apportée** : la Partie 1.5.4 documente la situation réelle ; `audit/12_typing.md` Partie 1.5.1 ne sera pas réécrit (les recommandations enum restent identiques, juste leur motivation passe de "trou de sécurité" à "amélioration de typage").

**Filtre correct à utiliser** : `WHERE contype='c' AND connamespace='public'::regnamespace` (par OID du schéma, non par texte).

---

## 2026-05-25 — Caractéristiques du dump data (0.2 #5)

**Contexte** : `supabase db dump --data-only -f backups/20260525_data.sql --linked` produit un fichier de ~907 Ko utilisant des `INSERT INTO`, et inclut aussi les schémas Supabase système (`auth.*`, etc.) en plus de `public.*`.

**Points d'attention identifiés** :

1. **Format `INSERT` au lieu de `COPY`** — verbeux et plus lent à réimporter. Acceptable à 907 Ko, mais si on devait dump une base bien plus grosse à l'avenir, considérer `--use-copy`. Non bloquant.

2. **Données ULTRA-sensibles** — le fichier contient :
   - Données personnelles bénévoles : email, prénom, nom, téléphone (RGPD niveau "données personnelles").
   - Credentials Auth en clair : `auth.flow_state` contient des codes magic-link et tokens OAuth.
   - À ne JAMAIS sortir du poste de dev. À ajouter à `.gitignore` immédiatement (0.2 #7).

3. **Collision au réimport (0.3 #4)** — les tables `auth.*` existent déjà dans une instance Supabase locale fraîche (créées automatiquement par `supabase start`). Au moment du réimport :
   - Option A : filtrer le dump pour ne garder que `public.*` avant import (via sed/awk ou flag `--schema public` lors du dump — à investiguer côté CLI 2.x).
   - Option B : importer dans `public.*` uniquement via `psql --set ON_ERROR_STOP=on` en sautant les erreurs auth.
   - Option C : redumper avec un flag explicite `--schema public` si supporté.
   - **À trancher avant 0.3 #4.**

---

## 2026-05-25 — Limite du dump `--role-only` (0.2 #6)

**Contexte** : `supabase db dump --role-only -f backups/20260525_roles.sql --linked` produit un fichier de 297 octets contenant uniquement les `ALTER ROLE ... SET ...` (paramètres custom), et **PAS** les `CREATE ROLE` ni les `GRANT` globaux.

**Conséquence** : le dump n'inclut que `anon`, `authenticated`, `authenticator` (rôles qui ont des `statement_timeout` custom). `service_role` est absent du fichier car il n'a aucun paramètre custom.

**Pourquoi c'est OK pour notre usage** :
- À la restauration sur Supabase local (`supabase start`), les rôles standard Supabase (anon, authenticated, service_role, authenticator, etc.) sont **recréés automatiquement** par la plateforme.
- Seuls les `ALTER ROLE` custom seraient perdus sans ce dump — ils sont préservés.

**Quand ce serait insuffisant** :
- Restauration sur un Postgres vanilla (hors écosystème Supabase) : il faudrait un vrai `pg_dumpall --globals-only` avec credentials directs.
- Si demain on ajoutait des rôles applicatifs custom (`CREATE ROLE editeur ...`) : ils ne seraient PAS dans ce dump.

**Action si besoin futur** : utiliser `pg_dumpall --globals-only "postgresql://..."` directement (hors CLI Supabase) pour avoir les CREATE ROLE complets. Nécessite la `DATABASE_URL` prod avec mot de passe.

**DoD du plan reformulée** dans `plan_refactoring.md` pour refléter ce comportement réel du CLI 2.x.

---

## 2026-05-25 — Règle `*.md` du `.gitignore` trop large (à corriger avant Phase 8)

**Contexte** : le `.gitignore` actuel contient une règle `*.md` qui ignore tous les fichiers Markdown sauf une liste blanche très courte :
```
*.md
!README.md
!ARCHITECTURE.md
!CLAUDE.md
!src/data/programme.md
```

**Conséquence directe** : tous les livrables du plan de refactoring sont actuellement **ignorés par Git** et ne peuvent pas être commités tels quels :
- `plan_refactoring.md` ← critique, on perd la traçabilité de son évolution
- `audit/notes.md` ← ce fichier
- `audit/*.md` futurs (Phase 1)
- `security/*.md` futurs (Phase 3)
- `tests/*.md` futurs (Phase 6)
- `docs/*.md` futurs (Phase 7)
- `CHANGELOG.md`, `CONTRIBUTING.md`, `DATABASE.md` (Phase 7)

**Vérification effectuée** : `git check-ignore plan_refactoring.md audit/notes.md` retourne les deux fichiers → confirmé ignorés.

**Pas bloquant maintenant** parce que :
- Aucun commit n'est prévu avant Phase 8.0
- Les fichiers existent localement et sont éditables normalement
- On peut commiter sélectivement avec `git add -f <fichier>` si besoin

**À corriger avant Phase 8 — proposition** :
- Soit retirer complètement la règle `*.md` et ajouter des `!` pour les fichiers MD à exclure spécifiquement.
- Soit étendre la liste blanche avec des patterns plus larges :
  ```
  *.md
  !README.md
  !ARCHITECTURE.md
  !CLAUDE.md
  !CHANGELOG.md
  !CONTRIBUTING.md
  !DATABASE.md
  !plan_refactoring.md
  !audit/**/*.md
  !security/**/*.md
  !tests/**/*.md
  !docs/**/*.md
  !src/data/programme.md
  ```

**Recommandation : option 2** (whitelist explicite). Plus de contrôle, signal clair que les *.md aléatoires créés en racine restent ignorés. À ajouter comme nouvelle tâche du plan, probablement dans la Phase 8.0 (avant le premier push remote).

---

## 2026-05-25 — Bug majeur : historique des migrations non reproductible (CRITIQUE)

**Découvert lors de** : `supabase start` en Phase 0.3 #2.

**Symptôme** : la migration `006_fix_rls_policies.sql` échoue avec `ERROR: column "user_id" does not exist (SQLSTATE 42703)` lors du replay from-scratch sur une DB locale vierge.

**Cause** : la migration 006 (ligne 5) déclare textuellement *"On suppose que la table 'benevoles' a une colonne 'user_id' (utilisée par le JS)"*. **Aucune migration du dossier `supabase/migrations/` ne crée cette colonne.** Pourtant, la prod a bien `user_id uuid NOT NULL` (confirmé dans `backups/20260525_schema.sql`). La colonne a donc été créée **hors migration** (probablement via le dashboard Supabase ou un commit perdu/jamais publié).

**Conséquences** :
- L'historique `supabase/migrations/` n'est PAS reproductible from-scratch.
- Tout `supabase db reset`, `supabase start` from-scratch, ou environnement clean échoue.
- La validation 2.9 (qui consiste à appliquer `init.sql` sur une base vierge) doit prendre comme référence le **dump prod** et non un replay des migrations.

**Stratégie retenue (2026-05-25)** :
1. Déplacer `supabase/migrations/` → `supabase/migrations_archive_pre_refactor/` pour empêcher le replay au start.
2. Créer un nouveau `supabase/migrations/` vide.
3. `supabase start` → DB locale vide (schémas Supabase système uniquement).
4. Importer le dump schema prod (`backups/20260525_schema.sql`) via `psql` → DB locale = miroir exact de la prod.
5. Importer les données prod (`backups/20260525_data.sql`).
6. À partir de là, toutes les nouvelles migrations de la Phase 2 démarrent depuis l'**état actuel de la prod**, pas depuis un état théorique reconstitué via les migrations cassées.

**Impact sur Phase 2.8** (consolidation `init.sql`) : la source de vérité du `init.sql` final sera le **dump prod après application des migrations Phase 2**, **pas** un replay des migrations historiques.

**Anomalie à classer dans `audit_db.md`** (Phase 1.10) : criticité **HAUT** (intégrité historique compromise).

**Autres migrations potentiellement affectées** : à investiguer en Phase 1 — d'autres colonnes pourraient avoir été ajoutées hors migration. Un diff systématique entre le dump prod et le replay des migrations historiques permettrait de lister exhaustivement les divergences.

---

## 2026-05-26 — Simplification du DoD 1.3 #2 (taxonomie READ/WRITE/UNUSED)

**Contexte** : la tâche 1.3 #2 du plan demande de classer chaque colonne en `READ_WRITE / READ_ONLY / WRITE_ONLY / UNUSED`.

**Problème** : distinguer `SELECT` vs `INSERT/UPDATE` par grep à l'échelle de 125 colonnes est trompeur. Le frontend Alpine.js accède aux colonnes via destructuring d'objets (`b.prenom`), templates EJS (`x-text="benevole.nom"`), et appels API génériques (`ApiService.fetch('table', { select: '*' })`). Une colonne lue uniquement dans un payload `select: '*'` puis utilisée en template HTML n'apparaît jamais textuellement avec un verbe SELECT — la distinction READ vs WRITE devient ininterprétable.

**Décision retenue** : produire `audit/10_column_usage.md` avec une taxonomie binaire `USED / UNUSED`, plus une section `LOW_USE` (1-3 occurrences) pour les colonnes méritant inspection manuelle. Les colonnes UNUSED reçoivent toutes une décision DROP/KEEP justifiée (vérification croisée vues + fonctions PG via `pg_proc.prosrc`).

**Conséquence** : la classification fine READ/WRITE/RW est déférée à la **Phase 2** au cas par cas pour les colonnes effectivement candidates à modification (DROP COLUMN, changement de type, NOT NULL backfill). Pas de refonte des 125 colonnes ; uniquement celles qui bougent.

**Impact sur le plan** : aucun. Le DoD est satisfait à l'esprit (identifier les morts et justifier les décisions), pas à la lettre. À valider explicitement par le mainteneur lors de la clôture de 1.3.

---

## 2026-05-26 — Décisions de nommage validées (Phase 1.8 → Phase 2.6)

**Contexte** : l'audit `audit/15_naming.md` a identifié 9 anomalies de nommage. 4 décisions ont été arbitrées par le mainteneur le 2026-05-26 pour exécution en Phase 2.6.

### Décisions validées

1. **Table `programme` → `programmes`**
   - **Décision** : renommer au pluriel.
   - **Impact** : `ALTER TABLE programme RENAME TO programmes;` + mise à jour des requêtes front (à grep en Phase 5).
   - **Risque** : modéré — toute requête `from('programme')` doit être mise à jour de manière atomique.

2. **Table `type_postes` → conserver**
   - **Décision** : ne pas renommer, malgré l'ordre des mots inversé.
   - **Justification** : refactor coûteux (FK `postes.type_poste_id` + nombreuses requêtes) pour gain cosmétique nul.
   - **Impact** : aucun.

3. **Booléens — OPTION A (`is_*` / `has_*`)**
   - **Décision** : adopter strictement la convention anglo `is_*` / `has_*`.
   - **Renommages prévus** :
     - `benevoles.vegetarien` → `is_vegetarien`
     - `benevole_repas.vegetarien` → `is_vegetarien`
     - `benevoles.t_shirt_recupere` → `has_recupere_tshirt`
     - `benevoles.presence_samedi` → `is_present_samedi`
     - `benevoles.presence_dimanche` → `is_present_dimanche`
     - `benevoles.cagnotte_forcee` → `is_cagnotte_forcee`
   - **Impact** : refactor lourd — 6 colonnes × N occurrences dans `src/`, vues (`admin_benevoles`, `public_planning`), triggers, fonctions PL/pgSQL.
   - **À prévoir** : grep exhaustif de chaque ancien nom avant migration, exécution atomique (migration SQL + commit JS dans la même PR).

4. **Triggers — préfixe `trg_*` adopté**
   - **Décision** : harmoniser les 3 triggers existants sur le préfixe `trg_*`.
   - **Renommages prévus** :
     - `check_role_change` → `trg_prevent_role_change`
     - `trigger_check_capacity` → `trg_check_capacity`
     - `trigger_check_time_conflict` → `trg_check_time_conflict`
   - **Impact** : faible — les triggers sont invisibles côté front, refactor purement SQL.

### Autres anomalies à traiter en Phase 2.6 (non arbitrées spécifiquement, action par défaut)

- `public_planning.inscrits_actuels` → `nb_inscrits_actuels` (singulier requis pour un scalaire).
- `t_shirt_recupere` vs `taille_tshirt` : harmoniser sur `tshirt_*` (déjà couvert par la décision #3 ci-dessus pour `has_recupere_tshirt`, et `taille_tshirt` reste cohérent).
- `auth_user_id` (orphan_relances) → `user_id` (harmonisation avec les autres FK vers `auth.users`).
- Fonction `public_debit_cagnotte` → renommer en `debit_cagnotte_public` (verbe en tête). Impact : RPC frontend à mettre à jour.

**Impact sur le plan** : aucun. Les migrations correspondantes seront créées en Phase 2.6 (`### 2.6 Harmonisation du nommage`).

---

## 2026-05-26 — Bugs hors-RLS détectés en Phase 1.9 (à traiter Phase 3)

### Bug B1 — `check_referent_access(target_benevole_id)` mort
**Contexte** : la fonction `SECURITY DEFINER` `check_referent_access` compare `postes.referent_id = auth.uid()`. Or `postes.referent_id` est une FK vers `benevoles(id)` (cf. `postes_referent_id_fkey` confirmé sur la DB locale). `auth.uid()` retourne `auth.users.id` = `benevoles.user_id`, **pas** `benevoles.id`.

**Conséquence** : la fonction retourne toujours `false`. La policy `benevoles.Referents can view volunteers` (qual = `check_referent_access(id)`) est inerte depuis l'ajout de la FK (migration `20260316083700_add_fk_postes_referent_id.sql`). La permission "référent voir ses bénévoles" repose en réalité uniquement sur la policy doublonnée `Referents can view benevoles on their postes` (qual = `is_referent_for_benevole(id)`, qui elle est correcte).

**Action** : supprimer la policy `Referents can view volunteers` ET la fonction `check_referent_access` (doublon mort), ou corriger la fonction pour faire un `JOIN benevoles ON ref.user_id = auth.uid()`. À trancher en Phase 3.3.

### Bug B2 — `is_admin_juge()` sans `SET search_path`
**Contexte** : contrairement à `is_admin`, `is_referent_for_benevole`, `check_referent_access` qui fixent explicitement `SET search_path = public`, la fonction `is_admin_juge()` ne le fait pas.

**Conséquence** : vecteur d'attaque CVE-2018-1058 standard pour fonctions `SECURITY DEFINER`. La migration `20251207165000_fix_security_search_path.sql` a corrigé les autres fonctions ; celle-ci est passée à travers.

**Action** : ajouter `SET search_path = public` à la définition. Migration ciblée en Phase 3 (criticité HAUT — sécurité).

**Référence** : `audit/16_rls.md` §3 et §5.

---

## 2026-05-26 — Décisions mainteneur arbitrées lors de la clôture de la Phase 1.10

Arbitrage des 8 questions ouvertes de `audit_db.md` (section « Décisions mainteneur en attente »). Date de validation : 2026-05-26.

### D1 — Rôles `juge` / `admin-juge` / `officiel` → **SUPPRESSION**
- Conserver uniquement `benevole`, `referent`, `admin` (3 rôles).
- Reclasser le 1 utilisateur `admin-juge` restant en base (décision de reclassement à acter en Phase 2).
- Nettoyer le code associé : fonction `is_admin_juge()`, fonction `get_family_tshirt_info_smart()`, policy `Admin-juges can update juges`, références dans `admin_benevoles`, etc.
- Enum `role_type` à créer en Phase 2.4 avec **3 valeurs**.
- À traiter **avant** la conversion `text → enum role_type`.

### D2 — Backfill `benevoles.telephone` → **`'INCONNU'`**
- Valeur sentinelle `'INCONNU'` sur les 12 lignes `NULL`.
- Permet de poser `NOT NULL` immédiatement.
- À traiter en Phase 2.3, **avant** le CHECK pattern téléphone (Phase 2.3 différée).

### D3 — UNIQUE `postes.(periode_id, type_poste_id)` → **RÉVISÉ (pas de UNIQUE simple)**
- Le UNIQUE simple est trop strict : cas légitime de deux créneaux consécutifs non-chevauchants d'un même type dans une même période (ex : "Accueil 8h-10h" + "Accueil 10h-12h" dans la période "Samedi 8h-12h").
- À la place : étudier en Phase 2.3 une contrainte d'**exclusion PostgreSQL** (`EXCLUDE USING gist`) sur `(type_poste_id, tsrange(periode_debut, periode_fin))` qui interdit le chevauchement temporel pour un même `type_poste_id`.
- Si la contrainte d'exclusion est trop complexe à mettre en place, on s'en passe (la cohérence est aujourd'hui assurée par l'UI Planning Interactif et le trigger `check_time_conflict` côté inscriptions).

### D4 — UNIQUE `programme.(date_ref, heure)` → **AJOUTÉ**
- Un seul événement par (jour, heure) — pas de doublons légitimes.
- Migration directe en Phase 2.3, 0 violation en base.

### D5 — Seuils CHECK métier
- **D5.a** — `cagnotte_transactions.montant` : `abs(montant) <= 100` (au lieu des 10 000 € proposés initialement). Cohérent avec les usages observés (max actuel = 19 €). Réduit drastiquement le risque de saisie aberrante.
- **D5.b** — `postes.nb_max <= 200`. Conserve la marge proposée (max actuel = 30).

### D6 — Politiques `ON DELETE`
- **D6.a** — `benevole_cagnotte_periodes.periode_id → periodes` : **CASCADE conservé** (statu quo).
- **D6.b** — `cagnotte_transactions.benevole_id → benevoles` : **passe à CASCADE** (au lieu de SET NULL actuel). Justification : usage-unique de l'app, pas de besoin de préserver l'historique cagnotte après suppression d'un bénévole.
- **D6.c** — `postes.periode_id → periodes` : **SET NULL conservé** (statu quo). Justification : l'UI Planning Interactif réaffecte automatiquement la `periode_id` de chaque shift par chevauchement temporel maximal à chaque sauvegarde (`admin/index.js:2264-2306`), donc aucun poste ne reste durablement orphelin via le flow officiel.

### D7 — Fonction `check_referent_access()` → **SUPPRESSION**
- Supprimer la fonction (UUID hétérogène, retourne toujours `false`) ET la policy `Referents can view volunteers` qui s'en sert.
- La couverture fonctionnelle reste intacte via la policy doublonnée `Referents can view benevoles on their postes` qui utilise `is_referent_for_benevole()` (correcte).
- À traiter en Phase 3.3.

### D8 — Stratégie Phase 8.1 → **HYBRIDE 2 FICHIERS**
Modèle adapté à l'usage-unique de l'application (un événement = un déploiement, nouvel événement = nouveau projet Supabase from-scratch). Deux artefacts indépendants :

1. **`supabase/migrations/00000000000000_init.sql`** *(source de vérité permanente)*
   - Reconstruit l'intégralité du Supabase from-scratch sur une base vierge.
   - Sections : extensions → enums → tables → vues → fonctions → triggers → policies → index.
   - Idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` avant `CREATE POLICY`).
   - Utilisé pour : nouveau projet Supabase futur, reconstruction locale, lecture documentaire.

2. **`prod_migration_YYYYMMDD.sql`** *(one-shot, jeté après usage)*
   - Contient uniquement le **delta** : `ALTER TABLE`, `DROP COLUMN`, `ADD CONSTRAINT`, `CREATE INDEX`, `DROP POLICY` + `CREATE POLICY`, etc. pour faire passer la prod actuelle (140 bénévoles, 308 inscriptions, 189 transactions) du schéma actuel au schéma cible.
   - Généré en Phase 2.9 via diff (`migra` ou équivalent) entre dump prod et schéma local cible.
   - Appliqué **une seule fois** sur la prod en Phase 8.1 via `psql` avec backup préalable.
   - **Jeté** après application (pas archivé dans `migrations/`).

**Impact sur le plan** :
- Phase 2.8 (Consolidation `init.sql`) → confirmée comme prévue.
- **Nouvelle tâche à insérer en Phase 2.9** : génération de `prod_migration.sql` par diff schéma prod ↔ schéma local cible.
- Phase 8.1 (Application en production) → reformuler : appliquer `prod_migration.sql` via `psql` (et non `supabase db push`).

Les migrations atomiques de la Phase 2 (utiles pour valider chaque changement sur le local) restent dans le repo mais ne sont **pas rejouées en prod** — leur effet cumulé est capturé par `prod_migration.sql`.

---

## 2026-05-26 — Divergence D4 vs réalité : `programme.(date_ref, heure)` n'est **pas** « 0 violation »

**Contexte** : la décision mainteneur D4 (ajout d'un UNIQUE sur `programme.(date_ref, heure)`) reposait sur l'affirmation « 0 violation en base » dans `audit_db.md`. Vérification effectuée en Phase 2.3 :

```sql
SELECT count(*) FROM programme;                                    -- 40
SELECT count(DISTINCT (date_ref, heure)) FROM programme;           -- 20
```

→ **20 paires de doublons exactement identiques** (même `description`, même `created_at` à la microseconde près, seul `id` diffère). Le backup `backups/20260525_data.sql` contient déjà ces 40 lignes (ligne 3877) — la prod est donc également affectée.

**Diagnostic** : duplication probable au moment d'un import initial (script de seed exécuté deux fois). Aucune des deux occurrences n'a de sens fonctionnel à part — il s'agit clairement de doublons à éliminer.

**Décision prise (sans escalade, action sûre)** : la migration `20260526130600_add_unique_constraints.sql` intègre un bloc `DELETE` préalable qui supprime les doublons (`WHERE id NOT IN (SELECT MIN(id::text)::uuid FROM programme GROUP BY date_ref, heure)`). Ce bloc est :
- **idempotent** : si exécuté plusieurs fois, ne supprime rien après le premier passage ;
- **traçable** : `RAISE NOTICE` du nombre de lignes supprimées ;
- **safe en prod** (Phase 8.1) : le dump prod du 2026-05-25 montre le même état doublonné, le DELETE remettra prod et local en cohérence.

**Conséquence sur l'audit** : `audit_db.md` ligne D4 (« 0 violation en base ») et `audit/13_constraints.md` Partie 1.6.2 #10 (« À vérifier ») doivent être amendés au prochain refresh d'audit.

---

## 2026-05-27 — Recommandation `.gitattributes` post-Phase 2.9

**Contexte** : la validation Phase 2.9 (cf. `audit/23_init_diff.md`) a révélé une divergence cosmétique entre le dump de référence et le dump post-application de `00000000000000_init.sql` due aux fins de ligne :

- `init.sql` est checkouté sur le poste de dev Windows avec CRLF.
- Les corps de fonctions PL/pgSQL préservent textuellement leur encodage lors de l'ingestion par Postgres.
- Conséquence : `pg_dump` ressort les fonctions avec CRLF après une application Windows, alors qu'une application via la séquence de migrations atomiques originale produit du LF pur.

**Impact fonctionnel** : nul (Postgres ignore les fins de ligne dans le bytecode PL/pgSQL).

**Recommandation** (à intégrer en Phase 4 ou 5, **pas maintenant**) : ajouter à la racine du repo un fichier `.gitattributes` contenant au minimum :

```gitattributes
*.sql text eol=lf
```

Bénéfices :

- garantit que tout `*.sql` du repo (init.sql, migrations futures, fixtures) reste en LF quel que soit le poste de checkout (Windows/macOS/Linux) ;
- rend `pg_dump --schema-only` déterministe entre postes — les futures validations Phase 2.9 (ou équivalentes lors d'un nouveau cycle de refacto) auront un diff strictement vide ;
- empêche que d'éventuels triggers/fonctions futurs aient des fins de ligne hétérogènes selon qui les a écrits.

Optionnellement, étendre à `*.md`, `*.js`, `*.json` selon la convention du projet — décision à prendre en Phase 5.5 (mise en place ESLint/Prettier).

**À retirer/intégrer** au moment du traitement de la tâche Phase 4.x ou 5.x correspondante.

---

## 2026-05-27 — Privilèges PostgREST manquants dans `init.sql` (Phase 3.4)

**Contexte** : pendant la rédaction de `security/rls_tests.sql` (Phase 3.4 #1), la première exécution échoue avec `permission denied for table benevoles` sur **toutes** les tables, pour `anon` comme `authenticated`. Diagnostic :

- `information_schema.role_table_grants WHERE grantee IN ('anon','authenticated')` retourne **0 ligne** sur tout `public.*` ;
- l'usage du schéma est correct (`USAGE` accordé) ;
- le dump prod d'origine (`backups/20260525_schema.sql`) contient **135 statements `GRANT`** dont `GRANT ALL ON TABLE public.<t> TO anon|authenticated|service_role` pour chaque table ;
- `supabase/migrations/00000000000000_init.sql` (généré en Phase 2.8 via `pg_dump --no-privileges`) ne contient **aucun GRANT**.

**Impact réel** : ce n'est pas qu'un problème de tests RLS. **PostgREST sert anon/authenticated** ; sans GRANT table-level, toute requête frontend échouerait avec `permission denied` **avant même l'évaluation des policies RLS**. Si init.sql était re-déployé tel quel sur une instance vierge, l'API entière serait morte.

**Cause racine** : Phase 2.8 a strippé les privilèges avec `--no-privileges` pour simplifier le diff ; la validation Phase 2.9 ne vérifie que la structure (tables/vues/fonctions/policies), pas les privilèges. Le test de réimport sur DB vierge n'a pas levé l'erreur parce qu'il ne fait pas tourner PostgREST.

**Action immédiate (Phase 3.4)** : créer une migration `20260527120000_restore_postgrest_grants.sql` qui :
- `GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role` ;
- pour chaque table de `public.*` : `GRANT ALL ON TABLE ... TO anon, authenticated, service_role` (RLS filtre ensuite) ;
- pour chaque vue : `GRANT SELECT` à `anon, authenticated`, `GRANT ALL` à `service_role` ;
- pour chaque sequence : `GRANT USAGE, SELECT, UPDATE` à `anon, authenticated, service_role` ;
- pour chaque fonction : `GRANT EXECUTE` à `anon, authenticated, service_role` ;
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ...` pour que les futurs objets héritent.

Migration idempotente via DO blocks. Cf. nouvelle case **3.4.0** ajoutée au `plan_refactoring.md`.

**Action différée (à intégrer ultérieurement)** : lors de la prochaine régénération d'`init.sql`, **NE PAS** utiliser `--no-privileges` ; ou bien post-traiter le dump pour réintégrer les GRANTs. À noter dans le futur "post-mortem Phase 2.8" si jamais on rejoue cette phase.

---

## 2026-05-27 — Clé OpenRouter exposée côté client (T3 / Phase 3.5)

**Contexte** : `VITE_OPENROUTER_API_KEY` est lue dans [src/js/modules/admin/index.js:1299](src/js/modules/admin/index.js#L1299) via `import.meta.env.VITE_OPENROUTER_API_KEY`. Le préfixe `VITE_` la fait embarquer en clair dans le bundle JS public (`dist/assets/admin-*.js`).

**Problème** : la clé est extractible par n'importe quel visiteur du site (la page admin est cachée par RLS, mais le bundle JS lui est servi à tous). Risque : abus du quota OpenRouter, facturation imprévue.

**Vérifié** : `.github/workflows/deploy.yml:39` injecte bien `VITE_OPENROUTER_API_KEY` depuis les secrets GitHub Actions → le bundle prod contient la vraie clé.

**Options à arbitrer avec le mainteneur** :
1. **Proxy via Edge Function** : créer une Edge Function `openrouter-proxy` qui vérifie le rôle `admin` (cf. pattern `create-benevole`) et relaie la requête à OpenRouter avec un secret `OPENROUTER_API_KEY` côté serveur. La clé n'est plus exposée. **Recommandé**.
2. **Restriction de la clé OpenRouter** : si OpenRouter supporte des restrictions par origin/IP/quota strict, configurer la clé pour qu'elle ne soit utilisable que depuis l'URL de prod, avec un plafond bas. **Atténuation partielle**.
3. **Désactiver la fonctionnalité** en prod si elle n'est pas critique.

**Hors scope T3 Phase 3.5** : la T3 vise uniquement la documentation du périmètre dans `.env.example` (faite). Le fix applicatif est à ajouter au plan (nouvelle case en Phase 3.5 ou Phase 5).

**À traiter avant** : Phase 8 (mise en prod).

**Mise à jour 2026-05-27** : clé OpenRouter **révoquée par le mainteneur** sur le dashboard OpenRouter (`https://openrouter.ai/settings/keys`). Le bundle prod déployé actuellement contient toujours la clé (désormais inopérante). Le retrait du code et du secret GH Actions est tracé en **Phase 4.2.1** du plan (5 cases atomiques).

**Mise à jour 2026-05-28 (Phase 4.2 exécutée)** :
- Code `generateRapportIA` supprimé de `src/js/modules/admin/index.js`.
- Variable `VITE_OPENROUTER_API_KEY` retirée de `.github/workflows/deploy.yml` et `.env.example`.
- Partial orphelin `src/partials/sections/admin/tab-rapport-ia.html` supprimé.
- **Action mainteneur restante** : retirer le secret `VITE_OPENROUTER_API_KEY` côté GitHub Actions (`Settings → Secrets and variables → Actions`). Au prochain build, le bundle déployé ne contiendra plus la clé même si le secret est encore présent (plus aucune référence applicative).
- **Mise à jour 2026-05-28** : secret `VITE_OPENROUTER_API_KEY` **supprimé côté GitHub Actions par le mainteneur**. Phase 4.2.1 entièrement terminée (5/5 cases cochées).

---

## 2026-05-28 — Phase 4.2 — Récap suppressions code mort

**Fichiers supprimés** : `check-role.js` (script debug à corps vide), `src/partials/sections/admin/tab-rapport-ia.html` (partial orphelin OpenRouter).

**Dépendances désinstallées** : `html5-qrcode` (jamais importée), `depcheck` (outil d'audit ponctuel, relançable via `npx`), `dotenv` (utilisée uniquement par `check-role.js`).

**`dist/` versionné** : retiré du suivi git via `git rm -r --cached dist/` + `.gitignore` mis à jour (`dist/` ignoré). La validation déploiement GitHub Pages reste à confirmer en Phase 8.

**Méthodes / propriétés Alpine mortes supprimées (25 + 8 cascade = 33 entrées)** :
- Vague A — AdminModule : `generateRapportIA`, `isReferentInscritPeriode`, `getFilteredPostes`, `updatePosteReferent`, `viewPosteInscrits`, `closePosteInscritsModal`, `loadBenevoles` (alias), `getPostesCountForPeriode`, `getPeriodeInscritsColor`, `getPeriodesCritiques`, `getPostesCritiques`, `getTauxCouleur`, `addVisualLine`, `addVisualShift`, `deleteVisualShift`, `addVisualPeriod`, `deleteVisualPeriod`, `savingConfig`.
- Vague B — PlanningModule : `toggleView`, `openRegistrationModal`, `closeRegistrationModal`.
- Vague C — WizardModule : `toggleWizardProfile`, `validateStep1`.
- Vague D — store.js / admin-timeline.js : `getRepasName`, `resetDay`.
- Cascade : helpers AdminModule `getBenevolesInscritsForPeriode`, `getBenevolesMinForPeriode`, `getBenevolesMaxForPeriode` ; états `posteFilterPeriode`, `selectedPoste`, `selectedPosteInscrits`, `showPosteInscritsModal`, `selectedPosteForRegistration` (PlanningModule).

**DoD finale** : `node scripts/audit-alpine-methods.js` → 0 candidat ; `npm run build` → OK.

---

## 2026-05-28 — Phase 4.3.3 — Variables locales non utilisées détectées par ESLint

**Contexte** : exécution de `npx eslint src/` (ESLint 10 + `no-unused-vars`) en Phase 4.3.3. La DoD du plan demande explicitement *« aucun import mort »* — **strictement satisfaite** (zéro import inutilisé signalé).

En revanche, la règle `no-unused-vars` détecte 10 **variables locales** non utilisées qui sortent du périmètre atomique de la tâche 4.3.3 (atomicity first). À traiter dans une tâche future (probablement Phase 5.5 quand ESLint sera configuré durablement avec husky/lint-staged) :

| Fichier | Ligne | Variable | Type |
|---|---|---|---|
| `src/js/admin-timeline.js` | 141 | `padB` | local var |
| `src/js/modules/admin/index.js` | 343 | `poste` | local var |
| `src/js/modules/admin/index.js` | 733 | `dispo` | useless-assignment |
| `src/js/modules/admin/index.js` | 734 | `total_consomme` | useless-assignment |
| `src/js/modules/admin/index.js` | 1855 | `hasShifts` | local var |
| `src/js/modules/admin/index.js` | 2250 | `e` | catch param |
| `src/js/modules/admin/index.js` | 2457 | `err` | catch param |
| `src/js/modules/admin/index.js` | 2801 | `rect` | local var |
| `src/js/modules/user/planning.js` | 746 | `data` | destructuring partiel |
| `src/js/modules/user/wizard.js` | 553 | `data` | destructuring partiel |

**Action recommandée** : nettoyage groupé en Phase 5.5 (mise en place définitive d'ESLint + Prettier).

**Note technique** : `eslint.config.js` installé en racine (config minimale flat ESM ciblée `src/**/*.js`), packages `eslint`, `@eslint/js`, `globals` ajoutés en `devDependencies`. Cette config est volontairement minimaliste — elle sera remplacée par la config complète de la Phase 5.5.
