# Contribuer à `appel-benevoles`

Ce guide vise les développeurs (mainteneur principal + contributeurs ponctuels) qui modifient le code, les migrations SQL ou la documentation. Le projet est **mono-édition**, **en production active**, sans environnement de staging — toute contribution finit en prod après merge sur `master`.

Avant de coder, lire impérativement [`CLAUDE.md`](CLAUDE.md) §1 (avertissement "Dev local = base de production") et [`README.md`](README.md) (cycle prod-first + hotfix).

---

## 1. Conventions de code

### Outillage qualité installé

| Outil           | Rôle                                | Config                                               |
| --------------- | ----------------------------------- | ---------------------------------------------------- |
| **ESLint**      | Linter JS (flat config)             | [`eslint.config.js`](eslint.config.js)               |
| **Prettier**    | Formatter (JS, HTML, CSS, JSON, MD) | [`.prettierrc`](.prettierrc)                         |
| **Husky**       | Hooks Git locaux                    | [`.husky/`](.husky/)                                 |
| **lint-staged** | ESLint + Prettier au commit         | bloc `lint-staged` de [`package.json`](package.json) |
| **knip**        | Détection de code mort (manuel)     | par défaut (`npx knip`)                              |

Commandes locales :

```bash
npx eslint src/            # Lint
npx prettier --check src/  # Vérifie le formatage
npx prettier --write src/  # Applique le formatage
npx knip                   # Détecte les exports/fichiers inutilisés
```

### Pre-commit hook

Le hook [`.husky/pre-commit`](.husky/pre-commit) exécute `npx lint-staged` qui applique sur les fichiers stagés uniquement :

- `src/**/*.js` → `eslint --fix` puis `prettier --write`
- `src/**/*.{html,css,json,md}` → `prettier --write`
- `*.{js,json,md}` à la racine → `prettier --write`

> **Ne jamais committer avec `--no-verify`** : le hook garantit la cohérence stylistique. Si le hook échoue, corriger la cause, ne pas le contourner.

### Style Prettier

- `printWidth: 100`, `tabWidth: 2`, `useTabs: false`, `singleQuote: true` (JS), `singleQuote: false` (HTML), `semi: true`, `trailingComma: 'es5'`, `endOfLine: 'lf'`.

### Règles ESLint actives

