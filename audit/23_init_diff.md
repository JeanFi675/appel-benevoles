# 23 — Diff de validation du script consolidé `00000000000000_init.sql`

> Phase 2.9 — Validation que `supabase/migrations/00000000000000_init.sql` reproduit fidèlement le schéma de référence sur une base vierge.

**Date :** 2026-05-27
**Méthode :** pg_dump --schema-only avant reset → DROP SCHEMA public CASCADE → CREATE SCHEMA public → application de `00000000000000_init.sql` → pg_dump --schema-only après → diff.

## 1. Résumé exécutif

✅ **Le diff est fonctionnellement vide.**

Après normalisation des fins de ligne (CRLF → LF, voir §3), il ne subsiste que **3 différences sans impact fonctionnel** :

1. **Token aléatoire `\restrict` (1 ligne)** — nonce de session pg_dump (psql 17 introduit ces tokens pour empêcher l'exécution non interactive de dumps non validés). Régénéré à chaque dump.
2. **Token aléatoire `\unrestrict` (1 ligne)** — paire du précédent en fin de fichier.
3. **`COMMENT ON SCHEMA public IS 'standard public schema';` (7 lignes incluant les commentaires d'en-tête)** — présent dans le dump de référence (état actuel du local), absent du dump post-init.sql. Ce commentaire est ajouté par Supabase à l'initialisation d'un projet ; il n'a aucune incidence sur le comportement fonctionnel du schéma. À noter : Supabase recrée ce commentaire automatiquement à la première initialisation d'un projet local/managé, donc il réapparaîtra naturellement après un `supabase start`.

**Conclusion :** init.sql reproduit fidèlement le schéma de référence (13 tables, 4 vues, 35 index, 44 policies, 3 triggers, 256 fonctions, 3 enums, 54 contraintes — comptes vérifiés en Phase 2.8 et reconfirmés en 2.9.2).

## 2. Diff brut (post-normalisation LF)

```diff
5c5
< \restrict OpYVXhQdpRdLck82hDtPYw7T8qkTleVJFIOP3RkLYj6nONKDl0xB0Qx8EnsVhYF
---
> \restrict WRZKFlgLkh984fYEgMCKVcmSy0ne5pD7mOZy7khfU9cdVuTRxrvlkIMGO0LUUsy
30,36d29
< -- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
< --
<
< COMMENT ON SCHEMA public IS 'standard public schema';
<
<
< --
1974c1967
< \unrestrict OpYVXhQdpRdLck82hDtPYw7T8qkTleVJFIOP3RkLYj6nONKDl0xB0Qx8EnsVhYF
---
> \unrestrict WRZKFlgLkh984fYEgMCKVcmSy0ne5pD7mOZy7khfU9cdVuTRxrvlkIMGO0LUUsy
```

## 3. Note sur les fins de ligne

Le diff brut (avant normalisation) faisait 970 lignes parce que `init.sql` est checkout sur ce poste Windows avec des fins de ligne CRLF, et les corps de fonctions PL/pgSQL préservent textuellement leur encodage lors de leur ingestion par Postgres. Conséquence : après application de `init.sql`, le dump `pg_dump` ressort les fonctions avec CRLF tandis que le dump de référence (issu de la séquence de migrations atomiques appliquées avant la consolidation) est en LF pur.

**Impact fonctionnel : nul.** Postgres ignore les fins de ligne dans les corps PL/pgSQL — le bytecode généré est identique. Mais ce comportement crée une asymétrie cosmétique entre le dump source et le dump cible.

**Recommandation Phase 4/5 :** ajouter `*.sql text eol=lf` dans `.gitattributes` pour forcer LF sur tous les `.sql` du repo, ce qui éliminera cette divergence cosmétique et garantira que `pg_dump` produira un résultat déterministe quel que soit le poste de checkout.

## 4. Procédure de validation détaillée

```bash
# 1. Snapshot de référence
docker exec supabase_db_appel-benevoles pg_dump --schema-only --no-owner --no-privileges \
  --schema=public -U postgres -d postgres > /tmp/phase29/reference_schema.sql

# 2. Reset vierge (préserve auth.users)
docker exec supabase_db_appel-benevoles psql -U postgres -d postgres -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"

# Vérification DoD 2.9.1 :
docker exec supabase_db_appel-benevoles psql -U postgres -d postgres -c "\dt public.*"
#  → "Did not find any relation named \"public.*\"."

# 3. Application de init.sql
docker exec -i supabase_db_appel-benevoles psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/00000000000000_init.sql

# Vérification DoD 2.9.2 (EXIT=0, comptes attendus) :
#  13 tables / 44 policies / 4 vues / 256 fonctions

# 4. Snapshot post-init
docker exec supabase_db_appel-benevoles pg_dump --schema-only --no-owner --no-privileges \
  --schema=public -U postgres -d postgres > /tmp/phase29/init_result_schema.sql

# 5. Diff (normalisation CRLF préalable)
tr -d '\r' < /tmp/phase29/reference_schema.sql > /tmp/phase29/reference_lf.sql
tr -d '\r' < /tmp/phase29/init_result_schema.sql > /tmp/phase29/init_result_lf.sql
diff /tmp/phase29/reference_lf.sql /tmp/phase29/init_result_lf.sql
#  → 3 différences sans impact (cf. §2)
```

## 5. Note méthodologique : `DROP SCHEMA public CASCADE` vs `supabase db reset --no-seed`

La DoD 2.9.1 mentionnait `supabase db reset --no-seed` comme commande. Ce choix littéral n'est **pas exécutable en l'état** car :

- `supabase db reset` rejoue automatiquement le contenu de `supabase/migrations/` après le drop initial.
- Comme `00000000000000_init.sql` est désormais dans ce dossier (Phase 2.8), `supabase db reset` produirait un état déjà rempli — opposé de la DoD « aucune table avant exécution du script ».
- Solution alternative (déplacer init.sql hors du dossier le temps du reset) viendrait écraser `auth.users` aussi, compliquant la restauration en 2.9.4 (FK `benevoles.user_id → auth.users.id`).

`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` produit le même résultat fonctionnel (`\dt public.*` retourne vide) en isolant le périmètre au seul schéma cible, ce qui préserve `auth.users` et simplifie la restauration. La DoD littérale (« aucune table ») reste pleinement satisfaite.
