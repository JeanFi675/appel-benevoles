# Déploiement

Procédures de mise en production pour `appel-benevoles`. Lire entièrement avant tout déploiement — le projet est mono-édition, en production active, sans environnement de staging.

---

## Vue d'ensemble

| Composant       | Cible                        | Mécanisme                                        |
| --------------- | ---------------------------- | ------------------------------------------------ |
| Frontend        | GitHub Pages                 | GitHub Actions (`.github/workflows/deploy.yml`)  |
| Base de données | Supabase managé (cloud)      | `supabase db push` (CLI, manuel)                 |
| Edge Functions  | Supabase Edge Runtime (Deno) | `supabase functions deploy <name>` (CLI, manuel) |
| Secrets EF      | Supabase Vault               | `supabase secrets set ...` (CLI, manuel)         |

---

## Prérequis

- **Accès au repo GitHub** avec droit de push sur `master` ou de merge de PR.
- **Accès au projet Supabase** (rôle Owner ou suffisant pour CLI).
- **Supabase CLI loggée** localement :

  ```bash
  supabase login
  supabase link --project-ref <project-ref>
  ```

- **Deno** installé localement (utilisé par la CLI Supabase pour les Edge Functions).
- Les **secrets GitHub Actions** sont configurés (voir tableau ci-dessous).

---

## Déploiement frontend

### Pipeline automatique (mode normal)

Le workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) se déclenche sur :

- `push` sur la branche `master`
- déclenchement manuel via l'onglet **Actions** de GitHub (`workflow_dispatch`)

Étapes du pipeline :

1. Checkout du code
2. Setup Node 24 avec cache npm
3. `npm ci` (install reproductible)
4. `npm run build` avec injection des secrets Vite
5. Création de `dist/.nojekyll` (désactive le traitement Jekyll de GitHub Pages)
6. Upload de l'artifact `dist/` et déploiement sur GitHub Pages

URL de production : `${{ secrets.VITE_APP_URL_PRODUCTION }}` (configuré dans le secret GitHub).

### Secrets GitHub Actions requis

À configurer dans **Settings → Secrets and variables → Actions** du repo :

| Secret                    | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `VITE_SUPABASE_URL`       | URL du projet Supabase de production               |
| `VITE_SUPABASE_ANON_KEY`  | Clé anon publique du projet Supabase de production |
| `VITE_APP_URL_PRODUCTION` | URL publique du site (GitHub Pages)                |

> ⚠️ **Ne jamais** stocker `SUPABASE_SERVICE_ROLE_KEY` comme secret du workflow frontend — elle bypass RLS et doit rester exclusivement côté CLI/Edge Functions.

Secrets consommés par le workflow de sauvegarde [`backup.yml`](../.github/workflows/backup.yml) (cf. [`disaster_recovery.md`](disaster_recovery.md)) :

| Secret                  | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `SUPABASE_DB_URL`       | Chaîne de connexion **Session Pooler IPv4** de la prod (contient le mot de passe DB) |
| `BACKUP_GPG_PASSPHRASE` | Passphrase de chiffrement AES256 des dumps (à conserver hors GitHub)                 |

### Build manuel de fallback

Si GitHub Actions est indisponible :

```bash
# Variables d'env temporaires (ne jamais committer)
VITE_SUPABASE_URL=... \
VITE_SUPABASE_ANON_KEY=... \
VITE_APP_URL_PRODUCTION=... \
npm run build

# Le dossier dist/ peut ensuite être uploadé manuellement vers la branche gh-pages
# (ou tout autre hébergeur statique).
```

---

## En-têtes de sécurité

> ⚠️ **Contrainte d'hébergement.** GitHub Pages **ne permet pas de définir des en-têtes HTTP de réponse personnalisés** (pas de `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` côté serveur). Cette limite est structurelle et définitive sur cette plateforme. La sécurité applicable est donc partagée entre ce que GitHub fournit nativement et ce qu'on injecte via des balises `<meta>` dans le HTML.

### Ce que GitHub Pages fournit nativement

