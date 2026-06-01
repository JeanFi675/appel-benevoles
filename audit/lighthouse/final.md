# Lighthouse — Rapport final Phase 5.6

Date : 2026-05-30
Build : `npm run build` puis `npm run preview` (`http://localhost:4173`)
Tool : `lighthouse` 13.3.0 (Chrome headless)

## Scores synthétiques (preset Mobile, simulated 4G)

| Page | Perf | A11y | Best-Practices | SEO |
|---|---:|---:|---:|---:|
| index.html | 91 | **100** | 96 | 82 |
| debit.html | 90 | **100** | 96 | 82 |
| scanner-tshirt.html | 90 | **100** | 96 | 82 |

DoD Phase 5.6.2 (a11y ≥ 90) et 5.6.3 (perf ≥ 90) : **OK** sur toutes les pages auditables.

## Core Web Vitals

### Mobile (simulated 4G, 1.6 Mbps)

| Page | LCP | CLS | TBT (proxy INP) |
|---|---:|---:|---:|
| index.html | 2.8 s 🟠 | 0 🟢 | 0 ms 🟢 |
| debit.html | 2.9 s 🟠 | 0 🟢 | 0 ms 🟢 |
| scanner-tshirt.html | 2.9 s 🟠 | 0 🟢 | 0 ms 🟢 |

LCP en zone orange en simulation mobile 4G — dû au chargement bloquant des Google Fonts (`fonts.googleapis.com` + `fonts.gstatic.com`). La police `Space Grotesk` est l'élément LCP sur l'écran de login.

### Desktop (preset Lighthouse desktop)

| Page | LCP | CLS | TBT | Perf |
|---|---:|---:|---:|---:|
| index.html | 0.5 s 🟢 | 0.002 🟢 | 0 ms 🟢 | **100** |
| debit.html | 0.8 s 🟢 | 0.005 🟢 | 0 ms 🟢 | **99** |
| scanner-tshirt.html | 0.8 s 🟢 | 0 🟢 | 0 ms 🟢 | **99** |

Sur desktop, **tous les Core Web Vitals sont au vert**.

## Conclusion

- **CLS** et **INP (TBT proxy)** : verts sur tous les profils.
- **LCP** : vert sur desktop, orange sur mobile 4G simulé. La cause unique est le chargement Google Fonts en provenance d'un CDN tiers. C'est en dessous du seuil critique (4 s = rouge) et le score Performance global reste ≥ 90.

## Pistes d'amélioration (non incluses dans le scope de cette phase)

- Self-host `Space Grotesk` et `Inter` (woff2 servi depuis le même origin que l'app) pour gagner 1 RTT au LCP mobile.
- `debit.html` et `scanner-tshirt.html` utilisent encore Tailwind CDN script (`cdn.tailwindcss.com`) au lieu du build Vite — migration possible mais hors-scope.

## Pages protégées (non auditables sans auth)

| Page | Statut |
|---|---|
| admin.html | redirection JS vers `index.html` → `FAILED_DOCUMENT_REQUEST` |
| besoins.html | idem |
| admin-connexions.html | idem |

L'audit qualité visible par 100 % des visiteurs non-auth est représenté par `index.html` (l'écran de login).
