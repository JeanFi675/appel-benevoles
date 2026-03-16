# Architecture — Appel Bénévoles

---

## Vue d'ensemble

Application web statique hébergée sur **GitHub Pages**, sans serveur applicatif. Toute la logique backend repose sur **Supabase** (PostgreSQL managé, Auth, Row Level Security, Edge Functions).

```
┌─────────────────────────────────────────────────────────┐
│                     NAVIGATEUR                          │
│                                                         │
│  Alpine.js + Tailwind CSS                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ index    │ │ admin    │ │ juges    │ │ debit    │  │
│  │ (main.js)│ │(admin.js)│ │(juges.js)│ │(debit.js)│  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       └────────────┴────────────┴─────────────┘        │
│                    @supabase/supabase-js                │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────┐
│                      SUPABASE                           │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │   Auth      │  │  PostgreSQL │  │ Edge Functions │  │
│  │ Magic Link  │  │  + RLS      │  │ (Deno/TS)      │  │
│  │ OTP email   │  │  + Triggers │  │ send-planning  │  │
│  └─────────────┘  └─────────────┘  │ create-benevole│  │
│                                    └────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Choix techniques

### Pourquoi pas React/Vue/Next.js ?
Contrainte d'hébergement gratuit (GitHub Pages = fichiers statiques uniquement). Alpine.js offre la réactivité nécessaire sans SSR ni build complexe. Le projet est mono-événement, sans besoin d'évolutivité à grande échelle.

### Pourquoi Supabase ?
- Authentification sans serveur (Magic Link)
- RLS (Row Level Security) : la sécurité est dans la base, pas dans le code frontend
- Triggers PostgreSQL pour la logique métier critique (conflits, capacité)
- Free tier suffisant pour un événement ponctuel
- Edge Functions Deno pour les cas qui nécessitent un serveur (envoi d'email, création de compte admin)

### Pourquoi le build est commité dans git (`dist/`) ?
Résidu d'architecture. Le déploiement se fait via GitHub Actions qui rebuild depuis les sources. Le dossier `dist/` versionné n'est pas utilisé par le pipeline CI/CD.

---

## Structure des fichiers source

```
appel-benevoles/
│
├── src/
│   ├── js/
│   │   ├── config.js              # Client Supabase (npm), singleton avec refresh dédupliqué
│   │   ├── constants.js           # Exports des variables d'env
│   │   ├── utils.js               # Formatage dates/heures
│   │   ├── main.js                # Point d'entrée page bénévoles
│   │   ├── admin.js               # Point d'entrée admin
│   │   ├── juges.js               # Point d'entrée juges
│   │   ├── debit.js               # Point d'entrée débit cagnotte
│   │   ├── officiels.js           # Point d'entrée officiels
│   │   ├── scanner-tshirt.js      # Point d'entrée scanner
│   │   ├── admin-juges.js         # Point d'entrée admin juges
│   │   ├── admin-connexions.js    # Point d'entrée diagnostic
│   │   │
│   │   ├── services/
│   │   │   ├── api.js             # Couche d'accès données (fetch/insert/update/delete/rpc)
│   │   │   └── auth.js            # Couche authentification (OTP, session, signOut)
│   │   │
│   │   └── modules/
│   │       ├── store.js           # Store central Alpine.js (état global + init)
│   │       ├── admin/
│   │       │   └── index.js       # Module admin (postes, périodes, bénévoles, stats)
│   │       └── user/
│   │           ├── profiles.js    # Gestion des profils bénévoles
│   │           ├── planning.js    # Planning, inscriptions, vue calendrier
│   │           ├── wizard.js      # Assistant d'inscription multi-étapes
│   │           ├── cagnotte.js    # Solde et QR code cagnotte
│   │           └── tshirt.js      # Suivi distribution T-shirts
│   │
│   ├── partials/
│   │   ├── layout/
│   │   │   ├── head.html          # <head> HTML (fonts, meta)
│   │   │   └── header.html        # Navigation
│   │   ├── components/
│   │   │   ├── toast.html         # Notifications toast
│   │   │   ├── confirm-modal.html # Modale de confirmation
│   │   │   └── post-card-details.html
│   │   └── sections/
│   │       ├── index/             # Sections page bénévoles
│   │       ├── admin/             # Tabs admin
│   │       ├── juges/             # Formulaire juges
│   │       └── officiels/         # Formulaire officiels
│   │
│   └── styles/
│       └── main.css               # CSS custom (complément Tailwind)
│
├── public/
│   └── config.js                  # Client Supabase alternatif (CDN window.supabase)
│                                  # ⚠️ Voir section "Double client Supabase"
│
├── supabase/
│   ├── migrations/                # 26 fichiers SQL (ordre chronologique)
│   └── functions/
│       ├── send-planning/index.ts
│       └── create-benevole/index.ts
│
├── index.html                     # Template EJS (injecté par vite-plugin-html)
├── admin.html
├── ... (1 fichier HTML par page)
│
└── vite.config.js                 # 8 points d'entrée, base "./" pour GitHub Pages
```

---

## Flux de données

### Authentification
```
1. Utilisateur saisit son email
2. Supabase Auth envoie un OTP 6 chiffres par email
3. L'utilisateur saisit l'OTP → session JWT stockée en localStorage
4. Alpine.js store récupère la session et charge les données
```

### Inscription à un créneau
```
1. Lecture des postes (table postes + vue public_planning)
2. Clic "S'inscrire" → INSERT dans inscriptions
3. Trigger check_capacity() : bloque si poste complet
4. Trigger check_time_conflict() : bloque si chevauchement horaire
5. Mise à jour de l'affichage (reload des postes)
```

### Débit cagnotte (sur le terrain)
```
1. QR code scanné depuis la page cagnotte d'un bénévole
2. Redirection vers /debit.html?id=<benevole_id>
3. Opérateur saisit le montant sur le clavier
4. INSERT dans cagnotte_transactions
```

---

## Schéma de la base de données

```
auth.users (Supabase Auth)
    │
    ├─── benevoles (1:1)
    │         id, email, prenom, nom, telephone
    │         taille_tshirt, role
    │         repas_vendredi, repas_samedi, vegetarien
    │         presence_samedi, presence_dimanche  (juges)
    │         t_shirt_recupere
    │
    ├─── cagnotte_transactions (1:N)
    │         user_id, montant, created_at
    │
    └─── inscriptions (via benevoles)
              poste_id ──────────────── postes
              benevole_id                    │
                                             ├── periode_id ── periodes
                                             │       nom, ordre
                                             │
                                             └── referent_id ── benevoles
                                                     titre, description
                                                     nb_min, nb_max
                                                     periode_debut, periode_fin