| En-tête                     | Valeur réelle (prod)            | Vérif                                                        |
| --------------------------- | ------------------------------- | ------------------------------------------------------------ |
| `Strict-Transport-Security` | `max-age=31556952`              | `curl -I https://jeanfi675.github.io/appel-benevoles/`       |
| TLS / HTTPS                 | Certificat Let's Encrypt valide | Cadenas navigateur + `curl -I` retourne `200` sur `https://` |

### Ce qu'on applique via `<meta>` (à défaut d'en-têtes HTTP)

Deux directives sont posées dans le `<head>` de chaque page :

- **`Content-Security-Policy`** (`<meta http-equiv>`) — appliquée par le navigateur (mais **invisible** aux scanners type `securityheaders.com`, qui ne lisent que les en-têtes HTTP).
- **`Referrer-Policy`** (`<meta name="referrer" content="strict-origin-when-cross-origin">`).

La CSP existe en **deux variantes** :

| Pages                                           | Source CSP                       | Particularité                                            |
| ----------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `index`, `admin`, `admin-connexions`, `besoins` | `src/partials/layout/head.html`  | CSP stricte (pas de CDN externe)                         |
| `debit`, `scanner-tshirt`                       | `<head>` propre à chaque fichier | + `https://cdn.tailwindcss.com` autorisé en `script-src` |

CSP standard (pages partageant `head.html`) :

```
default-src 'self';
script-src 'self' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' <VITE_SUPABASE_URL> <wss://VITE_SUPABASE_URL>;
object-src 'none'; base-uri 'self'; form-action 'self'
```

> Les origines de `connect-src` ne sont **pas en dur** : `vite.config.js` les **injecte au build** depuis `VITE_SUPABASE_URL` (variable `cspConnectSrc`, posée en EJS via `<%- cspConnectSrc %>`), avec la variante WebSocket (`wss://`/`ws://`) dérivée pour le Realtime. La CSP suit donc automatiquement l'environnement : build prod → URL Supabase de prod ; build local (`.env.local`) → `http://127.0.0.1:54321`. **Changer de projet Supabase ne nécessite aucune édition des fichiers HTML** — seul le secret/`.env` change.

Justification des assouplissements :

- **`script-src 'unsafe-eval'`** : Alpine.js v3 (build standard) évalue les expressions `x-data`/`x-on` via un mécanisme type `eval`. Sans cette directive, toute l'interactivité casse. _(Mitigation possible : passer au build CSP d'Alpine — voir `plan_refactoring.md`.)_
- **`style-src 'unsafe-inline'`** : Alpine pose des styles inline (`x-show` → `style="display:none"`, bindings `:style`) et le CDN Tailwind injecte un `<style>` runtime.
- **`connect-src`** : REST, Auth et Realtime (`wss://`) du projet Supabase de production.
- **`script-src https://cdn.tailwindcss.com`** (pages `debit`/`scanner-tshirt` uniquement) : ces deux pages chargent le Tailwind runtime CDN au lieu du CSS compilé par Vite. _(Anti-pattern à corriger — voir `plan_refactoring.md` ; sa suppression permettrait de durcir la CSP de ces pages.)_

### Limitations connues

- **Anti-clickjacking non couvert** : `X-Frame-Options` et la directive CSP `frame-ancestors` exigent un **vrai en-tête HTTP** ; en `<meta>`, les navigateurs **ignorent** `frame-ancestors`. Impossible sur GitHub Pages en l'état.
- **Grade `securityheaders.com` plafonné** : le scanner ne note que les en-têtes HTTP, pas les `<meta>`. Le grade restera bas malgré la CSP réellement active dans le navigateur.
- **Mitigation future** (si un durcissement est requis) : placer un proxy **Cloudflare (gratuit) derrière un domaine personnalisé**, qui injecterait de vrais en-têtes HTTP (CSP, `X-Frame-Options`, `Referrer-Policy`). Cela change l'URL de prod et ajoute une dépendance infra — non retenu pour la V1.

### Vérifier la CSP en production

```bash
# La CSP est servie dans le HTML (meta), pas en en-tête :
curl -s https://jeanfi675.github.io/appel-benevoles/ | grep -i "Content-Security-Policy"
```

