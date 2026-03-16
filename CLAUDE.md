# CLAUDE.md — Contexte pour agents IA

Ce fichier est destiné aux agents IA qui travailleront sur ce projet. Lis-le entièrement avant de toucher au code.

---

## Contexte du projet

Système de gestion de bénévoles pour le **Championnat de France d'escalade de difficulté jeunes**. Projet **mono-édition** (pas de multi-événements prévus). Application **en production active** au moment de la lecture de ce fichier.

---

## ⚠️ AVERTISSEMENTS CRITIQUES

### 1. Dev local = base de production
Le fichier `.env` local pointe sur la **base Supabase de production**. Il n'existe pas d'environnement de staging. Toute opération de données en développement affecte les vrais utilisateurs. Ne jamais :
- Vider ou modifier des tables en dev sans confirmation explicite de l'utilisateur
- Exécuter des migrations destructives sans vérification
- Tester des insertions massives

### 2. Logique métier dans les triggers PostgreSQL
Les règles de capacité et de conflits horaires sont dans des triggers SQL, **pas dans le frontend**. Ne pas les contourner côté JS. Ne pas les dupliquer non plus.

### 3. Ne pas modifier les politiques RLS sans expertise
Les politiques Row Level Security sur toutes les tables sont délicates. Une mauvaise politique peut exposer des données personnelles ou bloquer les utilisateurs. Voir `supabase/migrations/006_fix_rls_policies.sql` et `008_fix_rls_recursion.sql` qui ont déjà corrigé des bugs RLS.

### 4. Ne pas supprimer `dist/` du repo sans vérifier
Ce dossier est versionné par erreur (résidu) mais son impact sur le déploiement est à vérifier avant suppression.

---

## Stack et versions

| Outil | Version | Usage |
|-------|---------|-------|
| Node.js | 20+ | Runtime de build |
| Vite | ^7.3.0 | Bundler + dev server |
| Alpine.js | ^3.13.3 | Réactivité frontend |
| Tailwind CSS | ^3.3.5 | Styles utilitaires |
| vite-plugin-html | ^3.2.2 | Templates EJS + minification HTML |
| @supabase/supabase-js | ^2.39.0 | Client DB/Auth |
| html5-qrcode | ^2.3.8 | Lecture QR code |
| qrcode | ^1.5.4 | Génération QR code |
| Supabase CLI | latest | Migrations et Edge Functions |
| Deno | latest | Runtime des Edge Functions |

---

## Commandes importantes

```bash
# Développement
npm run dev          # Vite dev server sur localhost:5173

# Build
npm run build        # Build production dans dist/
npm run preview      # Prévisualiser le build local

# Supabase
supabase db push                              # Appliquer les migrations
supabase functions deploy send-planning       # Déployer Edge Function email
supabase functions deploy create-benevole    # Déployer Edge Function création bénévole
supabase secrets set CLE=valeur              # Configurer secrets Edge Functions
```

---

## Architecture des données

### Tables principales

```sql
benevoles       -- Profils utilisateurs (1:1 avec auth.users)
postes          -- Créneaux/postes de bénévolat
inscriptions    -- Jonction benevoles ↔ postes (avec contraintes)
periodes        -- Blocs temporels de compétition (ex: "Qualif Samedi")
config          -- Feature flags et paramètres (clé/valeur)
cagnotte_transactions -- Transactions de crédit/débit bénévoles
```

### Rôles utilisateurs

Les rôles sont stockés dans `benevoles.role` :
- `benevole` — accès page principale
- `referent` — voir les inscriptions de ses postes
- `admin` — accès complet
- `juge` — page juges + cagnotte (calcul dégainés)
- `admin-juge` — administration des juges
- `officiel` — page officiels, **sans** accès cagnotte

### Feature flags (table `config`)
- `cagnotte_active` : active/désactive l'affichage cagnotte
- `tarif_degaines_juge` : montant crédité par dégainé juge (défaut 10.00)

---

## Conventions de code à respecter

Ce projet n'avait pas de conventions formelles initialement. Voici celles à adopter pour tout nouveau code :

### Structure d'une nouvelle page
Chaque nouvelle page suit ce patron :
1. Un fichier HTML racine (`ma-page.html`) — template EJS
2. Un fichier JS d'entrée (`src/js/ma-page.js`) — initialise Alpine.js
3. Des partials HTML dans `src/partials/sections/ma-page/`
4. Déclaration dans `vite.config.js` (plugins + rollupOptions)

### JavaScript
- **Alpine.js** pour tout ce qui est réactif dans le DOM
- **Pas de classes JS** — utiliser des objets littéraux retournés par des fonctions
- **Services** (`api.js`, `auth.js`) pour tout accès Supabase — ne jamais appeler `supabase` directement dans un module
- Préfixer les méthodes de chargement par `load` : `loadProfiles()`, `loadPostes()`
- Préfixer les méthodes de sauvegarde par `save` : `saveProfile()`
- Les méthodes qui modifient des données doivent afficher un toast de confirmation ou d'erreur

