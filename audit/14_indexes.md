# Audit 14 — Index

> Tâche Phase 1.7 du `plan_refactoring.md`.
> Source : instance Supabase **locale** (`127.0.0.1:54322`), import du dump prod du 2026-05-25.
> Croisement entre `audit/03_constraints.csv` (FK) et `audit/04_indexes.csv` (index existants).

---

## 1.7.1 — Foreign Keys sans index couvrant

> Méthode : pour chaque FK, on considère qu'elle est « couverte » si la colonne référencée est la **première colonne** d'un index (PK, UNIQUE ou index simple). Un index composite ne couvre une FK que si la colonne FK est en tête (limitation B-tree PostgreSQL).

### Synthèse

| # | Table.colonne FK | Cible | Index couvrant ? | Index disponible (le cas échéant) | Statut |
|---|---|---|---|---|---|
| 1 | `benevole_cagnotte_periodes.benevole_id` | `benevoles.id` | ✅ | `benevole_cagnotte_periodes_pkey` (PK `(benevole_id, periode_id)` — 1ʳᵉ col) | OK |
| 2 | **`benevole_cagnotte_periodes.periode_id`** | **`periodes.id`** | **❌** | **PK existe mais `periode_id` est en 2ᵉ position → non utilisable** | **MANQUANT** |
| 3 | `benevole_repas.benevole_id` | `benevoles.id` | ✅ | `benevole_repas_pkey` (PK `(benevole_id, repas_id)` — 1ʳᵉ col) | OK |
| 4 | **`benevole_repas.repas_id`** | **`repas.id`** | **❌** | **PK existe mais `repas_id` est en 2ᵉ position → non utilisable** | **MANQUANT** |
| 5 | `benevoles.user_id` | `auth.users.id` | ✅ | `idx_benevoles_user_id` | OK |
| 6 | `cagnotte_transactions.auteur_id` | `auth.users.id` | ✅ | `idx_cagnotte_transactions_auteur_id` | OK |
| 7 | `cagnotte_transactions.benevole_id` | `benevoles.id` | ✅ | `idx_cagnotte_benevole` | OK |
| 8 | `cagnotte_transactions.user_id` *(FK manquante — cf. audit 11)* | `auth.users.id` | ✅ | `idx_cagnotte_user` (préexistant, prêt à supporter la future FK) | OK (FK à créer en Phase 2.3) |
| 9 | `config.updated_by` | `auth.users.id` | ✅ | `idx_config_updated_by` | OK |
| 10 | `inscriptions.benevole_id` | `benevoles.id` | ✅ | `idx_inscriptions_benevole` (+ UNIQUE `(poste_id, benevole_id)`) | OK |
| 11 | `inscriptions.poste_id` | `postes.id` | ✅ | `idx_inscriptions_poste` (+ UNIQUE `(poste_id, benevole_id)` — 1ʳᵉ col) | OK |
| 12 | `orphan_relances.auth_user_id` | `auth.users.id` | ✅ | `orphan_relances_pkey` (PK `(auth_user_id)`) | OK |
| 13 | **`postes.periode_id`** | **`periodes.id`** | **❌** | **Aucun index sur cette colonne** | **MANQUANT** |
| 14 | **`postes.referent_id`** | **`benevoles.id`** | **❌** | **Aucun index sur cette colonne** | **MANQUANT** |
| 15 | **`postes.type_poste_id`** | **`type_postes.id`** | **❌** | **Aucun index sur cette colonne** | **MANQUANT** |
| 16 | `type_postes.date_ref` | `jours.date_ref` | ✅ | `type_postes_new_date_ref_titre_key` (UNIQUE `(date_ref, titre)` — 1ʳᵉ col) | OK |

### FK sans index — détail

#### #2 `benevole_cagnotte_periodes.periode_id` → `periodes.id`
- **Impact** : suppression / mise à jour d'une `periode` déclenche un scan complet de `benevole_cagnotte_periodes` pour vérifier la contrainte CASCADE. Idem pour toute jointure `periodes → benevole_cagnotte_periodes` (cas du récap cagnotte par période).
- **Recommandation Phase 2.5** : `CREATE INDEX idx_bcp_periode_id ON public.benevole_cagnotte_periodes (periode_id);`

#### #4 `benevole_repas.repas_id` → `repas.id`
- **Impact** : suppression d'un `repas` scanne `benevole_repas` intégralement (CASCADE). Jointures du type « combien de bénévoles ont coché ce repas » lentes à l'échelle.
- **Recommandation Phase 2.5** : `CREATE INDEX idx_benevole_repas_repas_id ON public.benevole_repas (repas_id);`

