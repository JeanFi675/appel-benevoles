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
2. Setup Node 20 avec cache npm
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

## Déploiement des Edge Functions

Cinq fonctions Deno dans `supabase/functions/` :

| Fonction                | Rôle                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `send-planning`         | Envoie son planning à un bénévole par email                   |
| `send-rappel-all`       | Rappel groupé à tous les bénévoles                            |
| `send-relance`          | Relance ciblée                                                |
| `send-relance-orphelin` | Relance des bénévoles sans inscription                        |
| `create-benevole`       | Création de compte par un admin (utilise la Service Role Key) |

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

> ⚠️ Le `.env` du projet pointe sur la **prod**. `supabase db push` applique les migrations sur l'instance liée — donc en prod par défaut. Voir `CLAUDE.md` §1.

### Pré-vol obligatoire

1. La migration a été testée sur l'instance Supabase locale (`supabase start` + `supabase db push`).
2. Les politiques RLS impactées ont été relues (voir `DATABASE.md`).
3. La migration est rétrocompatible avec les données existantes.
4. Un backup à jour existe dans `backups/` (cf. `backups/README.md`).

### Application

```bash
npm run db:push     # Vérifie .env puis exécute `supabase db push`
```

Ou directement :

```bash
supabase db push
```

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