### HTML / Partials
- Les partials sont des fragments EJS (`<%- include('chemin') %>`)
- Ne pas mettre de logique métier dans les templates HTML
- Les attributs Alpine.js (`x-data`, `x-on:click`, etc.) en kebab-case
- Utiliser les classes Tailwind, pas de CSS inline

### SQL / Migrations
- Nommer les fichiers de migration : `YYYYMMDDHHMMSS_description_courte.sql`
- Toujours inclure `-- Migration: description` en en-tête
- Tester mentalement l'impact RLS avant toute migration
- Ne jamais modifier une migration déjà appliquée en prod — créer une nouvelle

### Tailwind CSS
- Utiliser les tokens custom : `brutal-black`, `brutal-ice`, `brutal-white`
- Ombres : `shadow-brutal`, `shadow-brutal-sm`, `shadow-brutal-hover`
- Police body : `font-sans` (Space Grotesk), titres : `font-heading` (Inter)
- Pas de valeurs hardcodées pour couleurs et ombres — utiliser les tokens

---

## Pièges et points d'attention

### Double client Supabase
Il existe deux initialisations du client Supabase :
- `src/js/config.js` — client npm ES module, utilisé par les pages principales
- `public/config.js` — client CDN (`window.supabase`), expose `window.appConfig`

Si une page a un comportement Supabase bizarre, vérifier lequel des deux elle utilise. Idéalement n'en utiliser qu'un seul. La version npm (`src/js/config.js`) est la référence.

### Singleton de refresh Supabase
`src/js/config.js` contient un mécanisme de déduplication des appels de refresh de token. Ne pas le modifier — il évite des race conditions lors du chargement de pages avec plusieurs appels Supabase simultanés.

### Triggers PostgreSQL — ne pas contourner
Les triggers `check_capacity()` et `check_time_conflict()` sont en base. Si un INSERT dans `inscriptions` échoue, c'est normal — afficher l'erreur à l'utilisateur. Ne pas gérer cette logique côté frontend.

### Anonymisation des données publiques
La vue `public_planning` affiche "Prénom + Initiale" (ex: "Marie D."). Ne jamais exposer les noms complets dans une vue ou requête publique.

### Timeout RLS recursion
Les politiques RLS utilisent des fonctions sécurisées pour éviter la récursion infinie. Si tu modifies une politique RLS et que des requêtes commencent à timeout, c'est probablement une récursion. Voir les migrations 006 à 008.

### `npm run dev` pointe sur la prod
Voir avertissement critique #1. Conséquence pratique : les inscriptions, profils et transactions créées en dev sont réels. Utiliser des emails de test et nettoyer après.

### Le dossier `dist/` est dans git
Résidu d'architecture. Le pipeline CI/CD (GitHub Actions) rebuild depuis les sources et ne lit pas ce dossier. Ne pas s'y fier pour comprendre l'état de production.

---

## Ce qu'il NE faut PAS modifier sans précaution

| Élément | Risque | Précaution |
|---------|--------|------------|
| Triggers SQL (`check_capacity`, `check_time_conflict`) | Inscriptions en double ou sans contrôle | Tester sur une copie de la DB |
| Politiques RLS sur `benevoles`, `inscriptions` | Fuite de données personnelles | Lire les migrations 006-008 avant |
| `src/js/config.js` — singleton refresh | Race conditions d'authentification | Ne pas simplifier sans comprendre |
| Table `config` — `cagnotte_active` | Désactiver la cagnotte en production | Confirmer avec l'utilisateur |
| Schema `auth.users` (Supabase) | Casse l'authentification | Ne jamais modifier directement |
| `vite.config.js` — `base: "./"` | Chemins cassés sur GitHub Pages | Garder `"./"` pour déploiement relatif |
| Politiques RLS sur `cagnotte_transactions` | Accès non autorisé aux soldes | Tester avec différents rôles |

---

## Edge Functions

Deux fonctions Deno dans `supabase/functions/` :

**`send-planning`** — Envoie le planning par email
- Requiert headers `Authorization: Bearer <jwt>`
- Timeout RPC : 30 secondes
- Variables d'environnement : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS

**`create-benevole`** — Création de compte par l'admin
- Vérifie que l'appelant a le rôle `admin`
- Utilise la Service Role Key pour créer des comptes Auth
- Ne pas exposer la Service Role Key au frontend

---

## Répertoire des migrations SQL

Les migrations sont dans `supabase/migrations/`, nommées chronologiquement. Les 12 premières utilisent un numéro simple (`001_`…`012_`), les suivantes un timestamp ISO. Ordre important lors d'une réinstallation — exécuter dans l'ordre alphabétique.

Dernière migration en date : `20260316083700_add_fk_postes_referent_id.sql`

---

## Tests

Il n'y a pas de suite de tests automatisés. Les validations se font :
- Manuellement dans l'interface
- Via les contraintes PostgreSQL (triggers, RLS)
- Via la page `admin-connexions.html` pour le diagnostic

Avant tout déploiement d'une migration, vérifier mentalement :
1. L'impact sur les politiques RLS existantes
2. Les données existantes (migration rétrocompatible ?)
3. Les vues qui dépendent des tables modifiées
