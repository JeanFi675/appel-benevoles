# appel-benevoles

Système de gestion de bénévoles pour le **Championnat de France d'escalade de difficulté jeunes**.

Application mono-édition en production active : inscription des bénévoles, attribution des postes/créneaux, gestion des rôles (référent, juge, officiel, admin), cagnotte buvette, envoi des plannings par email, suivi t-shirts via QR code.

---

## Stack

| Couche    | Outils                                                        |
| --------- | ------------------------------------------------------------- |
| Frontend  | Vite 7, Alpine.js 3, Tailwind CSS 3, `vite-plugin-html` (EJS) |
| Backend   | Supabase (PostgreSQL, Auth, RLS, Edge Functions Deno)         |
| Outillage | ESLint 10, Prettier 3, Husky + lint-staged, knip              |
| Node      | 20+                                                           |

---

## Prérequis

| Outil                                                | Version          | Utilité                                      |
| ---------------------------------------------------- | ---------------- | -------------------------------------------- |
| [Node.js](https://nodejs.org/)                       | 20 ou supérieur  | Runtime de build et scripts                  |
| npm                                                  | livré avec Node  | Gestionnaire de paquets                      |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | dernière version | `supabase start`, migrations, Edge Functions |
| [Docker](https://www.docker.com/)                    | récent           | Requis par `supabase start` (Postgres local) |
| [Deno](https://deno.com/)                            | dernière version | Runtime des Edge Functions (déploiement)     |
| Git                                                  | récent           | Clonage et hooks                             |

> Sur Windows, `supabase start` requiert Docker Desktop actif.

---

## Installation

```bash
git clone https://github.com/<votre-org>/appel-benevoles.git
cd appel-benevoles
npm install
```

Le hook `prepare` (Husky) installe les hooks Git automatiquement après `npm install`.

---

## Configuration

1. Copier le template d'environnement :

   ```bash
   cp .env.example .env.local
   ```

2. Renseigner **au minimum** dans `.env.local` :

   ```dotenv
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

3. Vérifier la configuration :

   ```bash
   npm run check-env
   ```

### Trois périmètres de variables (voir `.env.example` pour le détail)

| Préfixe                | Périmètre                     | Exemples                                            |
| ---------------------- | ----------------------------- | --------------------------------------------------- |
| `VITE_*`               | Injecté dans le bundle public | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`       |
| (sans préfixe)         | Scripts Node / CLI Supabase   | `SUPABASE_SERVICE_ROLE_KEY` — **jamais côté front** |
| Secrets Edge Functions | `supabase secrets set ...`    | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`  |

### Override `.env.local` vs `.env`

Vite charge `.env` puis `.env.local` — les valeurs du second écrasent celles du premier. Le repo fournit un `.env` pointé sur la **prod** : tant que `.env.local` existe et pointe vers l'instance Supabase locale, `npm run dev` reste sur le local. Renommer `.env.local` en `.env.local.disabled` repointe `npm run dev` sur la prod (à utiliser avec précaution, voir `CLAUDE.md`).

---

## Lancement en développement

### Avec instance Supabase locale (recommandé)

```bash
supabase start              # Démarre Postgres, Auth, Studio en local (~30 s)
npm run dev                 # Vite sur http://localhost:5173
```

URLs locales standards (cf. `supabase status`) :

- API REST : `http://127.0.0.1:54321`
- Studio (UI DB) : `http://127.0.0.1:54323`
- Inbucket (emails de test) : `http://127.0.0.1:54324`

Arrêt : `supabase stop` (conserve les données) ou `supabase stop --no-backup` (purge complète).

### Sans instance locale (pointe sur la prod)

> ⚠️ Toute opération de données affecte les vrais utilisateurs. Voir `CLAUDE.md` §1.

```bash
mv .env.local .env.local.disabled
npm run dev
```

---

## Build de production

```bash
npm run build              # Génère dist/ optimisé (minification, code-split)
npm run preview            # Sert dist/ sur http://localhost:4173
```

`vite.config.js` conserve `base: "./"` pour un déploiement à chemin relatif (GitHub Pages).

---

## Qualité de code

```bash
npx eslint src/            # Lint
npx prettier --check src/  # Format
npx knip                   # Détection de code mort
```

Le hook `pre-commit` (Husky + lint-staged) applique `eslint --fix` et `prettier --write` sur les fichiers stagés.

---

## Base de données

```bash
npm run db:push            # Vérifie .env puis exécute `supabase db push`
```

Les migrations vivent dans `supabase/migrations/` (nommage chronologique, jamais modifiées après application en prod). Voir `DATABASE.md` pour le schéma, les policies RLS et les triggers.

---

## Edge Functions

Cinq fonctions Deno dans `supabase/functions/` :

| Fonction                | Rôle                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `send-planning`         | Envoie son planning à un bénévole par email                   |
| `send-rappel-all`       | Rappel groupé à tous les bénévoles                            |
| `send-relance`          | Relance ciblée                                                |
| `send-relance-orphelin` | Relance des bénévoles sans inscription                        |
| `create-benevole`       | Création de compte par un admin (utilise la Service Role Key) |

Déploiement individuel :

```bash
supabase functions deploy send-planning
supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=...
```

---

## Déploiement

Voir [`docs/deployment.md`](docs/deployment.md) pour la procédure complète (CI/CD frontend GitHub Actions, variables d'environnement de prod, déploiement des Edge Functions, application des migrations en prod, rollback).

---

## Documentation complémentaire

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — vue d'ensemble, choix techniques, structure des dossiers
- [`DATABASE.md`](DATABASE.md) — schéma, RLS, triggers, fonctions PL/pgSQL
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — conventions, workflow Git, revue de PR
- [`CHANGELOG.md`](CHANGELOG.md) — historique des versions
- [`CLAUDE.md`](CLAUDE.md) — contexte pour les agents IA (avertissements critiques)

---

## Licence

Projet privé, usage interne dans le cadre de l'organisation du Championnat de France d'escalade de difficulté jeunes.
