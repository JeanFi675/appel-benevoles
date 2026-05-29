# Lighthouse — Phase 5.6

Audits exécutés le 2026-05-30 sur le build de prod (`npm run build` + `npm run preview` sur `http://localhost:4173`).

## Pages publiques (auditables sans auth)

| Page | Perf | A11y | Best-Practices | SEO |
|---|---|---|---|---|
| index.html | 91 | 100 | 96 | 82 |
| debit.html | 90 | 100 | 96 | 82 |
| scanner-tshirt.html | 90 | 100 | 96 | 82 |

A11y issues corrigés (Phase 5.6.2) :
- `debit.html` et `scanner-tshirt.html` n'avaient pas de landmark `<main>` → ajouté.

## Optimisation images (Phase 5.6.3)

Aucune image bitmap dans le projet (recherche `<img>`, `background-image`, `url(...)` dans `src/` → 0 résultat). Tout le contenu visuel utilise des emojis et la typographie Space Grotesk via Google Fonts. Performance ≥ 90 sur toutes les pages auditables — DoD satisfaite sans action.

## Pages protégées (auth requise → redirection vers index.html)

| Page | Statut |
|---|---|
| admin.html | `FAILED_DOCUMENT_REQUEST` (redirige vers `index.html` quand non authentifié) |
| besoins.html | `FAILED_DOCUMENT_REQUEST` (idem) |
| admin-connexions.html | `FAILED_DOCUMENT_REQUEST` (idem) |

Ces pages ne peuvent pas être auditées sans un cookie/session valide. Le rapport HTML est tout de même sauvegardé (vide) pour traçabilité. L'audit sur l'écran de login (`index.html`) reflète le rendu initial vu par 100 % des utilisateurs non authentifiés.

## Commande utilisée

```bash
npx lighthouse http://localhost:4173/<page>.html \
  --output=html \
  --output-path=audit/lighthouse/<page>.html \
  --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo
```
