# Phase 4.1 — Liste consolidée du code mort et dépendances inutilisées

Date : 2026-05-27
Sources : `audit/19_knip.txt` (knip 6.14.2) et `audit/20_depcheck.txt` (depcheck).

## Fichiers à supprimer

Aucun fichier JS dans `src/` n'a été marqué inutilisé par knip avec la configuration actuelle (tous les modules sont atteignables depuis les 6 entrées Vite + `vite.config.js`).

### Candidats hors `src/` détectés par revue manuelle (hors périmètre knip)

| Fichier | Statut | Justification |
|---|---|---|
| `check-role.js` (racine) | À confirmer avec mainteneur avant Phase 4.2 | Script one-off de debug. Fonction `check()` vide. Utilise `dotenv`. Aucun import depuis le code applicatif. Non listé dans `package.json` scripts. |

> Cette liste sera enrichie lors de la Phase 4.2 (suppression effective) si la revue d'autres répertoires révèle du scaffolding obsolète.

## Dépendances à supprimer

### Confirmées inutilisées (à supprimer en Phase 4.2.2)

| Dépendance | Type | Confirmation |
|---|---|---|
| `html5-qrcode` | dependency | Aucune occurrence dans `src/` (grep `html5-qrcode\|Html5Qrcode` → 0 résultat). Le scanner T-shirt (`scanner-tshirt.js`) lit un `id` depuis l'URL, pas via la caméra. Mentionné uniquement dans `CLAUDE.md` et `README.md` (doc à mettre à jour en Phase 7). |
| `depcheck` | devDependency | Outil CLI utilisé une seule fois pour cet audit (Phase 4.1). Peut être retiré post-audit, ou conservé pour rejouer l'audit ultérieurement. **Décision recommandée** : retirer après Phase 4.2 — `npx depcheck` continue de fonctionner sans installation locale. |

### Faux positifs (à conserver)

| Dépendance | Source du faux positif | Pourquoi conserver |
|---|---|---|
| `dotenv` | knip (entry restreinte) | Utilisé par `check-role.js`. Si `check-role.js` est supprimé, `dotenv` peut l'être aussi. |
| `autoprefixer` | depcheck | Plugin PostCSS référencé dans `postcss.config.js`. |
| `postcss` | depcheck | Build PostCSS / Tailwind. |
| `tailwindcss` | depcheck | Plugin PostCSS référencé dans `postcss.config.js` + `tailwind.config.js`. |
| `depcheck` | depcheck | Outil d'audit lui-même (méta). |
| `knip` | depcheck | Outil d'audit. |

### Dépendances "manquantes" reportées (hors périmètre Node)

| Dépendance | Contexte |
|---|---|
| `nodemailer` | Importée dans `supabase/functions/send-relance-orphelin/index.ts` (Deno/Edge Function — résolu via import maps Supabase, pas npm). Faux positif. |
| `qrcode` | Importée à la fois dans `src/js/modules/user/{cagnotte,tshirt}.js` (réellement utilisée — déjà présente dans `package.json`) et dans `supabase/functions/send-rappel-all/index.ts` (Deno). RAS. |

## Méthodes/propriétés Alpine.js mortes (audit A — script `scripts/audit-alpine-methods.js`)

> Détection : pour chaque méthode/propriété top-level déclarée dans un `Alpine.data(...)`, `Alpine.store(...)` ou un module spread (`...XxxModule`), comptage des occurrences `\bname\b` dans `src/**/*.{js,html}` + HTML racine. `refs=1` ⇒ uniquement la déclaration ⇒ candidat à supprimer. Voir rapport brut `audit/22_alpine_methods.txt`.

Méthodes lifecycle Alpine (`init`, `destroy`) filtrées automatiquement. 25 candidats détectés — tous spot-checkés au grep, aucun faux positif observé.

### À supprimer (déclaration + corps de méthode)

