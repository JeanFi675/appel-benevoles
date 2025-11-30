# 🧗 Système de Gestion de Bénévoles pour Compétition d'Escalade

Application web moderne pour gérer les inscriptions de bénévoles avec authentification Magic Link, gestion des conflits temporels et design neo-brutaliste.

## ✨ Fonctionnalités

- ✅ **Authentification sans mot de passe** (Magic Link par email)
- ✅ **Gestion des profils** bénévoles (nom, prénom, téléphone, taille t-shirt)
- ✅ **Planning des postes** avec horaires et descriptions
- ✅ **Blocage automatique** si capacité maximale atteinte
- ✅ **Détection des conflits temporels** (impossible de s'inscrire sur 2 créneaux qui se chevauchent)
- ✅ **Anonymisation des données** (affichage Prénom + Initiale du nom)
- ✅ **Design neo-brutaliste** moderne et impactant
- ✅ **100% gratuit** (Supabase + GitHub Pages)

## 🏗️ Architecture Technique

### Stack

- **Frontend** : HTML + Alpine.js + Tailwind CSS (via CDN, pas de build)
- **Backend** : Supabase (PostgreSQL + Auth + Row Level Security)
- **Hébergement** : GitHub Pages (statique)
- **Design** : Neo-brutaliste (noir/ice/blanc, bordures épaisses, ombres dures)

### Base de Données

- `postes` : Créneaux de bénévolat (titre, horaires, capacité min/max, catégorie)
- `benevoles` : Profils utilisateurs (prénom, nom, téléphone, taille t-shirt)
- `inscriptions` : Liaison bénévoles ↔ postes
- `public_planning` : Vue anonymisée pour affichage public

### Sécurité

- **Row Level Security (RLS)** : Chaque utilisateur ne peut modifier que ses propres données
- **Triggers PostgreSQL** : Validation atomique des capacités et conflits temporels
- **Clé API publique** : Sûre car protégée par RLS

## 📦 Installation et Configuration

### 1. Configuration Supabase

#### A. Créer un projet Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet (plan gratuit)
3. Notez votre **Project URL** et **Anon Key**

#### B. Appliquer le schéma de base de données

1. Dans le dashboard Supabase, allez dans **SQL Editor**
2. Collez le contenu du fichier `supabase/migrations/001_init_schema.sql`
3. Exécutez le script

#### C. Configurer l'authentification Magic Link

1. **Authentication** → **Providers** → **Email**
2. Activez "Enable Email provider"
3. **Authentication** → **URL Configuration**
   - **Site URL** : `https://votre-username.github.io/appel-benevole`
   - **Redirect URLs** : Ajoutez la même URL

#### D. Ajouter des postes de test

Dans le **Table Editor**, ajoutez quelques postes :

```sql
INSERT INTO postes (titre, periode_debut, periode_fin, categorie, description, nb_min, nb_max) VALUES
('Juge de bloc', '2025-06-14 08:00:00+02', '2025-06-14 12:00:00+02', 'Qualifications Samedi', 'Connaissance des règles FFME requise', 2, 4),
('Assureur', '2025-06-14 08:00:00+02', '2025-06-14 12:00:00+02', 'Qualifications Samedi', 'Doit savoir assurer en tête', 3, 6),
('Buvette', '2025-06-14 12:00:00+02', '2025-06-14 18:00:00+02', 'Qualifications Samedi', 'Service boissons et snacks', 1, 3);
```

### 2. Configuration du Frontend

Modifiez le fichier `index.html` :

```javascript
// Ligne 222-223 : Remplacez par vos propres identifiants
const SUPABASE_URL = 'https://VOTRE_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';
```

### 3. Déploiement sur GitHub Pages

#### A. Créer un repository GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/appel-benevole.git
git push -u origin main
```

#### B. Activer GitHub Pages

1. Allez dans **Settings** → **Pages**
2. Source : **Deploy from a branch**
3. Branch : **main** / **/ (root)**
4. Cliquez sur **Save**

Votre site sera disponible à : `https://VOTRE_USERNAME.github.io/appel-benevole`

⚠️ **Important** : Retournez dans Supabase → Authentication → URL Configuration et mettez à jour les URLs avec votre URL GitHub Pages finale.

## 🎨 Personnalisation

### Couleurs

Modifiez les couleurs dans `index.html` (ligne 27-31) :

```javascript
colors: {
  'brutal-black': '#000000',
  'brutal-ice': '#8bbfd5',    // Changez cette couleur
  'brutal-white': '#ffffff',
}
```

### Typographies

Changez les fonts Google Fonts (ligne 9) :

```html
<link href="https://fonts.googleapis.com/css2?family=VotreFontTitre&family=VotreFontBody&display=swap" rel="stylesheet">
```

## 📊 Administration

### Ajouter des postes

**Via le Table Editor Supabase** (recommandé) :
1. Ouvrez **Table Editor** → **postes**
2. Cliquez sur **Insert row**
3. Remplissez les champs directement comme dans Excel

**Via SQL** :
```sql
INSERT INTO postes (titre, periode_debut, periode_fin, categorie, description, nb_min, nb_max)
VALUES ('Nouveau poste', '2025-06-14 14:00:00+02', '2025-06-14 18:00:00+02', 'Catégorie', 'Description', 2, 5);
```

### Exporter les données

Dans **Table Editor** → Sélectionnez la table → **Export to CSV**

Ou via SQL :

```sql
SELECT
  p.titre as Poste,
  p.periode_debut as Debut,
  p.periode_fin as Fin,
  b.prenom as Prenom,
  b.nom as Nom,
  b.telephone as Telephone,
  b.taille_tshirt as Taille
FROM inscriptions i
JOIN postes p ON i.poste_id = p.id
JOIN benevoles b ON i.benevole_id = b.id
ORDER BY p.periode_debut, p.titre;
```

### Supprimer les données après l'événement (RGPD)

```sql
-- Anonymiser les données personnelles
UPDATE benevoles
SET nom = 'ANONYME',
    prenom = 'ANONYME',
    telephone = NULL,
    email = 'anonyme@example.com';

-- Ou supprimer complètement
DELETE FROM inscriptions;
DELETE FROM benevoles;
```

## 🔒 Sécurité

- ✅ Row Level Security (RLS) activé sur toutes les tables
- ✅ Un bénévole ne peut voir/modifier que ses propres données
- ✅ Les postes sont en lecture seule pour les utilisateurs
- ✅ Les triggers empêchent les race conditions
- ✅ Anonymisation automatique via la vue `public_planning`

## 🐛 Résolution de Problèmes

### Le Magic Link n'arrive pas

1. Vérifiez vos spams
2. Vérifiez que l'email provider est activé dans Supabase
3. Vérifiez les quotas du plan gratuit (limite d'emails/jour)

### Erreur "Ce créneau est complet"

Normal ! Le trigger fonctionne. Le créneau a été pris entre-temps.

### Erreur "Conflit horaire"

Normal ! Vous essayez de vous inscrire sur un créneau qui chevauche une inscription existante.

### Les RLS bloquent tout

Vérifiez que vous êtes bien connecté (`auth.uid()` doit retourner votre user ID).

## 📈 Limites du Plan Gratuit Supabase

- 500 MB de stockage (largement suffisant)
- 50 000 utilisateurs actifs/mois
- 2 GB de bande passante/mois
- Envoi d'emails limité (quelques centaines/jour)

## 📝 Licence

MIT - Libre d'utilisation pour votre compétition d'escalade !

## 🙏 Crédits

- Framework CSS : [Tailwind CSS](https://tailwindcss.com)
- Framework JS : [Alpine.js](https://alpinejs.dev)
- Backend : [Supabase](https://supabase.com)
- Fonts : [Google Fonts](https://fonts.google.com)