config
    key, value  (feature flags : cagnotte_active, tarif_degaines_juge)
```

### Vues importantes

| Vue | Usage |
|-----|-------|
| `public_planning` | Affichage public anonymisé (Prénom + Initiale) avec compteur d'inscrits |
| `admin_benevoles` | Tous les bénévoles avec détails complets (admin uniquement) |
| `admin_inscriptions` | Toutes les inscriptions avec détails croisés |
| `admin_periodes` | Périodes avec compteur de postes |

### Triggers critiques (logique métier en base)

**`check_capacity()`** — BEFORE INSERT sur `inscriptions`
- Compte les inscrits existants sur le poste
- Bloque si `COUNT >= nb_max`
- Message : "Ce créneau est complet"

**`check_time_conflict()`** — BEFORE INSERT/UPDATE sur `inscriptions`
- Vérifie les chevauchements pour le même bénévole
- Formule : `(debut_A < fin_B) AND (fin_A > debut_B)`
- Message : "Conflit horaire"

---

## Row Level Security (RLS)

| Table | Lecture | Écriture |
|-------|---------|----------|
| `postes` | PUBLIC | Admin uniquement |
| `benevoles` | Ses propres données | Ses propres données / Admin full |
| `inscriptions` | PUBLIC | Ses propres inscriptions / Admin full |
| `periodes` | PUBLIC | Admin uniquement |
| `config` | PUBLIC | Admin uniquement |
| `cagnotte_transactions` | Ses propres données | Admin full |

---

## Système de modules Alpine.js

Le store central (`modules/store.js`) agrège plusieurs modules par mixin :

```
Alpine.store('app', {
  ...ProfilesModule,      // profils bénévoles
  ...PlanningModule,      // planning et inscriptions
  ...WizardModule,        // assistant d'inscription
  ...CagnotteModule,      // solde et QR
  ...TshirtModule,        // distribution T-shirts
  // + état global (user, loading, toasts, confirmModal)
})
```

Chaque module expose son propre state et ses méthodes. L'état est plat dans le store (pas de namespace imbriqué).

---

## Double client Supabase — Point d'attention

Il existe deux manières d'initialiser le client Supabase dans ce projet :

| Fichier | Mécanisme | Exposé via |
|---------|-----------|------------|
| `src/js/config.js` | `import` npm | Export ES module |
| `public/config.js` | `window.supabase` CDN | `window.appConfig` |

Les pages principales (`index.html`, `admin.html`) utilisent le client npm via les modules ES. Certaines pages secondaires ou fonctionnalités issues de génération IA peuvent utiliser `window.appConfig`. Si une page se comporte bizarrement avec Supabase, vérifier lequel des deux clients est utilisé.

---

## Build et déploiement

### Pipeline Vite

`vite-plugin-html` compile les templates EJS (partials HTML) lors du build. Chaque page HTML est un point d'entrée Rollup indépendant avec son propre bundle JS.

```
index.html (EJS template)
    ├── <%- include('src/partials/layout/head.html') %>
    ├── <%- include('src/partials/sections/index/login.html') %>
    └── <script> → src/js/main.js → bundle séparé dans dist/assets/
```

### Variables d'environnement

Les variables préfixées `VITE_` sont injectées dans le bundle lors du build. Les variables sans préfixe (`SUPABASE_SERVICE_ROLE_KEY`) ne sont jamais exposées au frontend.

---

## Design — Neo-Brutalism

Palette et conventions visuelles définies dans `tailwind.config.js` :

```js
colors: {
  'brutal-black': '#000000',
  'brutal-ice':   '#8bbfd5',  // accent principal
  'brutal-white': '#ffffff',
}
boxShadow: {
  'brutal':       '4px 4px 0px black',
  'brutal-sm':    '2px 2px 0px black',
  'brutal-hover': '1px 1px 0px black',
}
fontFamily: {
  sans:    ['Space Grotesk'],
  heading: ['Inter'],
}
```

Règles visuelles : bordures noires épaisses, ombres sans flou, pas de dégradés, typographie bold/uppercase pour les titres.
