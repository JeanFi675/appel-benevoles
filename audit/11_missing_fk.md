# Audit 11 — Colonnes `*_id` sans FOREIGN KEY

> Tâche Phase 1.4.1 du `plan_refactoring.md`.
> Source : instance Supabase **locale** (`127.0.0.1:54322`), import du dump prod du 2026-05-25.
> Méthode : `pg_constraint` (et non `information_schema.referential_constraints`) car les FK cross-schema (`public.* → auth.users`) ne sont pas exposées par `information_schema.constraint_column_usage`.

## Périmètre

- **17** colonnes `*_id` détectées dans le schéma `public` au total.
- **2** appartiennent à des **vues** (hors périmètre FK) :
  - `admin_benevoles.user_id`
  - `public_planning.poste_id`, `public_planning.referent_id`
- **15** colonnes `*_id` dans des **tables de base** sont analysées ci-dessous.

## Tableau récapitulatif

| # | Table.colonne | Type | Nullable | FK déclarée ? | Cible | ON DELETE | Statut |
|---|---|---|---|---|---|---|---|
| 1 | `benevole_cagnotte_periodes.benevole_id` | uuid | NO | ✅ | `public.benevoles(id)` | CASCADE | OK |
| 2 | `benevole_cagnotte_periodes.periode_id` | uuid | NO | ✅ | `public.periodes(id)` | CASCADE | OK |
| 3 | `benevole_repas.benevole_id` | uuid | NO | ✅ | `public.benevoles(id)` | CASCADE | OK |
| 4 | `benevole_repas.repas_id` | uuid | NO | ✅ | `public.repas(id)` | CASCADE | OK |
| 5 | `benevoles.user_id` | uuid | NO | ✅ | `auth.users(id)` | CASCADE | OK |
| 6 | `cagnotte_transactions.auteur_id` | uuid | YES | ✅ | `auth.users(id)` | SET NULL | OK |
| 7 | `cagnotte_transactions.benevole_id` | uuid | YES | ✅ | `public.benevoles(id)` | SET NULL | OK |
| 8 | **`cagnotte_transactions.user_id`** | **uuid** | **NO** | **❌** | **`auth.users(id)` (probable)** | **—** | **MANQUANTE** |
| 9 | `inscriptions.benevole_id` | uuid | NO | ✅ | `public.benevoles(id)` | CASCADE | OK |
| 10 | `inscriptions.poste_id` | uuid | NO | ✅ | `public.postes(id)` | CASCADE | OK |
| 11 | `orphan_relances.auth_user_id` | uuid | NO | ✅ | `auth.users(id)` | CASCADE | OK |
| 12 | `postes.periode_id` | uuid | YES | ✅ | `public.periodes(id)` | SET NULL | OK |
| 13 | `postes.referent_id` | uuid | YES | ✅ | `public.benevoles(id)` | SET NULL | OK |
| 14 | `postes.type_poste_id` | uuid | NO | ✅ | `public.type_postes(id)` | CASCADE | OK |

## FK manquantes — détail

### 8. `cagnotte_transactions.user_id` → `auth.users(id)` ❌

- **Type** : `uuid`, `NOT NULL`.
- **Cible probable** : `auth.users(id)`. Justification croisée :
  - Convention du projet : `user_id` désigne systématiquement le compte Supabase Auth (cf. `benevoles.user_id` qui pointe vers `auth.users(id)`).
  - Code historique : `supabase/migrations_archive_pre_refactor/011_public_debit.sql:71` et `012_smart_debit.sql:73` font un `INSERT INTO cagnotte_transactions (user_id, benevole_id, ...)` où `user_id` reçoit le `auth.uid()` du contexte.
  - La table contient déjà une FK séparée vers `benevoles(id)` via `benevole_id` → donc `user_id` ≠ `benevole_id`, ce qui confirme une référence vers `auth.users`.
- **Intégrité actuelle** : `0` ligne orpheline sur la base locale (vérifié par `LEFT JOIN auth.users`).
- **Recommandation pour la Phase 2** :
  - Ajouter la FK : `ALTER TABLE public.cagnotte_transactions ADD CONSTRAINT cagnotte_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`
  - Choix `ON DELETE CASCADE` cohérent avec `benevoles.user_id` (même cible, même domaine).
  - Vérifier en Phase 2 qu'aucun index n'est nécessaire (un index sur `user_id` existe-t-il déjà ? à croiser avec `audit/04_indexes.csv`).

## Synthèse

