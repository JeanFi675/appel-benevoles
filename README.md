# appel-benevoles

Système **générique** de gestion de bénévoles pour tout évènement nécessitant un appel à bénévoles.

Le titre et l'adresse de l'évènement se configurent dans Admin → Configuration (« Identité de l'évènement ») — aucun nom d'évènement n'est écrit en dur. Initialement créé pour le **Championnat de France d'escalade de difficulté jeunes 2026**, puis généralisé. Application en production active : inscription des bénévoles, attribution des postes/créneaux, gestion des rôles (bénévole, référent, admin), cagnotte buvette, envoi des plannings par email, suivi t-shirts via QR code.

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

| Préfixe                | Périmètre                     | Exemples                                                        |
| ---------------------- | ----------------------------- | --------------------------------------------------------------- |
| `VITE_*`               | Injecté dans le bundle public | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                   |
| (sans préfixe)         | Scripts Node / CLI Supabase   | `SUPABASE_SERVICE_ROLE_KEY` — **jamais côté front**             |
| Secrets Edge Functions | `supabase secrets set ...`    | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`              |
| Secrets GitHub Actions | Settings → Secrets → Actions  | `SUPABASE_DB_URL`, `BACKUP_GPG_PASSPHRASE` (cron de sauvegarde) |

> 🗄️ **Cron de sauvegarde** — le workflow [`.github/workflows/backup.yml`](.github/workflows/backup.yml) dumpe la prod chaque nuit (03:00 UTC), chiffre le dump en GPG AES256 et le stocke en artifact privé. Il exige deux secrets repo à configurer dans **Settings → Secrets and variables → Actions** :
>
> | Secret                  | Description                                                                          |
> | ----------------------- | ------------------------------------------------------------------------------------ |
> | `SUPABASE_DB_URL`       | Chaîne de connexion **Session Pooler IPv4** de la prod (contient le mot de passe DB) |
> | `BACKUP_GPG_PASSPHRASE` | Passphrase de chiffrement AES256 des dumps (à conserver **hors** GitHub)             |
>
> Sans `BACKUP_GPG_PASSPHRASE`, les dumps sont inexploitables. Détail complet : [`docs/deployment.md`](docs/deployment.md) et [`docs/disaster_recovery.md`](docs/disaster_recovery.md).
>
> 💡 **Effet de bord utile** : ce dump quotidien ouvre une vraie connexion DB chaque jour, ce qui constitue une « activité » au sens du plan **Supabase Free** et **évite la mise en pause automatique du projet** après une semaine d'inactivité.

### Override `.env.local` vs `.env`

Vite charge `.env` puis `.env.local` — les valeurs du second écrasent celles du premier. Le repo fournit un `.env` pointé sur la **prod** : tant que `.env.local` existe et pointe vers l'instance Supabase locale, `npm run dev` reste sur le local. Renommer `.env.local` en `.env.local.disabled` repointe `npm run dev` sur la prod (à utiliser avec précaution, voir `CLAUDE.md`).

---

## Déploiement (cycle normal)

Le mode de fonctionnement standard du projet est **prod-first** : toute modification passe par une PR sur `master`, le pipeline GitHub Actions builde et publie sur GitHub Pages automatiquement.

```text
git checkout -b fix/xxx       →  modifs  →  PR  →  merge sur master
                                                        ↓
                                          GitHub Actions: build + deploy
                                                        ↓
                                              GitHub Pages (prod)
```

Les autres composants (migrations SQL, Edge Functions) se déploient manuellement via la CLI Supabase, **hors** du pipeline frontend.

➡️ **Procédure complète** : [`docs/deployment.md`](docs/deployment.md) — secrets GitHub Actions, déploiement Edge Functions, application des migrations en prod (avec le garde-fou `--force-prod`), rollback.

---

## Hotfix / correction urgente

Quand un bug critique survient en production (l'événement est en cours, un référent ne peut pas se connecter, un email ne part pas), suivre cette boucle courte :

1. **Reproduire en local** : `supabase start` puis `npm run dev` (voir § Développement local).
2. **Restaurer un dump à jour** si la repro nécessite des données réelles : voir `backups/README.md`.
3. **Corriger** : modifier le code, **tester** dans le navigateur local sur http://localhost:5173.
4. **PR + merge** sur `master` → le déploiement frontend se fait automatiquement.
5. **Si la correction touche la base ou une Edge Function**, déployer manuellement (voir `docs/deployment.md`).

> ⚠️ Ne **jamais** modifier directement la prod (Studio Supabase, SQL ad-hoc) sans avoir reproduit et validé localement. Voir `CLAUDE.md` §1.

---

## Développement local

Section technique pour reproduire la prod sur le poste de dev (hotfix, test de migration, refonte).

### Lancer l'environnement complet

```bash
supabase start              # Démarre Postgres, Auth, Studio en local (~30 s)
npm run dev                 # Vite sur http://localhost:5173
```

URLs locales standards (cf. `supabase status`) :

- API REST : `http://127.0.0.1:54321`
- Studio (UI DB) : `http://127.0.0.1:54323`
- Inbucket (emails de test) : `http://127.0.0.1:54324`

Arrêt : `supabase stop` (conserve les données) ou `supabase stop --no-backup` (purge complète).

### Pointer le dev sur la prod (déconseillé)

> ⚠️ Toute opération de données affecte les vrais utilisateurs. Utiliser uniquement pour observer la prod en lecture. Voir `CLAUDE.md` §1.

```bash
mv .env.local .env.local.disabled
npm run dev
```

### Build et preview

```bash
npm run build              # Génère dist/ optimisé (minification, code-split)
npm run preview            # Sert dist/ sur http://localhost:4173
```

`vite.config.js` conserve `base: "./"` pour un déploiement à chemin relatif (GitHub Pages).

### Qualité de code

```bash
npx eslint src/            # Lint
npx prettier --check src/  # Format
npx knip                   # Détection de code mort
```

Le hook `pre-commit` (Husky + lint-staged) applique `eslint --fix` et `prettier --write` sur les fichiers stagés.

### Base de données

```bash
npm run db:push            # Cible locale par défaut (tant que .env.local pointe sur 127.0.0.1)
```

Le script passe par `scripts/check-env.js` qui **bloque** par défaut toute opération ciblant la prod : pousser en prod nécessite `--force-prod` (voir `docs/deployment.md` § Migrations).

Les migrations vivent dans `supabase/migrations/` (nommage chronologique, jamais modifiées après application en prod). Voir `DATABASE.md` pour le schéma, les policies RLS et les triggers.

### Edge Functions

Trois fonctions Deno dans `supabase/functions/` :

| Fonction          | Rôle                                                          |
| ----------------- | ------------------------------------------------------------- |
| `send-planning`   | Envoie son planning à un bénévole par email                   |
| `send-rappel-all` | Rappel groupé à tous les bénévoles                            |
| `create-benevole` | Création de compte par un admin (utilise la Service Role Key) |

Déploiement individuel :

```bash
supabase functions deploy send-planning
supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=...
```

---

## Documentation complémentaire

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — vue d'ensemble, choix techniques, structure des dossiers
- [`DATABASE.md`](DATABASE.md) — schéma, RLS, triggers, fonctions PL/pgSQL
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — conventions, workflow Git, revue de PR
- [`CHANGELOG.md`](CHANGELOG.md) — historique des versions
- [`CLAUDE.md`](CLAUDE.md) — contexte pour les agents IA (avertissements critiques)

---

## Licence

Projet privé, usage interne pour l'organisation d'évènements faisant appel à des bénévoles.
