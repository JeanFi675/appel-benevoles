# Configuration Magic Link - Guide Complet

## ✅ Implémentation Terminée

La configuration du Magic Link a été modernisée avec succès ! Voici ce qui a été fait :

### Fichiers Modifiés

1. **`.env`** - Variables d'environnement avec préfixe `VITE_*` pour le frontend
2. **`.env.example`** - Template mis à jour pour les nouveaux développeurs
3. **`public/config.js`** - Configuration partagée centralisée (nouveau fichier)
4. **`index.html`** - Injection des variables d'environnement + utilisation de `config.js`
5. **`admin.html`** - Injection des variables d'environnement + utilisation de `config.js`
6. **`vite.config.js`** - Plugin `vite-plugin-html` pour injection des variables
7. **`.github/workflows/deploy.yml`** - Injection des secrets GitHub au build
8. **`package.json`** - Dépendance `vite-plugin-html` ajoutée

## 🚀 Prochaines Étapes

### 1. Configurer les GitHub Secrets

Avant de pouvoir déployer sur GitHub Pages, vous devez configurer les secrets :

1. Allez sur votre dépôt GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Cliquez sur **"New repository secret"**
4. Ajoutez ces 3 secrets :

| Nom | Valeur |
|-----|--------|
| `VITE_SUPABASE_URL` | Votre URL Supabase (Dashboard → Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Votre clé anon (Dashboard → Settings → API) |
| `VITE_APP_URL_PRODUCTION` | `https://VOTRE_USERNAME.github.io/appel-benevole` |

**⚠️ Important** : Remplacez `VOTRE_USERNAME` par votre vrai username GitHub !

### 2. Configurer les Redirect URLs Supabase (Wildcards)

1. Allez sur : https://supabase.com/dashboard/project/pulrflaantftaogvgtnc/auth/url-configuration
2. Section **"Redirect URLs"**
3. **Supprimez** toutes les URLs individuelles existantes
4. **Ajoutez** ces 2 wildcards :
   - `http://localhost:5500/**`
   - `https://VOTRE_USERNAME.github.io/appel-benevole/**`
5. Cliquez **"Save"**

**⚠️ Important** : Remplacez `VOTRE_USERNAME` par votre vrai username GitHub !

### 3. Mettre à Jour .env Local

Modifiez la ligne 12 de votre `.env` local :

```env
VITE_APP_URL_PRODUCTION=https://VOTRE_USERNAME.github.io/appel-benevole
```

Remplacez `YOUR_USERNAME` par votre vrai username GitHub.

### 4. Tester en Local

```bash
npm run dev
```

Ouvrez `http://localhost:5500` dans votre navigateur et vérifiez :

1. Console du navigateur (F12) affiche :
   ```
   🔧 Environnement : Development
   🌐 App URL : http://localhost:5500
   ```

2. Testez le Magic Link :
   - Entrez votre email
   - Cliquez "Recevoir le lien"
   - Vérifiez votre boîte mail
   - Cliquez sur le lien → devrait rediriger vers `localhost:5500/index.html`

### 5. Déployer sur GitHub Pages

```bash
git add .
git commit -m "✨ Amélioration configuration Magic Link avec variables d'environnement

- Centralisation des credentials Supabase dans config.js
- Injection des variables via vite-plugin-html
- GitHub Actions avec secrets pour production
- Wildcards Supabase pour simplifier la config
- .nojekyll pour GitHub Pages"

git push origin main
```

Le workflow GitHub Actions va automatiquement :
1. Installer les dépendances
2. Injecter les secrets comme variables d'environnement
3. Builder le projet
4. Créer le fichier `.nojekyll`
5. Déployer sur GitHub Pages

### 6. Vérifier le Déploiement

1. GitHub → **Actions** → Vérifier que le workflow réussit
2. Visiter `https://VOTRE_USERNAME.github.io/appel-benevole`
3. Tester le Magic Link en production

## 🔍 Vérification des Variables (Debugging)

### En Local (Dev Server)

Ouvrez la console navigateur (F12) et tapez :

```javascript
window.ENV
// Devrait afficher : { VITE_SUPABASE_URL: "https://...", ... }

window.appConfig
// Devrait afficher : { supabase: {...}, getAppUrl: f, ... }
```

### En Production (Build)

Inspectez le code source de `dist/index.html` après build :

```bash
npm run build
grep "window.ENV" dist/index.html
```

Vous devriez voir les vraies valeurs, pas les placeholders `%VITE_*%`.

## 📋 Checklist de Sécurité

Avant de mettre en production, vérifiez :

- [ ] `.env` est dans `.gitignore` (ne jamais commiter les credentials)
- [ ] GitHub Secrets configurés correctement
- [ ] Wildcards Supabase configurés
- [ ] RLS policies actives sur toutes les tables Supabase :
  - [ ] `postes` : SELECT public, INSERT/UPDATE/DELETE admin uniquement
  - [ ] `benevoles` : Users can only read/write leur profil
  - [ ] `inscriptions` : Users can only create/delete leurs inscriptions
  - [ ] `admin_*` views : Accessible uniquement par `role='admin'`

## 🎯 Avantages de la Nouvelle Configuration

✅ **Credentials centralisés** - Un seul fichier `config.js` au lieu de 2 HTML hardcodés
✅ **Variables d'environnement** - `.env` pour local, GitHub Secrets pour production
✅ **Build-time injection** - Vite remplace les placeholders automatiquement
✅ **Wildcards Supabase** - Plus besoin d'ajouter manuellement chaque URL
✅ **GitHub Actions automatisé** - Deploy sans configuration manuelle
✅ **Sécurité améliorée** - `.env` git-ignoré, secrets GitHub chiffrés
✅ **DX simplifié** - Nouveaux devs : `cp .env.example .env` → `npm run dev`

## 📚 Architecture Technique

```
Développement Local:
.env → Vite → vite-plugin-html → index.html/admin.html → window.ENV → config.js

Production (GitHub Pages):
GitHub Secrets → GitHub Actions → Vite → vite-plugin-html → dist/ → Déploiement
```

## 🆘 Dépannage

### Erreur : "Configuration Supabase manquante"

**Cause** : Variables d'environnement non chargées

**Solution** :
```bash
# Vérifier que .env existe et contient VITE_*
cat .env | grep VITE_

# Redémarrer le serveur dev
npm run dev
```

### Build GitHub Actions Échoue

**Causes possibles** :
1. Secrets GitHub manquants → Vérifier Settings → Secrets
2. Variables non préfixées `VITE_` → Ajouter le préfixe
3. Syntaxe YAML invalide → Valider avec yamllint

### Magic Link Ne Fonctionne Pas

**Vérifications** :
1. Wildcards Supabase configurés correctement
2. Email provider activé dans Supabase Auth
3. Console browser pour voir les erreurs
4. Logs Supabase Auth pour voir les redirections

## 📞 Support

Pour toute question, vérifiez d'abord :
1. Ce guide
2. Le plan détaillé : `/home/jeanfi/.claude/plans/jaunty-waddling-locket.md`
3. La documentation Supabase : https://supabase.com/docs/guides/auth/auth-magic-link
4. La documentation Vite : https://vitejs.dev/guide/env-and-mode.html
