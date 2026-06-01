# Audit 22 — Spaghetti DOM (`x-data` inline > 3 lignes)

**Date** : 2026-05-28
**Phase plan** : 5.2 (Extraction de la logique Alpine)
**Cible** : recenser tout `x-data="{ ... }"` inline contenant plus de 3 lignes de logique métier afin de l'extraire vers `src/js/components/<nom>.js`.

## Méthode

Grep ripgrep sur tous les `*.html` (racine + `src/partials/`), incluant un balayage multiline `x-data="\{[^"]*$` pour détecter les blocs s'étendant sur plusieurs lignes. Volume = nombre de lignes occupées par l'attribut `x-data`.

## Résultats

### 1. Composants déjà extraits (named components)

Ces `x-data` invoquent une fonction définie dans un fichier `.js` séparé. **Aucune action requise** — déjà conformes à la cible 5.2.

| Fichier | Ligne | Composant invoqué | Définition JS |
|---|---|---|---|
| `admin-connexions.html` | 7 | `adminConnexionsApp()` | `src/js/admin-connexions.js` |
| `admin.html` | 6 | `adminApp()` | `src/js/admin.js` |
| `besoins.html` | 29 | `adminTimelineApp()` | `src/js/admin-timeline.js` |
| `debit.html` | 18 | `debitApp` | `src/js/debit.js` |
| `index.html` | 5 | `app()` | `src/js/main.js` |
| `scanner-tshirt.html` | 53 | `tshirtScanner` | `src/js/scanner-tshirt.js` |

### 2. `x-data` inline (objets littéraux)

| Fichier | Ligne | Contenu | Lignes | Verdict |
|---|---|---|---|---|
| `src/partials/wizard.html` | 260 | `x-data="{ openSub: subgroup.expanded }"` | 1 | ≤ 3 → OK |
| `src/partials/sections/index/planning-list.html` | 96 | `x-data="{ open: false }"` | 1 | ≤ 3 → OK |
| `src/partials/sections/index/planning-list.html` | 206 | `x-data="{ open: true }"` | 1 | ≤ 3 → OK |
| `src/partials/sections/index/planning-list.html` | 242 | `x-data="{ openSub: subgroup.expanded }"` | 1 | ≤ 3 → OK |
| `src/partials/sections/index/planning-calendar.html` | 54 | `x-data="{ isHovered: false }"` | 1 | ≤ 3 → OK |

### 3. `x-data` multi-lignes

Recherche regex multiline `x-data="\{[^"]*$` (attribut ouvert ne se fermant pas sur la même ligne) :

```
No matches found
```

Aucun `x-data` inline ne s'étend sur plusieurs lignes.

## Synthèse

| Catégorie | Nombre | À extraire |
|---|---|---|
| Composants nommés (déjà externalisés) | 6 | 0 |
| `x-data` inline (≤ 3 lignes) | 5 | 0 |
| `x-data` inline (> 3 lignes) | **0** | **0** |

**Conclusion** : la base de code respecte déjà la cible 5.2. Les 5 occurrences inline restantes sont de la pure UI locale (toggle d'ouverture/survol) que la convention projet autorise (≤ 3 lignes). Les tâches 5.2.2 et 5.2.3 sont **sans objet** sur l'inventaire actuel — à confirmer par le mainteneur avant cochage.