Validation navigateur : ouvrir chaque famille de page, console DevTools → aucune violation `Content Security Policy` ne doit apparaître (hors connexion à une Supabase locale en preview, non listée dans `connect-src`).

---

## Monitoring

Le backend tourne sur **Supabase managé** : les logs sont collectés en continu par **Logflare** et exposés dans le dashboard. **Il n'y a rien à « activer »** — les quatre flux ci-dessous sont toujours actifs. La rétention dépend du plan (1 jour sur le plan Free, davantage sur Pro+).

### Où consulter les logs

Dashboard Supabase → projet `pulrflaantftaogvgtnc` → menu **Logs & Analytics** (puis **Logs Explorer** pour le mode SQL, ou clic direct sur une **collection** dans la sidebar pour une vue pré-remplie). Filtre temporel en haut à droite (« Last hour », « Last 5 minutes »…).

| Flux                      | Où                                                                     | Ce qu'on y trouve                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API Gateway**           | Logs → collection **API Gateway**                                      | Toutes les requêtes HTTP entrantes (REST PostgREST `/rest/v1/*`, Auth `/auth/v1/*`, Functions `/functions/v1/*`), méthode, statut, chemin, client. Premier endroit où regarder un 4xx/5xx.                |
| **Auth**                  | Logs → collection **Auth**                                             | Tentatives de connexion/OTP, créations de compte, erreurs d'authentification (avec `request_id`).                                                                                                         |
| **Postgres** (= Database) | Logs → collection **Postgres**                                         | Connexions, requêtes lentes, erreurs SQL, logs serveur Postgres (`LOG`/`ERROR`/`FATAL`).                                                                                                                  |
| **Edge Functions**        | Menu **Edge Functions** → fonction → onglet **Invocations** / **Logs** | Une ligne par invocation (statut, `execution_time_ms`, `execution_id`, version déployée) + sortie `console.*` de la fonction. Vue dédiée par fonction, **plus fiable** que le Logs Explorer pour ce flux. |

> ⚠️ **Invocation Edge sans `Authorization`** : un appel à `/functions/v1/<name>` sans header `Authorization` valide est rejeté **401 par la passerelle** et **n'atteint jamais la fonction** — il n'apparaît donc pas dans les logs d'invocation. Pour tracer une exécution réelle, fournir un JWT valide (la clé anon suffit pour franchir la passerelle).

### Générer une requête de test (vérifier que les logs remontent)

Sondes **read-only** (aucune écriture en base, aucun email, aucun compte créé) :

```bash
URL="https://pulrflaantftaogvgtnc.supabase.co"
ANON="<VITE_SUPABASE_ANON_KEY>"

# API Gateway + Postgres : lecture publique d'un feature flag (HTTP 200)
curl -s "$URL/rest/v1/config?select=key,value&limit=3" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

# Auth : OTP vers un email bidon → 422 otp_disabled (aucun compte créé)
curl -s -X POST "$URL/auth/v1/otp" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"probe@example.com","create_user":false}'

# Edge Functions : invocation avec JWT (la fonction s'exécute, échoue sur sa propre logique)
curl -s -X POST "$URL/functions/v1/send-planning" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{}'
```

Les événements correspondants apparaissent dans le dashboard **sous la minute**. Vérifié le 2026-06-03 sur les quatre flux (cf. `plan_refactoring.md` §8.3).

---

## Déploiement des Edge Functions

Trois fonctions Deno dans `supabase/functions/` :

| Fonction          | Rôle                                                          |
| ----------------- | ------------------------------------------------------------- |
| `send-planning`   | Envoie son planning à un bénévole par email                   |
| `send-rappel-all` | Rappel groupé à tous les bénévoles                            |
| `create-benevole` | Création de compte par un admin (utilise la Service Role Key) |

### Déployer une fonction

```bash
supabase functions deploy <function-name>
# ex :
supabase functions deploy send-planning
```

### Configurer les secrets des Edge Functions

Les secrets SMTP sont requis par les fonctions d'envoi d'email :

```bash
supabase secrets set SMTP_HOST=smtp.example.com
supabase secrets set SMTP_PORT=465
supabase secrets set SMTP_USER=...
supabase secrets set SMTP_PASS=...
```