- **1 seule FK manquante** sur les 14 colonnes `*_id` des tables de base.
- Aucun risque d'intégrité immédiat (0 orphelin), mais l'absence de la contrainte autorise potentiellement des écritures inconsistantes (race condition sur suppression d'un compte Auth).
- À traiter en **Phase 2.3** (« Ajout des contraintes manquantes »).

---

# Partie 2 — Politiques `ON DELETE` des FK existantes

> Tâche Phase 1.4.2 du `plan_refactoring.md`.
> Source : même requête `pg_constraint` que la Partie 1.
> 15 FK au total dans `public.*` : **10 CASCADE** + **5 SET NULL** + **0 RESTRICT / NO ACTION**.

## Tableau d'analyse

Légende statut : ✅ OK = politique cohérente avec la sémantique métier ; ⚠️ À VALIDER = choix discutable, à confirmer avec le mainteneur ; ❌ À CORRIGER = politique probablement erronée.

| # | FK | Cible | ON DELETE | Statut | Recommandation Phase 2 | Justification |
|---|---|---|---|---|---|---|
| 1 | `benevole_cagnotte_periodes.benevole_id` | `benevoles.id` | CASCADE | ✅ | Conserver CASCADE | Table d'association ; les lignes n'ont pas de sens sans le bénévole. |
| 2 | `benevole_cagnotte_periodes.periode_id` | `periodes.id` | CASCADE | ⚠️ À VALIDER | Évaluer **RESTRICT** | La table porte un état financier (`cagnotte`). Supprimer une `periode` efface aussi l'historique cagnotte de tous les bénévoles pour cette période — perte de traçabilité financière. |
| 3 | `benevole_repas.benevole_id` | `benevoles.id` | CASCADE | ✅ | Conserver CASCADE | Pure association ; sans bénévole, la ligne est orpheline. |
| 4 | `benevole_repas.repas_id` | `repas.id` | CASCADE | ✅ | Conserver CASCADE | Pure association ; sans le repas, la ligne n'a plus de sens. |
| 5 | `benevoles.user_id` | `auth.users.id` | CASCADE | ✅ | Conserver CASCADE | Pattern standard Supabase : la fiche bénévole suit le cycle de vie du compte Auth. |
| 6 | `cagnotte_transactions.auteur_id` | `auth.users.id` | SET NULL | ✅ | Conserver SET NULL | Préserve la piste d'audit financière même si le staff ayant encaissé quitte le système. |
| 7 | `cagnotte_transactions.benevole_id` | `benevoles.id` | SET NULL | ⚠️ À VALIDER | Évaluer **RESTRICT** | Une transaction sans bénévole identifié est difficile à interpréter comptablement. RESTRICT obligerait à clôturer/transférer le solde avant suppression — plus sain. SET NULL acceptable si l'objectif est de garder l'historique des montants agrégés. |
| 8 | `config.updated_by` | `auth.users.id` | SET NULL | ✅ | Conserver SET NULL | Audit secondaire (qui a modifié la config) ; la config doit survivre à la disparition de son auteur. |
| 9 | `inscriptions.benevole_id` | `benevoles.id` | CASCADE | ✅ | Conserver CASCADE | Bénévole supprimé → ses inscriptions libèrent les créneaux. Comportement attendu. |
| 10 | `inscriptions.poste_id` | `postes.id` | CASCADE | ✅ | Conserver CASCADE | Poste supprimé → inscriptions correspondantes supprimées. Cohérent. |
| 11 | `orphan_relances.auth_user_id` | `auth.users.id` | CASCADE | ✅ | Conserver CASCADE | Journal de relances ; perd son sens si l'utilisateur ciblé n'existe plus. |
| 12 | `postes.periode_id` | `periodes.id` | SET NULL | ⚠️ À VALIDER | Évaluer **RESTRICT** | Un `poste` sans `periode` est une donnée partiellement cassée (l'UI groupe les postes par période). RESTRICT forcerait à réaffecter les postes avant la suppression. |
| 13 | `postes.referent_id` | `benevoles.id` | SET NULL | ✅ | Conserver SET NULL | Le poste doit survivre à la perte de son référent ; un nouveau référent sera nommé. |
| 14 | `postes.type_poste_id` | `type_postes.id` | CASCADE | ⚠️ À VALIDER | Conserver CASCADE *(comportement confirmé)* | Comportement confirmé récemment par le commit `239b3db fix: suppression type_postes en cascade et simplification deleteVisualDay` (avril 2026). Le mainteneur a explicitement choisi cette sémantique. À documenter clairement dans `DATABASE.md` (Phase 7.3) car c'est un cascade dangereux pour qui ne connaît pas le contexte. |
| 15 | `type_postes.date_ref` | `jours.date_ref` | CASCADE | ⚠️ À VALIDER | Conserver CASCADE *(combiné avec #14)* | Supprimer un `jour` cascade jusqu'aux `inscriptions` via la chaîne `jours → type_postes → postes → inscriptions`. Cohérent avec la logique « supprimer un jour de compétition supprime toute son organisation » — confirmé par le même commit `239b3db`. Idem : à documenter explicitement. |

## Synthèse Partie 2

- **3 FK marquées ⚠️ À VALIDER pour modification potentielle vers RESTRICT** :
  - #2 `benevole_cagnotte_periodes.periode_id` — risque financier.
  - #7 `cagnotte_transactions.benevole_id` — risque comptable.
  - #12 `postes.periode_id` — risque d'intégrité référentielle métier.
- **2 FK marquées ⚠️ À VALIDER pour documentation** :
  - #14 et #15 — cascade volontaire (confirmé par commit récent), mais à documenter explicitement.
- **10 FK ✅ OK** sans action requise.
- **0 FK ❌ à corriger d'office** : aucune politique n'est manifestement erronée.

Décisions à arrêter avec le mainteneur **avant la Phase 2.3** (« Ajout des contraintes manquantes » / modifications de FK).

---

# Partie 3 — Détection des FK orphelines

> Tâche Phase 1.4.3 du `plan_refactoring.md`.
> Méthode : `LEFT JOIN parent ON parent.id = child.fk WHERE child.fk IS NOT NULL AND parent.id IS NULL`.
> Exécuté le 2026-05-26 sur l'instance Supabase locale (dump prod du 2026-05-25, 140 bénévoles / 308 inscriptions / 58 postes).
> Périmètre : les **15 FK existantes** + la **1 FK manquante** identifiée en Partie 1, soit 16 relations testées.

## Résultats

| # | FK testée | Lignes orphelines | Statut |
|---|---|---|---|
| 1 | `benevole_cagnotte_periodes.benevole_id` → `benevoles.id` | 0 | ✅ |
| 2 | `benevole_cagnotte_periodes.periode_id` → `periodes.id` | 0 | ✅ |
| 3 | `benevole_repas.benevole_id` → `benevoles.id` | 0 | ✅ |
| 4 | `benevole_repas.repas_id` → `repas.id` | 0 | ✅ |
| 5 | `benevoles.user_id` → `auth.users.id` | 0 | ✅ |
| 6 | `cagnotte_transactions.auteur_id` → `auth.users.id` | 0 | ✅ |
| 7 | `cagnotte_transactions.benevole_id` → `benevoles.id` | 0 | ✅ |
| 8 | `cagnotte_transactions.user_id` → `auth.users.id` **(FK manquante)** | 0 | ✅ |
| 9 | `config.updated_by` → `auth.users.id` | 0 | ✅ |
| 10 | `inscriptions.benevole_id` → `benevoles.id` | 0 | ✅ |
| 11 | `inscriptions.poste_id` → `postes.id` | 0 | ✅ |
| 12 | `orphan_relances.auth_user_id` → `auth.users.id` | 0 | ✅ |
| 13 | `postes.periode_id` → `periodes.id` | 0 | ✅ |
| 14 | `postes.referent_id` → `benevoles.id` | 0 | ✅ |
| 15 | `postes.type_poste_id` → `type_postes.id` | 0 | ✅ |
| 16 | `type_postes.date_ref` → `jours.date_ref` | 0 | ✅ |

## Synthèse Partie 3

- **0 ligne orpheline sur 16 relations testées** — intégrité référentielle parfaite à la date du dump.
- Aucune action corrective requise pour la Phase 2.
- Conséquence pratique : l'ajout de la FK manquante `cagnotte_transactions.user_id → auth.users(id)` (Partie 1) pourra être appliqué **sans backfill ni nettoyage préalable**.
- Conséquence pratique : les durcissements `CASCADE → RESTRICT` envisagés en Partie 2 (FK #2, #7, #12) pourront également être appliqués sans bloquer sur des données incohérentes.

> Note méthodologique : sur les FK déjà déclarées (1 à 7, 9 à 16), le résultat `0` est attendu — PostgreSQL valide la contrainte à la création (sauf clause `NOT VALID` explicite, non présente ici). Le test garde sa valeur car il documente l'état réel post-import et confirme qu'aucun chemin détourné (insert via `service_role`, désactivation temporaire de la contrainte) n'a laissé d'incohérence.

---

## Méthodologie (reproductibilité)

```sql
-- Toutes les colonnes *_id du schéma public
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND column_name LIKE '%\_id' ESCAPE '\';

-- Toutes les FK (y compris cross-schema vers auth.*)
SELECT n.nspname||'.'||c.relname  AS table_,
       a.attname                  AS column_,
       fn.nspname||'.'||fc.relname AS ftable_,
       fa.attname                  AS fcolumn_,
       conf.confdeltype            AS on_delete
FROM pg_constraint conf
JOIN pg_class c       ON c.oid=conf.conrelid
JOIN pg_namespace n   ON n.oid=c.relnamespace
JOIN pg_class fc      ON fc.oid=conf.confrelid
JOIN pg_namespace fn  ON fn.oid=fc.relnamespace
JOIN pg_attribute a   ON a.attrelid=c.oid  AND a.attnum=conf.conkey[1]
JOIN pg_attribute fa  ON fa.attrelid=fc.oid AND fa.attnum=conf.confkey[1]
WHERE conf.contype='f' AND n.nspname='public';

-- Détection d'orphelins pour la FK suspecte
SELECT count(*) FROM public.cagnotte_transactions c
LEFT JOIN auth.users u ON u.id=c.user_id
WHERE u.id IS NULL;
```

> Codes `confdeltype` : `a`=NO ACTION, `r`=RESTRICT, `c`=CASCADE, `n`=SET NULL, `d`=SET DEFAULT.
