# Reprise sur sinistre (Disaster Recovery)

Procédure de **sauvegarde et de restauration** de la base de données de production.

> ⚠️ **Plan Supabase Free** : il n'y a **aucun backup automatique managé** (les backups quotidiens et le Point-in-Time Recovery sont réservés au plan Pro et au-dessus). La **seule source de vérité** est l'artefact chiffré produit chaque jour par la GitHub Action [`backup.yml`](../.github/workflows/backup.yml). Sans elle, une migration destructive, une suppression accidentelle ou une corruption applicative entraîne une **perte définitive** des données.

---

## 1. Stratégie de sauvegarde

| Élément     | Valeur                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Mécanisme   | GitHub Action [`backup.yml`](../.github/workflows/backup.yml) (auto-opérée)             |
| Cadence     | Quotidienne — cron `0 3 * * *` (03:00 UTC) + déclenchement manuel (`workflow_dispatch`) |
| Contenu     | Dump **complet** (schéma + données) via `pg_dump 17`                                    |
| Connexion   | Session Pooler IPv4 (`aws-1-eu-west-1.pooler.supabase.com:5432`)                        |
| Chiffrement | GPG symétrique **AES256** (le repo est public + données personnelles ⇒ jamais en clair) |
| Stockage    | Artifact GitHub privé `db-backup-<STAMP>.sql.gpg`                                       |
| Rétention   | **30 jours** (`retention-days: 30`)                                                     |

### Secrets requis (GitHub → Settings → Secrets and variables → Actions)

| Secret                  | Rôle                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`       | Chaîne Session Pooler : `postgresql://postgres.<ref>:<MDP>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres` |
| `BACKUP_GPG_PASSPHRASE` | Passphrase de (dé)chiffrement. **À conserver hors GitHub** — sans elle, les backups sont irrécupérables.      |

> Ces deux secrets sont **exclusivement CI** : ils ne sont jamais lus par l'application, les scripts locaux ni le dev local. Ils n'ont donc **pas** leur place dans `.env` / `.env.example`.

---

## 2. Récupérer un backup

