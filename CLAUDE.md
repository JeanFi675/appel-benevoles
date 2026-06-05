# CLAUDE.md — Contexte pour agents IA

Ce fichier est destiné aux agents IA qui travailleront sur ce projet. Lis-le entièrement avant de toucher au code.

---

# 📜 RÈGLES DE DÉVELOPPEMENT & CONSIGNES DU PROJET (Standard Mai 2026)

## 👤 Role & Expertise

Tu es un développeur Full-Stack Senior spécialisé dans la création d'applications web performantes, sécurisées et maintenables. Ta priorité absolue est la qualité du code pour la mise en production (standard Mai 2026).

## 💻 Tech Stack

- **Frontend** : Vite, Alpine.js, HTML, CSS
- **Backend/DB** : Supabase (PostgreSQL)

## 🥇 Règle d'or : Atomicity First

- **Pas de refactoring massif** en une seule fois.
- Propose des **changements atomiques** (un composant ou une fonction à la fois).
- **Zéro code mort** : Supprime le code inutile lors des refactorisations.

## 🎨 Frontend Skills (Alpine.js & Vite)

- **Évite le "Spaghetti DOM"** : Interdiction d'écrire des attributs `x-data` contenant plus de 3 lignes de logique.
- **Organisation logique** : Utilise systématiquement `Alpine.data()` et `Alpine.store()` dans des fichiers `.js` séparés pour la logique métier complexe.
- **Build optimal** : Assure-toi que la configuration de Vite génère des assets optimisés (minification, tree-shaking).

## 🔒 Backend Skills (Supabase & PostgreSQL)

- **Sécurité stricte** : Chaque table **DOIT** avoir des règles RLS (Row Level Security) actives et configurées avec précision.
- **Pas de contournement** : Ne propose pas de contourner la sécurité via la clé `service_role` sur le frontend.
- **Changements documentés** : Les modifications de base de données doivent être documentées sous forme de scripts SQL de migration propres dans `supabase/migrations/`.

## ✍️ Documentation & Clean Code

