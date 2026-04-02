# Scripts

Ce dossier contient des scripts utilitaires pour le projet.

## `extract_adherents_non_benevoles.js`

Ce script permet d'exporter une liste des adhérents du club (issus de la table `club_adhesions`) qui **ne se sont pas encore inscrits** comme bénévoles (dans la table `benevoles`). Le croisement se fait par e-mail ou par paires "Nom + Prénom". Les membres n'ayant pas d'e-mail ne sont pas inclus.

### 📋 Prérequis

Pour que ce script s'exécute, il est indispensable de disposer des droits administrateur (afin de contourner le *Row Level Security* pour lire toutes les données des deux tables). 

1. Ouvrez votre fichier `.env` à la racine du projet.
2. Assurez-vous d'avoir la variable `SUPABASE_SERVICE_ROLE_KEY` renseignée (vous la trouverez dans les paramètres *API* de votre projet Supabase).

Exemple `.env` :
```env
SUPABASE_URL=https://votre-url-supabase.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre_cle_secrete_service_role_ici
```

### 🚀 Exécution

Pour lancer le script, ouvrez un terminal à la racine de votre projet et tapez :

```bash
node scripts/extract_adherents_non_benevoles.js
```

### 📄 Résultat

Le script génèrera un fichier nommé **`adherents_non_benevoles.json`** à la racine de votre projet contenant la liste épurée. 
Ce fichier est ignoré dans Git (via le `.gitignore`), ce qui empêche d'exposer publiquement ces données personnelles.