> **Windows.** `gpg` n'est pas dans le PATH PowerShell, mais il est **livré avec Git for Windows** à `C:\Program Files\Git\usr\bin\gpg.exe` — appelable directement depuis PowerShell via l'opérateur `&` (voir variantes PowerShell ci-dessous), sans rien installer. Alternative : **Git Bash** (syntaxe `gpg …` directe) ou [Gpg4win](https://www.gpg4win.org/) (met `gpg` dans le PATH).

### Option A — Interface GitHub

Onglet **Actions** → workflow **« Backup prod database »** → choisir un run réussi → section **Artifacts** → télécharger `db-backup-<STAMP>`.

### Option B — CLI (`gh`)

```bash
# Lister les derniers runs du backup
gh run list --workflow=backup.yml --limit 5

# Télécharger l'artifact d'un run précis (remplacer <RUN_ID>)
gh run download <RUN_ID> -R JeanFi675/appel-benevoles --dir ./restore_work
```

Le fichier récupéré est `restore_work/db-backup-<STAMP>/backup_<STAMP>.sql.gpg`.

---

## 3. Déchiffrer

```bash
cd ./restore_work/db-backup-<STAMP>

gpg --batch --yes --decrypt \
  --passphrase "<BACKUP_GPG_PASSPHRASE>" \
  -o backup.sql \
  backup_<STAMP>.sql.gpg

# Vérifications rapides d'intégrité
head -5 backup.sql                 # doit afficher l'en-tête "PostgreSQL database dump"
grep -c "CREATE TABLE" backup.sql  # nombre de tables
grep -c "^COPY " backup.sql        # blocs de données
```

**Variante PowerShell** (gpg livré avec Git, appelé par chemin complet) :

```powershell
cd .\restore_work\db-backup-<STAMP>

& "C:\Program Files\Git\usr\bin\gpg.exe" --batch --yes --decrypt `
  --passphrase "<BACKUP_GPG_PASSPHRASE>" `
  -o backup.sql `
  backup_<STAMP>.sql.gpg

# Vérifications rapides d'intégrité
Get-Content backup.sql -TotalCount 5
(Select-String -Path backup.sql -Pattern "CREATE TABLE" -SimpleMatch).Count
(Select-String -Path backup.sql -Pattern "^COPY ").Count
```

> Supprimer `backup.sql` (en clair) dès que la restauration est terminée : `rm -f backup.sql` (bash) / `Remove-Item backup.sql` (PowerShell).

---

## 4. Restaurer

### 4.1 Sur l'instance Supabase locale (cas nominal : test / dev)

```bash
# Pré-requis : instance locale démarrée (supabase start)
# Restauration COMPLÈTE dans une base fraîche
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f backup.sql
```

**Variante PowerShell** (`psql` absent du PATH ⇒ via le conteneur Docker local ; PowerShell ne gère pas la redirection `<`, on utilise `Get-Content | …`) :

```powershell
# Restauration COMPLÈTE
Get-Content backup.sql | docker exec -i supabase_db_appel-benevoles `
  psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

**Restauration partielle** (une seule table, ex. récupérer `inscriptions` perdues) — extraire le bloc `COPY public.<table> ... \.` du dump, puis le réinjecter. L'extraction `awk` ci-dessous est en **bash** (sous Windows, l'exécuter depuis **Git Bash**) :

```bash
# Exemple : ne réinjecter que les données de la table inscriptions
awk '/^COPY public\.inscriptions /{f=1} f{print} /^\\\.$/{if(f)exit}' backup.sql > inscriptions_only.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f inscriptions_only.sql
```

### 4.2 Sur la production (sinistre réel — opération à haut risque)

> ⚠️ **PROD.** Soumise aux garde-fous de `CLAUDE.md` §1/§4. Exiger une **confirmation explicite** du mainteneur (`CONFIRME PROD`), travailler **dans une transaction** et **toujours** prendre un dump frais de l'état courant _avant_ d'écrire.

1. **Mettre l'application en maintenance** si possible (stopper les écritures côté frontend).
2. **Dump de l'état courant** (même si corrompu, pour traçabilité) :
   ```bash
   pg_dump "$SUPABASE_DB_URL" --no-owner > prod_avant_restauration_$(date -u +%Y%m%d_%H%M%S).sql
   ```
3. **Restaurer** dans une transaction, inspecter, puis `COMMIT`/`ROLLBACK` :
   ```bash
   psql "$SUPABASE_DB_URL"
   -- \set ON_ERROR_STOP on
   -- BEGIN; \i backup.sql   (inspecter les comptes) ; COMMIT;  -- ou ROLLBACK;
   ```
4. Vérifier les comptes des tables cœur (`benevoles`, `inscriptions`, `cagnotte_transactions`) et l'état RLS.
5. Pour une remise en cohérence structurelle plus large, se référer à la section **« Base de données »** de [`docs/deployment.md`](deployment.md#rollback).

---

## 5. Vérifier que les sauvegardes tournent

```bash
# Le dernier run doit être récent (≤ 24 h) et "completed/success"
gh run list --workflow=backup.yml --limit 3

# Détail + taille du dump d'un run
gh run view <RUN_ID> --log | grep -iE "Dump brut|Chiffré"
```

Bonne pratique : **déclencher un backup manuel avant toute migration** (`gh workflow run backup.yml --ref master`).

---

## 6. Compte-rendu des tests de restauration

### 2026-06-04 — Restauration partielle de `inscriptions` (local)

- **Backup source** : artifact `db-backup-20260604_101009` (run `26945294614`, dump du jour), téléchargé via `gh run download` puis déchiffré (`gpg --decrypt`) → `backup.sql` (1 296 828 o).
- **Cible** : instance Supabase **locale** (conteneur `supabase_db_appel-benevoles`), base **scratch jetable `dr_test`** (les données de travail locales et la prod ne sont jamais touchées).
- **Procédure** : extraction `awk` du `CREATE TABLE public.inscriptions` (sans FK) + du bloc `COPY public.inscriptions … \.` du dump, puis application dans `dr_test` via `… | docker exec -i … psql -d dr_test`.
- **Résultat** : `CREATE TABLE` OK, `COPY 308`. Vérifications : **308 lignes restaurées** (= comptage du dump = comptes prod), **0 valeur NULL** sur `id`/`poste_id`/`benevole_id`, `created_at` cohérents (min `2026-03-09`, max `2026-05-24`), UUID valides (spot-check 2 lignes).
- **Nettoyage** : `DROP DATABASE dr_test` + suppression du `.sql` déchiffré et du dossier de travail.
- **Conclusion** : ✅ le backup chiffré est **intègre et restaurable**. La chaîne complète (artifact → `gh run download` → `gpg --decrypt` → `psql`) est validée de bout en bout.
