# 18 — Storage policies

**Date :** 2026-05-27
**Phase plan :** 3.6 Storage policies (si applicable)
**Verdict :** **N/A — Aucun bucket Supabase Storage utilisé par le projet.**

---

## 1. Recherche d'usages côté code

```bash
grep -rni "supabase\.storage\|\.from\(.*bucket" src/
```

Résultat : **aucun match** lié à Storage. Les seules occurrences `storage` dans `src/` concernent `localStorage` / `sessionStorage` (mécanismes navigateur sans rapport avec Supabase Storage).

Fichiers touchés (faux positifs) :
- `src/js/modules/store.js` — usage `localStorage` (cleanup session)
- `src/js/modules/user/wizard.js` — usage `sessionStorage` (mémorisation dismiss wizard)

## 2. Configuration locale (`supabase/config.toml`)

Le bloc `[storage]` est activé (`enabled = true`, `file_size_limit = "50MiB"`) mais **aucun bucket** n'est déclaré (tous les `[storage.buckets.*]` sont commentés). Les sections analytics/vector sont désactivées (`enabled = false`).

## 3. Instance LOCALE (Supabase Docker)

```sql
SELECT id, name, public, created_at FROM storage.buckets;
-- (0 rows)
```

## 4. Instance PROD

```bash
curl -H "apikey: $VITE_SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
     "$VITE_SUPABASE_URL/storage/v1/bucket"
# HTTP 200
# []
```

Aucun bucket n'existe sur l'instance de production.

## 5. Conséquence pour les tâches du plan

| Tâche                                              | Statut | Justification                                |
| -------------------------------------------------- | ------ | -------------------------------------------- |
| Lister les buckets Storage utilisés                | N/A    | Aucun bucket défini ni utilisé.              |
| Vérifier les policies INSERT/SELECT/UPDATE/DELETE  | N/A    | Aucun bucket → aucune policy à auditer.      |
| Tester les policies Storage avec un rôle non autorisé | N/A | Aucun bucket → aucun objet à tester.         |

## 6. Recommandation pour le futur

Si un bucket est ajouté plus tard (ex. upload de justificatifs juges, photos d'équipement) :
1. Documenter le bucket dans ce fichier (nom, public/privé, taille max, MIME types autorisés)
2. Définir les 4 policies (INSERT / SELECT / UPDATE / DELETE) en s'appuyant sur la helper `is_admin()` (cf. `00000000000000_init.sql`)
3. Rejouer le scénario de test du §3 avec un compte non autorisé pour valider le `403`
4. Décocher les cases de 3.6 dans `plan_refactoring.md` et les requalifier en `[x]` avec preuves.