Vérification :

```bash
supabase secrets list
```

> `SUPABASE_SERVICE_ROLE_KEY` est injecté automatiquement par la plateforme Edge Functions — ne pas le configurer manuellement.

### Tester une fonction après déploiement

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/send-planning" \
  -H "Authorization: Bearer <jwt-utilisateur>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Migrations de base de données

> ⚠️ Le `.env` du projet pointe sur la **prod**. Depuis la Phase 0.3, si `.env.local` existe et pointe sur `127.0.0.1`, `npm run db:push` cible le local. Pour pousser en prod, il faut :
>
> 1. désactiver `.env.local` (`mv .env.local .env.local.disabled`) afin que `VITE_SUPABASE_URL` redevienne celle de prod,
> 2. ajouter `PHASE=8` dans le `.env`,
> 3. lancer `npm run db:push -- --force-prod`.
>
> Sans ces trois conditions, le garde-fou `scripts/check-env.js` (Phase 0.4) **bloque l'opération**. Voir `CLAUDE.md` §1.

### Pré-vol obligatoire

1. La migration a été testée sur l'instance Supabase locale (`supabase start` + `supabase db push`).
2. Les politiques RLS impactées ont été relues (voir `DATABASE.md`).
3. La migration est rétrocompatible avec les données existantes.
4. Un backup à jour existe dans `backups/` (cf. `backups/README.md`).

### Application

Cible **locale** (par défaut tant que `.env.local` est actif et pointe sur `127.0.0.1`) :

```bash
npm run db:push
# check-env: OK (target=local, phase=n/a)
```

Cible **production** (Phase 8 uniquement, après les 3 conditions ci-dessus) :

```bash
npm run db:push -- --force-prod
# check-env: OK (target=prod, phase=8)
```

> ⚠️ **Ne jamais** appeler `supabase db push` directement sans passer par `npm run db:push` — le garde-fou serait court-circuité.

### Règle d'or

Une migration appliquée en prod ne se modifie **jamais** : on crée une nouvelle migration corrective. Le nom du fichier suit la convention `YYYYMMDDHHMMSS_description.sql`.

---

## Rollback

### Frontend (GitHub Pages)

```bash
git revert <sha-du-commit-fautif>
git push origin master
# Le workflow se redéclenche et republie la version précédente.
```

Alternative : depuis l'onglet **Actions** de GitHub, re-run un workflow antérieur connu comme sain.

### Edge Function

Pas de rollback natif : redéployer la version précédente depuis Git.

```bash
git checkout <sha-version-precedente> -- supabase/functions/<function-name>
supabase functions deploy <function-name>
git checkout HEAD -- supabase/functions/<function-name>
```

### Base de données

Pas de rollback automatique. Procédure manuelle :

1. Stopper toute écriture côté frontend (mettre l'application en maintenance si possible).
2. Restaurer depuis le dernier backup `backups/YYYYMMDD_*.sql` (cf. `backups/README.md`).
3. Créer une nouvelle migration corrective qui annule l'effet de la migration fautive — ne **pas** supprimer la migration fautive du dossier `supabase/migrations/`.

---

## Checklist de mise en production

Avant chaque release :

- [ ] La branche `master` build localement sans warning bloquant (`npm run build`).
- [ ] Les migrations SQL ont été testées sur l'instance locale.
- [ ] Les secrets GitHub Actions sont à jour (vérifier dans Settings → Secrets).
- [ ] Les secrets Edge Functions sont à jour (`supabase secrets list`).
- [ ] Le `CHANGELOG.md` est mis à jour avec la version et la date.
- [ ] Un tag Git est créé (`git tag vX.Y.Z && git push --tags`) — facultatif mais recommandé pour retrouver la version déployée.

---

## Liens utiles

- [`README.md`](../README.md) — installation et lancement local
- [`CLAUDE.md`](../CLAUDE.md) — avertissements critiques sur la prod
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — vue d'ensemble technique
- [`DATABASE.md`](../DATABASE.md) — schéma et RLS
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — pipeline frontend