#### #13 `postes.periode_id` → `periodes.id`
- **Impact** : page de planning groupé par période + suppression d'une période (SET NULL) scannent `postes` complet.
- **Recommandation Phase 2.5** : `CREATE INDEX idx_postes_periode_id ON public.postes (periode_id);`
- **Note** : à distinguer de l'index existant `idx_postes_periode` qui porte sur `(periode_debut, periode_fin)` — couverture d'une plage horaire, pas de la FK.

#### #14 `postes.referent_id` → `benevoles.id`
- **Impact** : suppression d'un bénévole (SET NULL) scanne `postes` complet. Requêtes côté référent (« quels postes je suis-je référent ? ») non indexées.
- **Recommandation Phase 2.5** : `CREATE INDEX idx_postes_referent_id ON public.postes (referent_id);`

#### #15 `postes.type_poste_id` → `type_postes.id`
- **Impact** : suppression d'un `type_poste` (CASCADE confirmé par commit `239b3db`) scanne `postes` intégralement. Toute jointure `type_postes → postes` (affichage du planning par type) sans index.
- **Recommandation Phase 2.5** : `CREATE INDEX idx_postes_type_poste_id ON public.postes (type_poste_id);`

### Synthèse 1.7.1

- **5 FK sur 16 sans index couvrant** (31 %).
- 3 sont sur la table `postes` (la plus jointée du domaine planning).
- 2 sont des FK secondaires de tables d'association à PK composite — cas classique PostgreSQL où la PK ne couvre que la première colonne.
- **0 risque immédiat de corruption**, mais impact perf certain dès que les tables grossissent ou qu'une suppression cascade est déclenchée.
- À traiter en **Phase 2.5** (« Index de performance »).

---

## 1.7.2 — Colonnes filtrées sans index

> Méthode : `grep` des appels `ApiService.fetch / update / updateMany / delete` dans `src/` + appels directs dans `supabase/functions/*`. Toutes les requêtes Supabase de l'application passent par `ApiService` (`grep "supabase.from(" src/` → 0 résultat hors `api.js`). Pour chaque clé de filtre `eq`, `in`, `order`, ou de match `update`/`delete`, on note la (table, colonne) et on croise avec `audit/04_indexes.csv`.

### Inventaire des colonnes utilisées en filtre / order par le front

| Table | Colonne | Opérations relevées | Index couvrant ? |
|---|---|---|---|
| `benevoles` | `user_id` | `eq` (≥ 7 endroits dont 4 Edge Functions) | ✅ `idx_benevoles_user_id` |
| `benevoles` | `id` | `update`/`delete` match | ✅ PK |
| `benevoles` | `role` | filtre via vue `admin_benevoles` + côté UI | ✅ `idx_benevoles_role` |
| `benevoles` | **`email`** | `order` (admin chargement bénévoles) | ❌ |
| `benevoles` | **`created_at`** | `order` (profiles user) | ❌ |
| `inscriptions` | `benevole_id` | `eq`, `in` | ✅ `idx_inscriptions_benevole` |
| `inscriptions` | `poste_id` | `eq`, `in` (incl. Edge `send-rappel-all`, `send-planning`) | ✅ `idx_inscriptions_poste` (+ UNIQUE composite) |
| `inscriptions` | `id` | `delete` match | ✅ PK |
| `postes` | `id` | `update`/`delete` match | ✅ PK |
| `postes` | `referent_id` | `updateMany` match | ❌ *(déjà listé en 1.7.1)* |
| `postes` | `periode_id` | `updateMany` match | ❌ *(déjà listé en 1.7.1)* |
| `postes` | `periode_debut` | `order` (via vue `public_planning`) | ✅ `idx_postes_periode` (1ʳᵉ col) |
| `periodes` | `ordre` | `order` (admin) | ✅ `periodes_ordre_key` (UNIQUE) |
| `periodes` | `id` | `delete` match | ✅ PK |
| `config` | `key` | `eq`, `in` | ✅ PK |
| `repas` | `id` | `update`/`delete` match | ✅ PK |
| `repas` | **`created_at`** | `order` (admin + store) | ❌ |
| `programme` | `id` | `delete` match | ✅ PK |
| `programme` | **`date_ref`** | `delete` match (suppression jour) | ❌ |
| `programme` | **`heure`** | `order` (admin + timeline) | ❌ |
| `jours` | `date_ref` | `order`, `delete` match | ✅ PK |
| `benevole_repas` | `benevole_id` | `delete` match | ✅ PK (1ʳᵉ col) |
| `benevole_repas` | `repas_id` | `delete` match (combiné) | ❌ *(déjà listé en 1.7.1)* |
| `benevole_cagnotte_periodes` | `benevole_id` | `delete` match | ✅ PK (1ʳᵉ col) |
| `type_postes` | `(date_ref, titre)` | `delete` match composite | ✅ UNIQUE composite |
| `cagnotte_transactions` | — | aucun filtre (chargé en `select *`) | n/a |

