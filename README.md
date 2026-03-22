# Appel Bénévoles — Gestion des bénévoles pour compétition d'escalade

Système de gestion des bénévoles pour le **Championnat de France d'escalade de difficulté jeunes**. Permet aux bénévoles de s'inscrire sur des créneaux, aux juges de s'enregistrer, et aux administrateurs de piloter l'ensemble de l'organisation.

---

## Fonctionnalités

### Pour les bénévoles
- Authentification sans mot de passe (magic link / OTP email)
- Gestion de profils multiples (famille)
- Inscription sur des créneaux avec détection de conflits horaires
- Vue planning en liste ou calendrier
- Suivi du T-shirt (taille, retrait)
- Cagnotte : solde de crédits utilisables à la buvette

### Pour les juges
- Page dédiée (`juges.html`) avec suivi de présence samedi/dimanche
- Cagnotte calculée selon les dégainés effectués (`tarif_degaines_juge`)

### Pour les administrateurs
- Gestion des postes, périodes, bénévoles
- Statistiques : T-shirts par taille, repas, solde cagnotte
- Création de comptes bénévoles
- Page de diagnostic des connexions

### Sur le terrain
- `scanner-tshirt.html` : scan QR code pour marquer un T-shirt comme retiré
- `debit.html` : clavier de saisie pour débiter la cagnotte à la buvette

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | Alpine.js 3.13 + Tailwind CSS 3.3 |
| Build | Vite 7 + vite-plugin-html |
| Backend | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| Hébergement | GitHub Pages (frontend) + Supabase free tier (backend) |
| QR code | html5-qrcode (scan) + qrcode (génération) |

---

## Installation

### Prérequis
- Node.js 20+
- Compte Supabase
- CLI Supabase (pour les migrations)

### 1. Cloner et installer

```bash
git clone <repo>
cd appel-benevoles
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Remplir `.env` :

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_URL_LOCAL=http://localhost:5173
VITE_APP_URL_PRODUCTION=https://username.github.io/appel-benevoles
```

### 3. Appliquer les migrations Supabase

```bash
supabase db push
```

Ou depuis le dashboard Supabase, exécuter les fichiers SQL dans `supabase/migrations/` dans l'ordre numérique.

### 4. Déployer les Edge Functions

```bash
supabase functions deploy send-planning
supabase functions deploy create-benevole
```

Configurer les secrets SMTP pour `send-planning` :

```bash
supabase secrets set SMTP_HOST=smtp.gmail.com
supabase secrets set SMTP_PORT=465
supabase secrets set SMTP_USER=email@gmail.com
supabase secrets set SMTP_PASS=app_password
```

---

## Développement local

```bash
npm run dev
# http://localhost:5173
```

> **ATTENTION** : Le `.env` local pointe sur la **base Supabase de production**. Toute modification de données en développement affecte la prod.

---

## Build et déploiement

### Build manuel

```bash
npm run build
# Sortie dans dist/
npm run preview  # Prévisualiser le build
```

### Déploiement automatique (GitHub Actions)

Chaque push sur `master` déclenche `.github/workflows/deploy.yml` qui :
1. Build le projet avec injection des secrets GitHub
2. Déploie `dist/` sur GitHub Pages

Secrets GitHub requis :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL_PRODUCTION`

---

## Pages disponibles

| URL | Usage |
|-----|-------|
| `/` | Page principale bénévoles |
| `/admin.html` | Administration |
| `/juges.html` | Interface juges |
| `/admin-juges.html` | Administration juges |
| `/officiels.html` | Interface officiels |
| `/debit.html` | Débit cagnotte à la buvette |
| `/scanner-tshirt.html` | Scan distribution T-shirts |
| `/admin-connexions.html` | Diagnostic connexions |

---

## Configuration en base de données

Paramètres stockés dans la table `config` Supabase :

| Clé | Type | Description |
|-----|------|-------------|
| `cagnotte_active` | boolean | Active/désactive le système de cagnotte |
| `tarif_degaines_juge` | decimal | Crédit par dégainé pour les juges (défaut : 10.00) |

---

## Rôles utilisateurs

| Rôle | Accès |
|------|-------|
| `benevole` | Page principale, inscription créneaux |
| `referent` | Idem + vue des inscriptions de ses postes |
| `admin` | Toutes les pages, CRUD complet |
| `juge` | Page juges + cagnotte (calcul dégainés) |
| `admin-juge` | Administration des juges |
| `officiel` | Page officiels (repas, T-shirt) — sans cagnotte |

---

## Licence

MIT
