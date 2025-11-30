# Configuration Supabase - Wildcards Magic Link

## 🎯 URLs à Configurer

Votre configuration spécifique pour **JeanFi675** :

### Redirect URLs (Wildcards)

1. Allez sur : https://supabase.com/dashboard/project/pulrflaantftaogvgtnc/auth/url-configuration

2. Cliquez sur la section **"Redirect URLs"**

3. **Supprimez** toutes les URLs existantes (si présentes)

4. **Ajoutez** ces 2 wildcards :

```
http://localhost:5500/**
https://JeanFi675.github.io/appel-benevole/**
```

5. Cliquez sur **"Save"**

## ✅ Vérification

Après avoir configuré les wildcards, testez :

### Test Local
```bash
npm run dev
```
- Ouvrir http://localhost:5500
- Entrer votre email
- Cliquer "Recevoir le lien"
- Le lien dans l'email doit rediriger vers `localhost:5500/index.html`

### Test Production (après déploiement)
```bash
git add .
git commit -m "✨ Configuration Magic Link avec variables d'environnement"
git push origin main
```
- Attendre le déploiement GitHub Actions
- Visiter https://JeanFi675.github.io/appel-benevole
- Tester le Magic Link (doit rediriger vers GitHub Pages)

## 📋 Checklist Complète

- [x] Variables d'environnement configurées (.env)
- [x] Configuration build Vite (vite.config.js)
- [x] GitHub Actions workflow mis à jour
- [ ] **Wildcards Supabase configurés** ← À FAIRE MAINTENANT
- [ ] Test local du Magic Link
- [ ] Commit et push des changements
- [ ] Test production après déploiement

## 🔗 Liens Utiles

- Dashboard Auth : https://supabase.com/dashboard/project/pulrflaantftaogvgtnc/auth/url-configuration
- GitHub Repository : Vos secrets doivent contenir `VITE_APP_URL_PRODUCTION=https://JeanFi675.github.io/appel-benevole`
- Documentation : Voir CONFIGURATION_MAGIC_LINK.md

## ⚠️ Important

Les wildcards `**` permettent à Supabase d'accepter **tous les chemins** sous le domaine de base :
- `http://localhost:5500/**` → accepte `/index.html`, `/admin.html`, etc.
- `https://JeanFi675.github.io/appel-benevole/**` → accepte tous les chemins de votre site

C'est **sécurisé** car ces domaines vous appartiennent.