La config étend `js.configs.recommended` avec un assouplissement pragmatique sur les anciennes règles de style (le code legacy s'est historiquement reposé sur certaines tolérances ; cf. `eslint.config.js` lignes 41-58). Seule règle **bloquante** explicite : `no-unused-vars` (variables ignorées si préfixées `_`, arguments tolérés).

Dossiers ignorés par ESLint : `dist/`, `node_modules/`, `supabase/`, `archive/`, `backups/`, `audit/`, `tests/`, `data/`.

### Conventions de nommage

Conventions à respecter (cf. [`CLAUDE.md`](CLAUDE.md) §"Conventions de code à respecter") :

| Élément                           | Convention                                               |
| --------------------------------- | -------------------------------------------------------- |
| Modules JS                        | `kebab-case.js`                                          |
| Méthodes de chargement de données | Préfixe `load*` (`loadProfiles()`, `loadPostes()`)       |
| Méthodes de sauvegarde            | Préfixe `save*` (`saveProfile()`)                        |
| Attributs Alpine.js               | `kebab-case` (`x-data`, `x-on:click`, `@click.away`)     |
| Composants Alpine                 | `Alpine.data('nomComposant', () => ({...}))` — camelCase |
| Classes CSS                       | Tailwind utility-first ; tokens custom (`brutal-*`)      |
| Migrations SQL                    | `YYYYMMDDHHMMSS_description_courte.sql`                  |
| Tables/colonnes SQL               | `snake_case`                                             |

### Patterns architecturaux à respecter

- **Pas d'appel direct à `supabase` dans un module métier** — passer par un service (`src/js/services/*`).
- **Pas de logique métier dans les templates HTML** — utiliser `Alpine.data()` dans `src/js/components/`.
- **Pas de classes JS** — objets littéraux retournés par des fonctions (style Alpine).
- **Pas de bypass RLS** — la clé `service_role` est interdite côté frontend ; les opérations privilégiées passent par les Edge Functions ou les RPC `SECURITY DEFINER`.

Voir [`ARCHITECTURE.md`](ARCHITECTURE.md) pour la structure complète.

---

## 2. Workflow Git

### Branches

- **`master`** : branche de production. Protégée par [`.husky/pre-push`](.husky/pre-push) — **push direct interdit**, uniquement via PR.
- **Branches feature/fix** : nommage `<type>/<description-courte>`, par exemple :
  - `fix/scanner-tshirt-multiple-profils`
  - `feat/admin-bulk-export-csv`
  - `chore/upgrade-vite-7`
  - `docs/database-schema-v2`

### Conventional Commits

Format obligatoire : `type(scope): description courte`.

**Types autorisés** (vus en historique) :

| Type       | Usage                                                         |
| ---------- | ------------------------------------------------------------- |
| `feat`     | Nouvelle fonctionnalité utilisateur visible                   |
| `fix`      | Correction de bug                                             |
| `refactor` | Restructuration sans changement de comportement               |
| `chore`    | Maintenance (deps, config tooling, housekeeping)              |
| `build`    | Changements de build / bundler (Vite config, dépendances)     |
| `docs`     | Documentation uniquement                                      |
| `style`    | Formatage pur (rare — passe normalement par Prettier auto)    |
| `test`     | Ajout/modification de tests (pas de suite de tests à ce jour) |

**Scope** : court, identifie la zone touchée. Exemples du projet :

- `feat(admin): add bulk export CSV`
- `fix(scanner-tshirt): handle multiple family profiles`
- `refactor: DRY/SOLID — toast/confirm helpers, SRP services, no direct Supabase`
- `chore(5.5): ESLint + Prettier + Husky/lint-staged + reformat src/`
- `docs(database): rewrite DATABASE.md to match baseline.sql`

**Description** : impérative, minuscule, sans point final. < 72 caractères pour la ligne d'en-tête.

**Corps (optionnel)** : ligne vide + paragraphes expliquant le **pourquoi** (le **quoi** est dans le diff). Pour les changements impactant la prod, inclure un bloc `BREAKING CHANGE:` ou `Impact:`.

### Exemple complet

```text
fix(inscriptions): close race condition on concurrent self-insert

Two tabs of the same family account could insert duplicate inscriptions
because the unicity check happened client-side before the INSERT. The
trigger `trg_check_capacity` would still reject the second insert, but
the toast displayed "Inscription confirmée" optimistically.

Fix: rely on the DB error path instead of pre-check. Toast now waits
for the RPC response.

Impact: zero migration. Affects src/js/services/inscriptions.js only.
```

### Flux de travail standard

1. **Créer une branche** depuis `master` :
   ```bash
   git checkout master && git pull
   git checkout -b fix/ma-correction
   ```
2. **Coder + tester localement** (`supabase start` + `npm run dev`).
3. **Commiter par tranches atomiques** — pas de commit fourre-tout. Le hook `pre-commit` exécute lint-staged automatiquement.
4. **Pousser la branche** :
   ```bash
   git push -u origin fix/ma-correction
   ```
   Le hook `pre-push` :
   - **bloque** tout push direct sur `master` ;
   - **avertit** si `PHASE ≠ 8`.
5. **Ouvrir une Pull Request** sur GitHub vers `master`.

### Cas du hotfix urgent

Cf. [`README.md`](README.md) § _Hotfix / correction urgente_ — boucle courte : reproduire en local → fix → PR → merge → CI/CD déploie. **Ne jamais éditer directement en prod** (Studio Supabase, SQL ad-hoc).

---

## 3. Revue de Pull Request

### Checklist auteur (avant de demander une revue)

- [ ] Le diff est **atomique** : une PR = un sujet (refactor + feature mélangés = split).
- [ ] Les commits suivent **Conventional Commits** et compilent individuellement (`git rebase -i` au besoin).
- [ ] `npx eslint src/` passe sans erreur.
- [ ] `npx prettier --check src/` passe.
- [ ] `npm run build` aboutit sans warning bloquant.
- [ ] Le scénario fonctionnel a été **testé manuellement dans le navigateur** sur `supabase start` local.
- [ ] Si la PR touche la base : la migration suit le nommage `YYYYMMDDHHMMSS_*.sql`, a été appliquée localement, est rétrocompatible.
- [ ] Si la PR touche RLS : les politiques modifiées ont été testées avec un compte non-admin **en plus** d'un compte admin.
- [ ] Aucun secret n'est committé (`.env.local`, clés API, Service Role Key).
- [ ] La description de la PR explique le **pourquoi** et liste l'impact (frontend, DB, Edge Functions).

### Checklist relecteur

- [ ] Le titre suit Conventional Commits et résume la PR.
- [ ] La **portée** est cohérente avec le titre (pas de scope creep).
- [ ] **Sécurité** :
  - aucun appel `supabase` direct dans un composant Alpine (passer par un service) ;
  - aucune utilisation de `service_role` côté frontend ;
  - les nouvelles policies RLS sont testées avec un rôle non-admin ;
  - aucune donnée personnelle exposée dans une vue publique (cf. `public_planning` anonymisée).
- [ ] **Triggers / RPC** : si la PR ajoute une RPC `SECURITY DEFINER`, vérifier qu'elle fixe `SET search_path = public` (cf. [`DATABASE.md`](DATABASE.md) §6).
- [ ] **Migrations** :
  - non destructive ou explicitement justifiée ;
  - jamais modifie une migration déjà appliquée en prod (une migration corrective est créée à la place) ;
  - testable sur `supabase db push` local.
- [ ] **Code** :
  - DRY/SOLID respectés (pas de logique métier dupliquée entre services et composants) ;
  - pas de `console.log` oublié ;
  - les commentaires expliquent le **pourquoi**, pas le **quoi**.
- [ ] **Documentation** : si la PR change une convention, un flag, une table ou une RPC, [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`DATABASE.md`](DATABASE.md) / [`README.md`](README.md) sont mis à jour dans la même PR.
- [ ] **CHANGELOG** : pour toute PR visible utilisateur (`feat`, `fix`), une entrée a été ajoutée à [`CHANGELOG.md`](CHANGELOG.md) sous `## [Unreleased]`.

### Process de merge

- **Merge type** : `Squash and merge` (préserve la propreté de l'historique `master`).
- Le titre du squash devient le message Conventional Commit de référence en prod.
- Après merge, GitHub Actions builde et déploie sur GitHub Pages automatiquement (cf. [`docs/deployment.md`](docs/deployment.md)).
- Pour les changements **DB / Edge Functions**, le déploiement est **manuel** post-merge — voir la section "Migrations" et "Edge Functions" de `docs/deployment.md`.

---

## 4. Pour aller plus loin

- [`README.md`](README.md) — installation, déploiement, hotfix
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — vue d'ensemble du projet
- [`DATABASE.md`](DATABASE.md) — schéma SQL, RLS, triggers
- [`docs/deployment.md`](docs/deployment.md) — procédures de mise en prod
- [`CLAUDE.md`](CLAUDE.md) — avertissements critiques et contexte pour agents IA
- [`CHANGELOG.md`](CHANGELOG.md) — historique des versions