- **Commentaires** : Commente la logique complexe dans les fichiers JS.
- **README** : Maintiens le README à jour avec les commandes pour lancer le projet et l'architecture de la base de données.
- **Qualité de code** : Respecte scrupuleusement les principes DRY (Don't Repeat Yourself) et SOLID.

---

## Contexte du projet

Système **générique** de gestion de bénévoles pour n'importe quel évènement nécessitant un appel à bénévoles. Initialement créé pour le **Championnat de France d'escalade de difficulté jeunes 2026** (édition réussie), il est en cours de généralisation : l'identité de l'évènement (titre, adresse) est désormais paramétrable dans Admin → Configuration (`config.event_title` / `config.event_address`) plutôt qu'écrite en dur. Application **en production active** au moment de la lecture de ce fichier. Une seule instance d'évènement à la fois (pas de multi-évènements simultanés).

---

## ⚠️ AVERTISSEMENTS CRITIQUES

### 1. `.env` pointe sur la prod ; le local n'est actif que via `.env.local`

Le fichier `.env` versionné référence la **base Supabase de production** (il n'existe pas d'environnement de staging). Le défaut depuis le refactoring est que `.env.local` (non versionné) override `.env` et fait pointer `npm run dev` sur l'instance Supabase locale (Docker). Mais si `.env.local` est absent, renommé ou désactivé, **`npm run dev` repointe immédiatement sur la prod**. Avant toute opération d'écriture en dev :

- Vérifier que `supabase status` retourne les URLs locales et que `.env.local` existe (`ls .env.local`).
- Ne jamais lancer de migration destructive, vider une table ou tester une insertion massive sans confirmation explicite du mainteneur.
- Pour écrire intentionnellement en prod, passer par le garde-fou `scripts/check-env.js` (cf. avertissement #4).

### 2. Logique métier dans les triggers PostgreSQL

Les règles de capacité et de conflits horaires sont dans les triggers SQL `trg_check_capacity` et `trg_check_time_conflict` (cf. `-- Purpose:` en en-tête des fonctions dans `supabase/migrations/00000000000000_init.sql`), **pas dans le frontend**. Ne pas les contourner côté JS. Ne pas les dupliquer non plus.

### 3. Ne pas modifier les politiques RLS sans expertise

Les politiques RLS sur toutes les tables `public.*` sont en `FORCE ROW LEVEL SECURITY` (Phase 3.1) et s'appuient sur 5 helpers `SECURITY DEFINER` (`auth_has_role`, `is_admin`, `is_own_benevole`, `is_referent_for_poste`, `is_referent_for_benevole`) pour éviter toute récursion. Source de vérité : les 4 migrations `supabase/migrations/20260527*.sql` (enable force, helpers, policies, postgrest grants). Une mauvaise policy peut exposer des données personnelles ou bloquer les utilisateurs — toute modification doit être testée avec un compte non-admin **en plus** d'un compte admin.

### 4. Garde-fou prod : `scripts/check-env.js`

Toute opération `npm run db:push` ou équivalente ciblant la production est bloquée tant que (a) `.env.local` n'a pas été désactivé ET (b) la variable `PHASE=8` n'est pas active ET (c) le flag `--force-prod` n'est pas passé. Le hook `.husky/pre-push` bloque également tout push direct sur `master`. Ces garde-fous existent pour éviter une régression accidentelle — ne jamais les contourner via `--no-verify`.

---

## Environnements

Une instance **Supabase locale** (Docker) est disponible. Tant que `supabase start` est actif et que `.env.local` existe, **`npm run dev` pointe sur l'instance locale**, pas sur la prod.

### Bascule LOCAL ↔ PROD

| Action                            | Commande                                               | Cible                            |
| --------------------------------- | ------------------------------------------------------ | -------------------------------- |
| Dev local (par défaut)            | `npm run dev` ou `npm run dev:local`                   | Supabase local `127.0.0.1:54321` |
| Repointer temporairement sur prod | `mv .env.local .env.local.disabled` puis `npm run dev` | Supabase prod (URL du `.env`)    |
| Revenir sur local                 | `mv .env.local.disabled .env.local` puis `npm run dev` | Supabase local                   |

**Mécanisme** : Vite charge automatiquement `.env.local` après `.env` ; les variables de `.env.local` overrident celles de `.env`. Désactiver `.env.local` (en le renommant) suffit à repointer sur prod.

### Démarrer / arrêter l'instance Supabase locale

```bash
supabase start            # Démarre tous les services (Postgres, Auth, Studio, ...)
supabase status           # URLs et credentials de l'instance locale
supabase stop             # Arrête sans purger les données
supabase stop --no-backup # Arrête et purge le volume DB (reset complet)
```

URLs locales standards :

- API/REST : `http://127.0.0.1:54321`
- DB : `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Studio (UI) : `http://127.0.0.1:54323`
- Inbucket/Mailpit (emails de test) : `http://127.0.0.1:54324`

### Restaurer un dump prod dans le local

```bash
# Pré-requis : dump à jour dans backups/ (voir backups/README.md)
docker exec -i supabase_db_appel-benevoles psql -U postgres -d postgres -v ON_ERROR_STOP=0 < backups/YYYYMMDD_schema.sql
docker exec -i supabase_db_appel-benevoles psql -U postgres -d postgres -v ON_ERROR_STOP=0 < backups/YYYYMMDD_data.sql
```

### État des migrations

Le dossier `supabase/migrations/` actif contient :

- `00000000000000_init.sql` — consolidation complète du schéma (dump prod du 2026-05-27, idempotent, sectionné).
- `20260527100000_enable_force_rls.sql` → `20260527120000_restore_postgrest_grants.sql` — 4 migrations Phase 3 (FORCE RLS, helpers DEFINER, ~37 policies, restauration des GRANTs PostgREST).
- `_archive/` — migrations atomiques Phase 2 (drop tables/colonnes, contraintes, typages, index, renames) — conservées pour traçabilité, hors du chemin actif.

Le dossier `supabase/migrations_archive_pre_refactor/` (à la racine de `supabase/`) contient les 30+ migrations historiques pré-refacto. **Ces migrations ne sont pas reproductibles from-scratch** (la migration 006 référence une colonne `user_id` jamais créée par une migration antérieure) — elles sont conservées en archive uniquement, ne jamais les rejouer.

---

## Stack et versions

| Outil                 | Version  | Usage                             |
| --------------------- | -------- | --------------------------------- |
| Node.js               | 20+      | Runtime de build                  |
| Vite                  | ^7.3.0   | Bundler + dev server              |
| Alpine.js             | ^3.13.3  | Réactivité frontend               |
| Tailwind CSS          | ^3.3.5   | Styles utilitaires                |
| vite-plugin-html      | ^3.2.2   | Templates EJS + minification HTML |
| @supabase/supabase-js | ^2.39.0  | Client DB/Auth                    |
| qrcode                | ^1.5.4   | Génération + lecture QR code      |
| Supabase CLI          | latest   | Migrations et Edge Functions      |
| Deno                  | latest   | Runtime des Edge Functions        |
| ESLint                | ^10      | Linter JS (flat config)           |
| Prettier              | ^3       | Formatter                         |
| Husky + lint-staged   | ^9 / ^17 | Hooks Git locaux                  |

---

## Commandes importantes

```bash
# Développement (local par défaut si .env.local actif)
npm run dev               # Vite dev server sur localhost:5173
npm run dev:local         # Force le chargement de .env.local

# Build & qualité
npm run build             # Build production dans dist/
npm run preview           # Prévisualiser le build local
npx eslint src/           # Linter
npx prettier --check src/ # Vérifier le formatage
npx knip                  # Détecter le code mort

# Supabase (prod = nécessite PHASE=8 + --force-prod, cf. avertissement #4)
supabase start                                  # Démarrer l'instance locale (Docker)
supabase db push --linked --force-prod          # Appliquer les migrations en prod (Phase 8 only)
supabase functions deploy <nom>                 # Déployer une Edge Function
supabase secrets set CLE=valeur                 # Configurer secrets Edge Functions
```

---

## Architecture des données

### Tables principales

Voir [`DATABASE.md`](DATABASE.md) pour la liste exhaustive + ERD + matrice RLS. Résumé :

```sql
benevoles               -- Profils utilisateurs (N:1 avec auth.users via user_id ; multi-profils famille)
postes                  -- Créneaux de bénévolat (type_poste + période + horaires + nb_max)
type_postes             -- Catalogue des intitulés de poste (référencé par postes.type_poste_id)
inscriptions            -- Jonction benevoles ↔ postes (triggers capacité + conflit horaire)
periodes                -- Blocs temporels de compétition (ex: "Qualif Samedi")
jours                   -- Jours du championnat
programmes              -- Lignes de programme par jour (events horaires)
repas / benevole_repas  -- Repas proposés + jonction (vegetarien ou normal)
cagnotte_transactions   -- Crédit/débit cagnotte (immuable : UPDATE/DELETE = DENY)
benevole_cagnotte_periodes -- Cagnotte forcée par période
config                  -- Feature flags et paramètres (clé/valeur)
orphan_relances         -- Comptes auth sans profil bénévole (stocke le téléphone saisi par l'admin)
```

### Rôles utilisateurs

Énumération `role_type` (enum PostgreSQL strict, stocké dans `benevoles.role`) :

- `benevole` — accès page principale (inscriptions, cagnotte famille, repas)
- `referent` — voir les inscriptions de ses postes (`postes.referent_id`)
- `admin` — accès complet

Les rôles historiques `juge`, `admin-juge` et `officiel` ont été supprimés en Phase 2.3 (cf. CHANGELOG `[1.0.0]`).

### Feature flags (table `config`)

- `cagnotte_active` : active/désactive l'affichage cagnotte côté bénévole.
- `tshirt_question_active` : active/désactive la question taille T-shirt dans le wizard.
- `tarif_cagnotte_journee` : montant crédité par journée de cagnotte forcée (défaut 15.00 €).
- `event_title` : titre de l'évènement (clé d'**identité générique**). Alimente le header public (`x-text="eventTitle"`) et le `<title>` des pages via `document.title`. Repli `« Appel aux Bénévoles »` si vide. Édité dans Admin → Configuration → « Identité de l'évènement ».
- `event_address` : adresse / lieu de l'évènement. Stocké en config (affichage dans les emails prévu ultérieurement).

> **Application générique** : le site ne référence plus aucun évènement précis (ni championnat, ni escalade). Tout libellé d'évènement provient de `event_title`. Ne pas réintroduire de nom d'évènement en dur dans le code.

---

## Conventions de code à respecter

Ce projet n'avait pas de conventions formelles initialement. Voici celles à adopter pour tout nouveau code :

### Structure d'une nouvelle page

Chaque nouvelle page suit ce patron :

1. Un fichier HTML racine (`ma-page.html`) — template EJS
2. Un fichier JS d'entrée (`src/js/ma-page.js`) — initialise Alpine.js
3. Des partials HTML dans `src/partials/sections/ma-page/`
4. Si nécessaire, un composant `Alpine.data('maPage', () => ({...}))` dans `src/js/components/`
5. Déclaration dans `vite.config.js` (plugins + rollupOptions)

### JavaScript

- **Alpine.js** pour tout ce qui est réactif dans le DOM. Composants nommés dans `src/js/components/`, state partagé dans `src/js/stores/`.
- **Pas de classes JS** — utiliser des objets littéraux retournés par des fonctions (factory).
- **Pas d'appel direct à `supabase`** dans un composant ou un module métier — passer par `ApiService` / `AuthService` / `PublicApiService` (`src/js/services/`).
- Préfixer les méthodes de chargement par `load` : `loadProfiles()`, `loadPostes()`.
- Préfixer les méthodes de sauvegarde par `save` : `saveProfile()`.
- Les méthodes qui modifient des données doivent afficher un toast (via `pushToast` / `Alpine.store('admin').showToast`) en succès ou erreur.
- Voir [`ARCHITECTURE.md`](ARCHITECTURE.md) pour la structure complète, [`CONTRIBUTING.md`](CONTRIBUTING.md) pour les conventions détaillées.

### HTML / Partials

- Les partials sont des fragments EJS (`<%- include('chemin') %>`)
- Ne pas mettre de logique métier dans les templates HTML
- Les attributs Alpine.js (`x-data`, `x-on:click`, etc.) en kebab-case
- Utiliser les classes Tailwind, pas de CSS inline

### SQL / Migrations

- Nommer les fichiers de migration : `YYYYMMDDHHMMSS_description_courte.sql`
- Toujours inclure `-- Migration: description` en en-tête + un bloc `-- Purpose:` sur toute nouvelle fonction/trigger complexe
- Tester mentalement l'impact RLS avant toute migration (helpers DEFINER + `FORCE ROW LEVEL SECURITY`)
- Ne jamais modifier une migration déjà appliquée en prod — créer une nouvelle
- Toute nouvelle fonction `SECURITY DEFINER` doit fixer `SET search_path = public` (anti-hijack)

### Tailwind CSS

- Utiliser les tokens custom : `brutal-black`, `brutal-ice`, `brutal-white`
- Ombres : `shadow-brutal`, `shadow-brutal-sm`, `shadow-brutal-hover`
- Police body : `font-sans` (Space Grotesk), titres : `font-heading` (Inter)
- Pas de valeurs hardcodées pour couleurs et ombres — utiliser les tokens

---

## Pièges et points d'attention

### Client Supabase unique

Le client Supabase est initialisé dans `src/js/config.js` (ES module npm). C'est le seul client — ne pas en créer un second.

### Singleton de refresh Supabase

`src/js/config.js` contient un mécanisme de déduplication des appels de refresh de token. Ne pas le modifier — il évite des race conditions lors du chargement de pages avec plusieurs appels Supabase simultanés.

### Triggers PostgreSQL — ne pas contourner

Les triggers `trg_check_capacity` et `trg_check_time_conflict` (fonctions `check_capacity()` et `check_time_conflict()`) sont en base. Si un INSERT dans `inscriptions` échoue, c'est normal — afficher l'erreur à l'utilisateur. Ne pas gérer cette logique côté frontend. La RPC `manage_inscriptions_transaction` ré-vérifie capacité + conflit sous `SELECT ... FOR UPDATE` (défense en profondeur).

### Anonymisation des données publiques

La vue `public_planning` anonymise les bénévoles inscrits en "Prénom + Initiale" (ex: "Marie D.", via `get_benevole_name()`). Ne jamais exposer les noms complets dans une vue ou requête réellement publique. **Attention** : `public_planning` expose aussi les coordonnées non anonymisées du référent (`referent_nom/email/telephone`) ; depuis la migration `20260605140000`, l'accès `anon` à cette vue a été **révoqué** — elle n'est lisible que par `authenticated` (les deux consommateurs, `index.html` et `besoins.html`, exigent une session). Ne pas re-`GRANT … TO anon` sans retirer au préalable les colonnes référent. Le seul point d'accès **anonyme** restant est la RPC `get_public_inscriptions()` (`SECURITY DEFINER`, ne renvoie que `poste_id` + nom anonymisé).

### Récursion RLS

Toutes les policies passent par des helpers `SECURITY DEFINER` (`auth_has_role`, `is_admin`, `is_own_benevole`, `is_referent_for_poste`, `is_referent_for_benevole`) — aucune sous-requête directe sur une table à RLS dans une expression de policy. Si tu écris une nouvelle policy, suis ce pattern. En cas de timeout sur une requête après modification RLS, c'est probablement une récursion réintroduite.

### `npm run dev` peut repointer sur la prod

Voir avertissement critique #1. Si `.env.local` est absent/désactivé, les inscriptions, profils et transactions créées en dev seront réels. Vérifier `supabase status` + présence de `.env.local` avant tout test d'écriture.

---

## Ce qu'il NE faut PAS modifier sans précaution

| Élément                                                                                   | Risque                                       | Précaution                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Triggers SQL (`trg_check_capacity`, `trg_check_time_conflict`, `trg_prevent_role_change`) | Inscriptions en double, privilege escalation | Tester sur l'instance Supabase locale ; ne pas dupliquer côté front              |
| Policies RLS sur `benevoles`, `inscriptions`, `benevole_repas`                            | Fuite de données personnelles                | Lire les 4 migrations `20260527*.sql` avant ; tester en non-admin                |
| Policies RLS sur `cagnotte_transactions`                                                  | Solde altéré ou exposé                       | `UPDATE`/`DELETE` = DENY immuable ; corriger via transactions compensatoires     |
| Helpers RLS `SECURITY DEFINER`                                                            | Récursion ou bypass                          | Toujours `SET search_path = public` ; ne pas appeler une RLS-table dans le corps |
| `src/js/config.js` — singleton refresh                                                    | Race conditions d'authentification           | Ne pas simplifier sans comprendre                                                |
| Garde-fou `scripts/check-env.js`                                                          | Migration prod accidentelle                  | Ne pas contourner — exiger `PHASE=8` + `--force-prod`                            |
| Table `config` — `cagnotte_active`                                                        | Désactiver la cagnotte en production         | Confirmer avec le mainteneur                                                     |
| Schema `auth.users` (Supabase)                                                            | Casse l'authentification                     | Ne jamais modifier directement                                                   |
| `vite.config.js` — `base: "./"`                                                           | Chemins cassés sur GitHub Pages              | Garder `"./"` pour déploiement relatif                                           |
| `supabase/migrations/00000000000000_init.sql`                                             | Schéma divergent prod ↔ local                | Ne pas éditer manuellement après go-live — créer une nouvelle migration          |

---

## Edge Functions

Trois fonctions Deno dans `supabase/functions/` (toutes utilisent `SUPABASE_SERVICE_ROLE_KEY` via `supabase secrets set` — jamais en clair dans le repo) :

| Fonction          | Usage                                                    |
| ----------------- | -------------------------------------------------------- |
| `create-benevole` | Création d'un compte Auth + profil bénévole par un admin |
| `send-planning`   | Envoie le planning personnalisé par email (SMTP)         |
| `send-rappel-all` | Rappel global à tous les bénévoles inscrits              |

Secrets requis : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SUPABASE_SERVICE_ROLE_KEY`. Ne jamais exposer la Service Role Key au frontend.

---

## Tests

Il n'y a pas de suite de tests JS automatisés. Les validations se font :

- Manuellement dans l'interface (sur l'instance Supabase locale).
- Via les contraintes PostgreSQL (triggers, RLS, CHECK).
- Via la page `admin-connexions.html` pour le diagnostic des comptes Auth orphelins.
- Via le script SQL `security/rls_tests.sql` (61 tests RLS) sur l'instance locale.

Avant tout déploiement d'une migration, vérifier mentalement :

1. L'impact sur les policies RLS existantes (tester avec un compte non-admin).
2. Les données existantes (migration rétrocompatible ?).
3. Les vues qui dépendent des tables modifiées (`admin_benevoles`, `public_planning`, etc.).
4. Si la migration ajoute une fonction `SECURITY DEFINER` : présence de `SET search_path = public`.

---

## Documentation complémentaire

- [`README.md`](README.md) — installation, déploiement, hotfix.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — structure de `src/` et choix techniques.
- [`DATABASE.md`](DATABASE.md) — schéma SQL, ERD, matrice RLS, triggers.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — conventions de code, workflow Git, revue de PR.
- [`CHANGELOG.md`](CHANGELOG.md) — historique des versions.
- [`docs/deployment.md`](docs/deployment.md) — procédures de mise en prod.