### Colonnes filtrées sans index — nouvelles entrées

| # | Table.colonne | Opération | Volumétrie | Impact estimé | Recommandation Phase 2.5 |
|---|---|---|---|---|---|
| 1 | `benevoles.email` | `ORDER BY email` (admin, ~140 lignes) | faible aujourd'hui, croissante | tri en mémoire acceptable, mais l'admin Phase 6 testera des listes > 500 | `CREATE INDEX idx_benevoles_email ON public.benevoles (email);` *(à coupler avec `UNIQUE` éventuel en Phase 2.3 si l'audit 13 le recommande)* |
| 2 | `benevoles.created_at` | `ORDER BY created_at` (chargement profils utilisateur) | très faible (familles 1-5 lignes) | négligeable | **NE PAS INDEXER** : ordre auxiliaire sur petit volume par `user_id` déjà indexé. Documenter le choix. |
| 3 | `repas.created_at` | `ORDER BY created_at` (admin, store) | très faible (~10 lignes) | négligeable | **NE PAS INDEXER** : tri en mémoire moins coûteux qu'un parcours d'index sur 10 lignes. |
| 4 | `programme.date_ref` | `DELETE WHERE date_ref = ?` (suppression d'un jour de compétition) | ~50 lignes | parcours séquentiel à chaque suppression | `CREATE INDEX idx_programme_date_ref ON public.programme (date_ref);` *(à valider : envisager un FK `programme.date_ref → jours.date_ref` en Phase 2.3, ce qui rend l'index encore plus pertinent)* |
| 5 | `programme.heure` | `ORDER BY heure` (admin + timeline) | ~50 lignes | négligeable | **NE PAS INDEXER** : volumétrie trop faible. |

### Synthèse 1.7.2

- **2 nouvelles colonnes à indexer** (en plus des 5 FK manquantes de 1.7.1) :
  - `benevoles.email` — tri admin
  - `programme.date_ref` — suppression cascade jour
- **3 colonnes documentées comme volontairement non indexées** (volumétrie trop faible, l'overhead d'écriture de l'index dépasserait le gain en lecture).
- À traiter en **Phase 2.5**.

---

## 1.7.3 — Index redondants

> Méthode : un index `(a)` est rendu redondant par un index `(a, b)` car ce dernier supporte toute requête filtrée sur `a`. PostgreSQL préfère le plus petit, mais conserver les deux double les écritures et la maintenance.

### Analyse

Sur les 24 index de `public.*` :

| Index | Couvre | Plus grand index couvrant la même colonne en 1ʳᵉ position | Statut |
|---|---|---|---|
| `idx_inscriptions_poste` | `(poste_id)` (32 kB) | `inscriptions_poste_id_benevole_id_key` UNIQUE `(poste_id, benevole_id)` (40 kB) | **REDONDANT** |
| `idx_inscriptions_benevole` | `(benevole_id)` (32 kB) | aucun (l'index UNIQUE a `poste_id` en tête) | OK |
| `idx_benevoles_user_id` | `(user_id)` | aucun | OK |
| `idx_benevoles_role` | `(role)` | aucun | OK |
| `idx_cagnotte_benevole` | `(benevole_id)` | aucun | OK |
| `idx_cagnotte_user` | `(user_id)` | aucun | OK |
| `idx_cagnotte_transactions_auteur_id` | `(auteur_id)` | aucun | OK |
| `idx_config_updated_by` | `(updated_by)` | aucun | OK |
| `idx_postes_periode` | `(periode_debut, periode_fin)` | aucun | OK |

### Détail — `idx_inscriptions_poste`

- **Définition** : `CREATE INDEX idx_inscriptions_poste ON public.inscriptions USING btree (poste_id);`
- **Index théoriquement couvrant** : `inscriptions_poste_id_benevole_id_key` (UNIQUE composite `(poste_id, benevole_id)`).
- **Recommandation initiale (théorique, fausse)** : DROP `idx_inscriptions_poste`.
- **🛑 Recommandation révisée après mesure prod (1.7.4 du 2026-05-26)** : **CONSERVER `idx_inscriptions_poste`**.

#### Justification de la révision

Les compteurs `pg_stat_user_indexes` en prod montrent :

| Index | `idx_scan` prod |
|---|---|
| `idx_inscriptions_poste` (le « redondant ») | **652 528** |
| `inscriptions_poste_id_benevole_id_key` (UNIQUE composite) | 15 063 |

PostgreSQL préfère **largement** le petit index `(poste_id)` au composite `(poste_id, benevole_id)` pour les requêtes filtrant sur `poste_id` seul — comportement attendu en théorie B-tree (moins de pages, hauteur inférieure, cache hit ratio meilleur). Supprimer `idx_inscriptions_poste` forcerait PostgreSQL à se rabattre sur le composite, plus volumineux (40 kB vs 16 kB), avec dégradation directe des chemins de requête les plus chauds :
- Admin (chargement par poste : `eq: poste_id`).
- Edge Functions `send-rappel-all`, `send-planning` (`in: poste_id`).
- Vue `public_planning` (agrégation par poste).

#### Leçon

Sur les redondances d'index, **la mesure d'usage prod prime sur l'analyse théorique**. Un index « doublonné » qui sert massivement n'est pas un doublon : c'est un cas où PostgreSQL a choisi d'utiliser le plus efficace des deux.

### Synthèse 1.7.3

- **Recommandation initiale annulée** suite à la mesure prod 1.7.4.
- **0 index redondant à supprimer** au titre de 1.7.3.
- Pas d'action requise en Phase 2.2 pour cette sous-tâche.

---

## 1.7.4 — Index inutilisés (`pg_stat_user_indexes`)

> ⚠️ **Limite méthodologique majeure** : `pg_stat_user_indexes` n'est significatif que sur une base ayant **subi du trafic applicatif réel**. L'instance Supabase **locale** vient d'être importée à partir du dump prod du 2026-05-25 ; les seuls accès indexés à date sont les requêtes d'audit lancées par cette phase, ce qui rend les compteurs sans valeur prédictive.
>
> **Conséquence** : la liste finale des index à supprimer **ne peut être arrêtée qu'à partir d'une requête exécutée sur la prod en lecture seule** (dashboard Supabase, SQL editor). Section 1.7.4 livrée en deux temps :
> - **Partie A** : snapshot local (référence méthodologique, **NE PAS utiliser pour décisions**).
> - **Partie B** : SQL à exécuter sur prod + grille de décision.

### Partie A — Snapshot local (référence)

Exécuté le 2026-05-26 sur `127.0.0.1:54322` après ~14 h d'instance et l'enchaînement des audits 1.1 → 1.7.

```sql
SELECT schemaname, relname AS table_name, indexrelname AS index_name,
       idx_scan, idx_tup_read, idx_tup_fetch,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan, relname, indexrelname;
```

Résultats agrégés :

- **18 index sur 28 affichent `idx_scan = 0`** → bruit (aucun trafic).
- **10 index ont été touchés** (PK des tables jointées par les audits, index sur `user_id`, `benevole_id`, etc.).
- Aucun enseignement opérationnel — **données ignorées**.

### Partie B — Requête à exécuter sur la production (lecture seule)

À lancer depuis le **dashboard Supabase prod → SQL Editor** (compte mainteneur, droits `read-only` suffisants), idéalement après une période de trafic représentatif (≥ 7 jours après le dernier `pg_stat_reset()`).

```sql
-- Index inutilisés candidats à la suppression
SELECT
    s.schemaname,
    s.relname              AS table_name,
    s.indexrelname         AS index_name,
    s.idx_scan,
    pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
    (SELECT obj_description(s.indexrelid, 'pg_class')) AS comment,
    ix.indisunique         AS is_unique,
    ix.indisprimary        AS is_primary
FROM   pg_stat_user_indexes s
JOIN   pg_index ix ON ix.indexrelid = s.indexrelid
WHERE  s.schemaname = 'public'
  AND  s.idx_scan = 0
  AND  ix.indisprimary = false          -- ne jamais supprimer une PK
  AND  ix.indisunique  = false          -- ne pas supprimer une contrainte UNIQUE sans analyse séparée
ORDER  BY pg_relation_size(s.indexrelid) DESC;

-- Bonus : âge des compteurs (depuis quand le tracking est en cours)
SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();
```

### Grille de décision (à appliquer une fois la requête lancée sur prod)

Pour chaque ligne retournée par la requête :

| Cas | Décision |
|---|---|
| `idx_scan = 0` + `stats_reset` ≥ 7 jours + index secondaire (non PK / non UNIQUE) | **DROP** candidat. À ajouter à la migration `_drop_unused_indexes.sql` (Phase 2.2). |
| `idx_scan = 0` + `stats_reset < 7 jours` | **CONSERVER** temporairement, relancer dans ≥ 7 jours. |
| `idx_scan = 0` mais index sur une FK | **CONSERVER** — l'index sert au runtime checker de la FK même sans hit applicatif (cf. 1.7.1). |
| `idx_scan = 0` mais index UNIQUE (contrainte fonctionnelle) | **CONSERVER** — la contrainte est nécessaire à l'intégrité. |
| `idx_scan > 0` | **CONSERVER**. |

### Résultat prod du 2026-05-26

Requête exécutée par le mainteneur sur le dashboard Supabase prod (SQL Editor, lecture seule) le **2026-05-26**. Snapshot complet des 28 index publics retourné.

> Note : la section `STATS_AGE` n'a pas été fournie. L'âge des compteurs ne peut donc pas être vérifié formellement. **Indicateur indirect** : `benevoles_pkey` affiche **3 268 637 scans** et `idx_inscriptions_poste` **652 528 scans** — la fenêtre de mesure est manifestement suffisante (plusieurs semaines de trafic réel). La grille de décision « ≥ 7 jours » est considérée satisfaite.

#### Index avec `idx_scan = 0`

| Index | Type | Décision selon grille | Justification |
|---|---|---|---|
| `config.idx_config_updated_by` | secondaire sur FK `config.updated_by → auth.users` | **CONSERVER** | Index sur FK — sert au runtime checker de la contrainte (suppression d'un user déclenche un check). Table à 7 lignes : la suppression de l'index ne ferait gagner que ~16 kB, mais ralentirait toute future suppression d'un compte Auth. Pas de bénéfice opérationnel à le drop. |
| `mentions.mentions_url_key` | UNIQUE sur `mentions.url` | **CONSERVER** | Contrainte UNIQUE = intégrité fonctionnelle. À ne jamais supprimer sans réviser la contrainte sous-jacente. |

#### Index les plus chauds (référence pour la suite)

| Index | `idx_scan` prod | Commentaire |
|---|---|---|
| `benevoles_pkey` | 3 268 637 | PK la plus jointée — chemin standard `auth ⋈ benevoles`. |
| `postes_pkey` | 729 474 | Jointure `inscriptions ⋈ postes`. |
| **`idx_benevoles_user_id`** | **652 888** | Validation rétrospective du choix d'indexer `user_id`. |
| **`idx_inscriptions_poste`** | **652 528** | **Annule la recommandation théorique de DROP en 1.7.3** (cf. section 1.7.3 révisée). |
| `idx_inscriptions_benevole` | 36 295 | Trafic moyen, parfaitement justifié. |
| `benevole_repas_pkey` | 31 290 | Surprise : volume élevé sur table d'association. |
| `inscriptions_poste_id_benevole_id_key` | 15 063 | UNIQUE composite ; ratio 1/43 par rapport à `idx_inscriptions_poste` → confirme que Postgres préfère l'index simple. |

### Synthèse 1.7.4

- **0 index à supprimer** au titre des index inutilisés.
- 2 index à `idx_scan = 0` identifiés, tous deux **conservés à juste titre** (1 sur FK, 1 UNIQUE).
- **Effet de bord** : la mesure annule la recommandation 1.7.3 (cf. section 1.7.3 révisée).
- **DoD complète** ✅ (snapshot prod intégré).

---

## Synthèse globale Phase 1.7

| Sous-tâche | Anomalies | Migrations cibles |
|---|---|---|
| 1.7.1 — FK sans index | **5** (3 sur `postes`, 2 sur tables d'association) | Phase 2.5 (`CREATE INDEX`) |
| 1.7.2 — Colonnes filtrées sans index | **2** (`benevoles.email`, `programme.date_ref`) | Phase 2.5 (`CREATE INDEX`) |
| 1.7.3 — Index redondants | **0** *(recommandation initiale annulée par la mesure prod 1.7.4)* | — |
| 1.7.4 — Index inutilisés | **0** (2 index à `idx_scan = 0` mais tous deux conservés à juste titre : 1 sur FK, 1 UNIQUE) | — |

**Total final** : **7 index à créer** en Phase 2.5, **0 index à supprimer**, audit clôturé.

### Enseignement transverse

L'analyse théorique en 1.7.3 (`idx_inscriptions_poste` redondant par couverture composite) était techniquement correcte mais opérationnellement erronée. La mesure prod (1.7.4) a montré que PostgreSQL préfère systématiquement l'index simple au composite quand la requête ne filtre que sur la première colonne. **À retenir pour les phases ultérieures** : toute décision de DROP d'index doit être validée par `pg_stat_user_indexes` en prod avant exécution.
