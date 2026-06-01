# Architecture — appel-benevoles

Document de référence décrivant l'architecture **réelle** du projet à la date d'écriture (2026-05-30). Il documente ce qui existe aujourd'hui ; les écarts par rapport à la cible visée par le refactoring sont signalés explicitement.

> **Portée** : frontend (Vite + Alpine.js) et intégration backend (Supabase managé). Le schéma de base de données détaillé (tables, RLS, triggers) est documenté dans `DATABASE.md` (Phase 7.3).

---

## 1. Vue d'ensemble

Application web **statique multi-pages** buildée avec **Vite** et déployée sur **GitHub Pages** via GitHub Actions. Aucun serveur applicatif intermédiaire — le navigateur appelle directement Supabase pour l'authentification, les données et les fonctions serveur.

Toute la logique backend critique (autorisations, contraintes métier) vit dans **Supabase** :

- **PostgreSQL** + **RLS** (Row Level Security) pour les règles d'accès ligne par ligne.
- **Triggers PL/pgSQL** pour les invariants métier (capacités de poste, conflits horaires).
- **Edge Functions Deno** pour les opérations nécessitant un secret serveur (envoi d'emails, création de compte admin avec service role).

### Diagramme d'architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   BUILD (CI — GitHub Actions)                  │
│                                                                │
│  Sources HTML/JS/CSS  ─► Vite 7 + vite-plugin-html (EJS)       │
│  Tailwind CSS         ─► dist/  (minification esbuild,         │
│                                  hash, sourcemap caché,        │
│                                  manualChunks vendor)          │
│  Secrets VITE_*       ─► injectés dans le bundle               │
└──────────────────────────────┬─────────────────────────────────┘
                               │ upload-pages-artifact
┌──────────────────────────────▼─────────────────────────────────┐
│            GitHub Pages (CDN statique — base "./")             │
│                                                                │
│  6 pages multi-entrypoints :                                   │
│   index.html  admin.html  debit.html                           │
│   scanner-tshirt.html  admin-connexions.html  besoins.html     │
└──────────────────────────────┬─────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼─────────────────────────────────┐
│                          NAVIGATEUR                            │
│                                                                │
│  Alpine.js 3 (réactivité)  +  Tailwind CSS 3                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Entrypoint /page.js → Alpine.data + Alpine.store        │   │
│  │ Composants Alpine (src/js/components/)                  │   │
│  │ Stores Alpine (src/js/stores/)                          │   │
│  │ Services (src/js/services/) ── seul accès Supabase ──┐  │   │
│  └──────────────────────────────────────────────────────┼──┘   │
│                @supabase/supabase-js (client unique)    │      │
└─────────────────────────────────────────────────────────┼──────┘
                                                          │
                                                  HTTPS   │
              (REST PostgREST / RPC / Realtime WS / Auth) │
                                                          ▼
┌────────────────────────────────────────────────────────────────┐
│                            SUPABASE                            │
│                                                                │
│  ┌──────────┐  ┌───────────────────┐  ┌────────────────────┐   │
│  │   Auth   │  │   PostgreSQL 17   │  │   Edge Functions   │   │
│  │ OTP 6 ch.│  │  + RLS policies   │  │      (Deno 2)      │   │
│  │  (email) │  │  + Triggers       │  │  • send-planning   │   │
│  └──────────┘  │  + Fonctions RPC  │  │  • send-rappel-all │   │
│                │  + Vues publiques │  │  • send-relance    │   │
│                └───────────────────┘  │  • send-relance-   │   │
│                                       │      orphelin      │   │
│                                       │  • create-benevole │   │
│                                       └────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Flux typiques

| Action utilisateur              | Chemin technique                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Connexion (OTP email)           | Navigateur → Supabase Auth (OTP 6 chiffres)                                                                            |
| Affichage planning              | Navigateur → vues PostgreSQL anonymisées (REST PostgREST, filtré par RLS)                                              |
| Inscription à un poste          | Navigateur → INSERT dans `inscriptions` → triggers `check_capacity` + `check_time_conflict` côté DB                    |
| Envoi du planning par email     | Navigateur → Edge Function `send-planning` → SMTP                                                                      |
| Création de compte par un admin | Navigateur (admin) → Edge Function `create-benevole` (vérifie rôle, utilise service_role pour créer dans `auth.users`) |
| Débit cagnotte (buvette)        | Navigateur → RPC PostgreSQL → INSERT `cagnotte_transactions`                                                           |

---

## 2. Choix techniques et justifications

### Pourquoi Vite ?

| Critère                       | Apport de Vite 7                                            |
| ----------------------------- | ----------------------------------------------------------- |
| Build statique multi-pages    | Support natif `rollupOptions.input` pour 6 entrées HTML     |
| Dev server rapide             | ES modules natifs en dev, pas de bundling                   |
| Tree-shaking & code splitting | `manualChunks` configuré pour isoler les vendors            |
| Templates EJS                 | Via `vite-plugin-html` (factoring des `<head>`, `<header>`) |
| Variables d'env scopées       | Préfixe `VITE_*` pour ce qui entre dans le bundle public    |

### Pourquoi Alpine.js (et pas React/Vue) ?

- **Contrainte d'hébergement** : GitHub Pages = fichiers statiques. Pas de SSR, pas de runtime serveur → un framework lourd avec hydratation est superflu.
- **Volume de logique modeste** : 6 pages d'admin/utilisateur, pas de SPA complexe. Alpine couvre les besoins (réactivité, stores, persist) sans coût d'apprentissage.
- **Performances** : runtime Alpine ~17 KB gzippé vs ~45 KB pour React minimal. Premier paint plus rapide.

### Pourquoi Supabase ?

- **RLS = sécurité dans la base** : les règles d'accès sont vérifiées par PostgreSQL, pas par du code applicatif. Impossible de contourner depuis le navigateur.
- **Auth managée** : OTP 6 chiffres par email, sessions JWT, refresh token. Aucun code de gestion d'auth côté serveur à maintenir.
- **Triggers PL/pgSQL** : invariants métier (capacité, conflits horaires) appliqués atomiquement à l'INSERT/UPDATE.
- **Edge Functions Deno** : runtime serverless pour les cas qui exigent un secret (SMTP, service_role).
- **Free tier suffisant** : événement ponctuel, charge limitée.

### Pourquoi Tailwind CSS ?

- Cohérence visuelle via tokens custom (`brutal-black`, `brutal-ice`, `brutal-white`, `shadow-brutal*`).
- Purge automatique des classes non utilisées (build léger).
- Pas de fichiers CSS éparpillés à maintenir.

### Dépendances majeures (runtime)

| Dépendance              | Version | Rôle                                                                    |
| ----------------------- | ------- | ----------------------------------------------------------------------- |
| `@supabase/supabase-js` | ^2.39.0 | Client unique Auth + REST + Realtime, instancié dans `src/js/config.js` |
| `alpinejs`              | ^3.13.3 | Réactivité DOM, `Alpine.data()` + `Alpine.store()`                      |
| `qrcode`                | ^1.5.4  | **Génération** de QR codes (page bénévole, scanner)                     |

> ⚠️ **Anomalie connue** : `vite.config.js:112` référence `html5-qrcode` (scan QR) dans `manualChunks`, mais la lib **n'est plus dans `package.json`**. À investiguer (voir `audit/notes.md` 2026-05-30).

### Dépendances majeures (build / qualité)

| Dépendance         | Version  | Rôle                                                            |
| ------------------ | -------- | --------------------------------------------------------------- |
| `vite`             | ^7.3.0   | Bundler + dev server                                            |
| `vite-plugin-html` | ^3.2.2   | Templates EJS, minification HTML, multi-pages                   |
| `tailwindcss`      | ^3.3.5   | Framework CSS utility-first                                     |
| `postcss`          | ^8.4.31  | Pipeline CSS (utilisé par Tailwind)                             |
| `autoprefixer`     | ^10.4.16 | Préfixes vendeurs CSS                                           |
| `eslint`           | ^10.4.0  | Linter JavaScript                                               |
| `prettier`         | ^3.8.3   | Formateur                                                       |
| `husky`            | ^9.1.7   | Hooks Git locaux (pre-commit)                                   |
| `lint-staged`      | ^17.0.5  | Lance ESLint/Prettier sur les fichiers stagés uniquement        |
| `knip`             | ^6.14.2  | Détection de code mort (exports inutilisés, deps non utilisées) |

---

## 3. Structure des dossiers

### Racine

```
appel-benevoles/
├── index.html, admin.html, debit.html, scanner-tshirt.html,
│   admin-connexions.html, besoins.html       # 6 pages d'entrée Vite
├── vite.config.js                            # 6 entrypoints, base "./"
├── package.json                              # scripts + deps
├── tailwind.config.js, postcss.config.js     # config CSS
├── eslint.config.js, .prettierrc             # config qualité
├── src/                                      # voir détail ci-dessous
├── supabase/                                 # config CLI + migrations + Edge Functions
├── scripts/                                  # outils Node (check-env, audits)
├── docs/                                     # documentation (deployment, ...)
├── audit/                                    # rapports d'audit (DB, Lighthouse, notes)
├── backups/                                  # dumps DB (cf. backups/README.md)
└── .github/workflows/deploy.yml              # CI/CD GitHub Pages
```

### `src/` — code source frontend

```
src/
├── js/             # tout le JavaScript
├── partials/       # fragments HTML (EJS)
├── styles/         # CSS / Tailwind entrypoints
└── data/           # (vide actuellement)
```

### `src/js/` — état réel

```
src/js/
├── config.js              # 🔒 SINGLETON : client Supabase + mécanisme refresh token
├── constants.js           # (legacy) — exports d'env, à rapatrier dans config/services (Phase 5.3)
├── utils.js               # (legacy) — monolithe en cours d'éclatement vers utils/
│
├── main.js                # Entrypoint page index.html
├── admin.js               # Entrypoint page admin.html
├── debit.js               # Entrypoint page debit.html
├── scanner-tshirt.js      # Entrypoint page scanner-tshirt.html
├── admin-connexions.js    # Entrypoint page admin-connexions.html
├── besoins.js             # Entrypoint page besoins.html
├── admin-timeline.js      # ⚠️ Non déclaré dans vite.config.js (voir audit/notes.md)
│
├── services/              # Accès Supabase — passage obligé pour tout JS
│   ├── api.js             #   CRUD métier (benevoles, postes, inscriptions, cagnotte)
│   ├── auth.js            #   OTP, session, rôle utilisateur courant
│   └── public-api.js      #   Accès anonyme (planning public sans login)
│
├── stores/                # Alpine.store() — état partagé global
│   └── admin-store.js     #   (seul store actuel — autres domaines encore inline)
│
├── components/            # Alpine.data() — composants Alpine isolés
│   ├── admin/             #   Sous-composants des onglets admin (7 fichiers)
│   └── user/              #   Widgets côté bénévole (cagnotte, t-shirt)
│
├── modules/               # (legacy) — sera dissout vers components/stores/utils (Phase 5.2)
│   ├── store.js
│   └── user/              #   planning.js, profiles.js, wizard.js
│
└── utils/                 # Helpers purs (cible de l'éclatement de utils.js legacy)
    ├── admin-shift-validation.js
    ├── admin-time.js
    ├── confirm.js         #   Helper modale de confirmation
    └── toast.js           #   Helper toast (succès/erreur)
```

#### Conventions de `src/js/` (résumé)

| Règle                                                                                            | Référence                |
| ------------------------------------------------------------------------------------------------ | ------------------------ |
| **Un seul client Supabase** : `createClient()` uniquement dans `config.js`                       | `CLAUDE.md` §"Singleton" |
| **Pas d'accès `supabase.*` hors `services/`** : composants et stores passent par un service      | Conv. projet             |
| **Pas de classes JS** : objets littéraux retournés par des fonctions (compatibles `Alpine.data`) | `CLAUDE.md`              |
| **Pas de `x-data` inline > 3 lignes** : extraire dans `components/`                              | `CLAUDE.md`              |
| **Préfixes méthodes** : `load…` pour chargement, `save…` pour persistance, toast après save      | `CLAUDE.md`              |
| **ES modules natifs uniquement**, pas de barrel files (`index.js` ré-exportateurs)               | Convention               |

### `src/partials/` — fragments HTML EJS

```
src/partials/
├── layout/                # Layout commun (head, header)
│   ├── head.html          #   Balises <head> communes
│   └── header.html        #   En-tête réutilisable
├── components/            # Fragments UI réutilisables
│   ├── cagnotte-widget.html
│   ├── confirm-modal.html
│   ├── post-card-details.html
│   ├── toast.html
│   └── tshirt-widget.html
├── sections/              # Sections spécifiques à une page
│   ├── index/             #   login, planning-calendar, planning-list
│   ├── admin/             #   8 onglets (tabs.html + tab-*.html)
│   └── admin-timeline/    #   chart, day-picker
└── wizard.html            # Wizard d'inscription (utilisé par index)
```

Inclusion via `<%- include('chemin/relatif.html') %>`. Aucune logique métier dans les templates — uniquement des attributs Alpine référençant un `x-data="<nom>"` défini dans `src/js/components/`.

### `src/styles/`

```
src/styles/
└── main.css       # Entrypoint Tailwind (directives @tailwind base/components/utilities)
```

Pas de CSS inline dans les templates. Tokens custom déclarés dans `tailwind.config.js`.

### `src/data/`

Vide actuellement. Réservé à d'éventuelles données statiques importées au build (JSON figés, listes de référence).

### `supabase/`

```
supabase/
├── config.toml                          # Config CLI Supabase locale (ports, auth, edge runtime)
├── migrations/                          # Migrations actives (actuellement vide — refactoring en cours)
├── migrations_archive_pre_refactor/     # Ancien historique (non rejouable from scratch)
├── functions/                           # Edge Functions Deno
│   ├── deno.json
│   ├── send-planning/
│   ├── send-rappel-all/
│   ├── send-relance/
│   ├── send-relance-orphelin/
│   └── create-benevole/
└── snippets/                            # Snippets SQL utilitaires
```

> **État transitoire** : `supabase/migrations/` est vide à dessein pendant les Phases 0-2 du refactoring. La Phase 2.8 consolidera tout le schéma dans un `init.sql`. Stratégie de bascule prod : voir `audit/notes.md` (2026-05-25).

### `scripts/`

```
scripts/
├── check-env.js                # Vérifie la présence des variables d'env requises
├── generate_sql.cjs            # Génération SQL utilitaire
├── audit-alpine-methods.js     # Audit des méthodes Alpine référencées
├── audit-orphan-partials.js    # Détecte les partials EJS non inclus
└── README.md                   # Documentation locale des scripts
```

### `docs/`, `audit/`, `backups/`

| Dossier    | Rôle                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| `docs/`    | Documentation utilisateur (`deployment.md`)                                                 |
| `audit/`   | Sortie d'analyses : tables/colonnes/RLS extraits, rapports Lighthouse, knip, notes vivantes |
| `backups/` | Dumps PostgreSQL périodiques de la prod (cf. `backups/README.md`)                           |

---

## 4. État vs cible (refactoring en cours)

Plusieurs éléments du code reflètent un état transitoire piloté par `plan_refactoring.md`. À jour au 2026-05-30 :

| Élément actuel                                  | Statut                          | Phase de résolution |
| ----------------------------------------------- | ------------------------------- | ------------------- |
| Entrypoints à plat dans `src/js/` (vs `pages/`) | Cible déplacement vers `pages/` | Phase 5.4           |
| `src/js/modules/` (legacy)                      | À dissoudre                     | Phase 5.2           |
| `src/js/utils.js` (monolithe)                   | À éclater dans `utils/`         | Phase 5.3           |
| `src/js/constants.js`                           | À rapatrier                     | Phase 5.3           |
| Stores limités à `admin-store.js`               | Création progressive            | Phase 5.2           |
| `supabase/migrations/` vide                     | Consolidation `init.sql`        | Phase 2.8           |
| Ref `html5-qrcode` orpheline dans Vite          | À investiguer                   | Hors phase actuelle |
| `admin-timeline.js` hors `vite.config.js`       | À investiguer                   | Hors phase actuelle |

---

## 5. Documents liés

| Sujet                                          | Document                                              |
| ---------------------------------------------- | ----------------------------------------------------- |
| Installation, dev, build local                 | [`README.md`](README.md)                              |
| Déploiement (CI/CD, secrets, rollback)         | [`docs/deployment.md`](docs/deployment.md)            |
| Schéma DB, RLS, triggers, fonctions PL/pgSQL   | [`DATABASE.md`](DATABASE.md) (à créer en 7.3)         |
| Conventions de code, workflow Git, revue PR    | [`CONTRIBUTING.md`](CONTRIBUTING.md) (à créer en 7.4) |
| Historique des versions                        | [`CHANGELOG.md`](CHANGELOG.md) (à créer en 7.5)       |
| Avertissements critiques (prod, RLS, triggers) | [`CLAUDE.md`](CLAUDE.md)                              |
| Plan de refactoring (source de vérité)         | [`plan_refactoring.md`](plan_refactoring.md)          |
| Audit DB existant                              | [`audit_db.md`](audit_db.md)                          |
| Notes hors-scope & arbitrages en cours         | [`audit/notes.md`](audit/notes.md)                    |