| Méthode / propriété | Déclarée dans | Notes |
|---|---|---|
| `generateRapportIA` | `src/js/modules/admin/index.js` | Confirme la pré-validation 4.2.1 (rapport IA OpenRouter abandonné). |
| `getRepasName` | `src/js/modules/store.js` | Helper jamais appelé depuis HTML/JS. |
| `addVisualLine` | `src/js/modules/admin/index.js` | UI builder visuel (déprécié ?). |
| `addVisualPeriod` | `src/js/modules/admin/index.js` | Idem. |
| `addVisualShift` | `src/js/modules/admin/index.js` | Idem. |
| `deleteVisualPeriod` | `src/js/modules/admin/index.js` | Idem. |
| `deleteVisualShift` | `src/js/modules/admin/index.js` | Idem. |
| `closePosteInscritsModal` | `src/js/modules/admin/index.js` | Modale jamais fermée explicitement. |
| `closeRegistrationModal` | `src/js/modules/user/planning.js` | Modale d'inscription : non liée à un handler. |
| `openRegistrationModal` | `src/js/modules/user/planning.js` | Idem. |
| `getFilteredPostes` | `src/js/modules/admin/index.js` | Computed jamais lu. |
| `getPeriodeInscritsColor` | `src/js/modules/admin/index.js` | Helper UI mort. |
| `getPeriodesCritiques` | `src/js/modules/admin/index.js` | Helper UI mort. |
| `getPostesCountForPeriode` | `src/js/modules/admin/index.js` | Helper UI mort. |
| `getPostesCritiques` | `src/js/modules/admin/index.js` | Helper UI mort. |
| `getTauxCouleur` | `src/js/modules/admin/index.js` | Helper UI mort. |
| `isReferentInscritPeriode` | `src/js/modules/admin/index.js` | Helper UI mort. |
| `loadBenevoles` | `src/js/modules/admin/index.js` | Wrapper redondant — tous les appelants utilisent `loadBenevolesAndStats()` directement. |
| `resetDay` | `src/js/admin-timeline.js` | Action UI jamais bindée. |
| `savingConfig` | `src/js/modules/admin/index.js` | Propriété `false` jamais lue ni écrite ailleurs. |
| `toggleView` | `src/js/modules/user/planning.js` | Action UI jamais bindée. |
| `toggleWizardProfile` | `src/js/modules/user/wizard.js` | Action wizard jamais bindée. |
| `updatePosteReferent` | `src/js/modules/admin/index.js` | Action admin jamais bindée. |
| `validateStep1` | `src/js/modules/user/wizard.js` | Validation wizard jamais appelée. |
| `viewPosteInscrits` | `src/js/modules/admin/index.js` | Action admin jamais bindée. |

> ⚠️ La suppression doit être faite **avec lecture du corps** de chaque méthode : si elle référence d'autres méthodes/propriétés exclusivement utilisées par elle, celles-ci pourront aussi devenir mortes (effet cascade — relancer le script après).

## Partials HTML orphelins (audit B1 — script `scripts/audit-orphan-partials.js`)

> Détection : pour chaque fichier `src/partials/**/*.html`, parsing de toutes les directives `include('...')` du projet (HTML racine + partials) avec résolution des chemins absolus (`/src/partials/...`) **et relatifs** (`../../components/...`). Voir rapport brut `audit/23_orphan_partials.txt`.

### À supprimer

| Partial | Notes |
|---|---|
| `src/partials/sections/admin/tab-rapport-ia.html` | Tab "Rapport IA" — confirme la pré-validation 4.2.1 (feature OpenRouter abandonnée). Inclut `chart.html` et `day-picker.html` mais ceux-ci restent vivants car aussi inclus par `besoins.html`. |

### Effet cascade vérifié (aucun nouvel orphelin après suppression)

| Partial inclus uniquement par le partial supprimé ? | Statut |
|---|---|
| `chart.html` | Non — aussi inclus par `besoins.html` → survivra. |
| `day-picker.html` | Non — aussi inclus par `besoins.html` → survivra. |

## Synthèse — actions Phase 4.2.2

1. `npm uninstall html5-qrcode`
2. Mettre à jour `CLAUDE.md` et `README.md` pour retirer la mention `html5-qrcode` (Phase 7).
3. Décider du sort de `check-role.js` :
   - Si supprimé → `npm uninstall dotenv` également.
   - Sinon → le déplacer dans `scripts/` et documenter son usage.
4. `npm uninstall depcheck` (recommandé : on relancera avec `npx depcheck` si besoin).
