# `audit_db.md` — Synthèse consolidée de l'audit base de données

> **Phase 1.10** du `plan_refactoring.md`. Livrable d'audit consolidé regroupant
> toutes les anomalies remontées par les rapports `audit/01_*.csv` à `audit/17_*.md`
> ainsi que `audit/notes.md`. Classement par criticité :
> - 🔴 **CRITIQUE** — sécurité : fuites de données ou écritures non autorisées
> - 🟠 **HAUT** — intégrité : risques de corruption / incohérences référentielles / migrations cassées
> - 🟡 **MOYEN** — performance et cohérence / pattern non documenté
> - 🔵 **BAS** — cosmétique et conventions
>
> Périmètre : schéma `public` de l'instance Supabase locale (snapshot prod du
> 2026-05-25, 140 bénévoles / 308 inscriptions / 58 postes / 189 transactions
> cagnotte / 14 tables / 4 vues / 22 fonctions / 3 triggers / 28 index).
>
> Date de consolidation : 2026-05-26.

---

## Sommaire des criticités

| Criticité | Compte | Domaines couverts |
|---|---|---|
| 🔴 CRITIQUE | **2** | Sécurité RLS (anon writes / fuites SELECT nominatif) |
| 🟠 HAUT | **10** | Sécurité (RLS, search_path, FORCE RLS), intégrité (NOT NULL, FK, UNIQUE, CHECK), perf (FK sans index), migrations cassées |
| 🟡 MOYEN | **8** | Pattern famille non documenté, FK à durcir, index secondaires, conventions à harmoniser, code mort |
| 🔵 BAS | **8** | Renommages, contraintes seuils, doublons cosmétiques |
| **Total** | **28** | |

---

## 🔴 Anomalies CRITIQUE

### C01 — `mentions` : policy `USING (true)` sur `ALL` (anon writes)
- **Table** : `public.mentions`
- **Symptôme** : la policy `Allow all for anon` couvre `ALL` opérations avec
  `USING (true)`. Test T08bis confirme qu'un client `anon` peut **INSERT** une
  ligne sans aucune contrainte d'authentification. UPDATE / DELETE / SELECT
  également exposés.
- **Impact** : vandalisme, pollution de la base, exposition de toute donnée
  insérée plus tard dans cette table.
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §2 « `mentions` », §6 ligne R01,
  [`audit/17_rls_tests.md`](audit/17_rls_tests.md) test T08bis.
- **Croisement** : la table est par ailleurs marquée `UNUSED` (cf.
  [`audit/09_table_usage.md`](audit/09_table_usage.md)). La décision retenue est
  `DROP TABLE mentions CASCADE` en Phase 2.2, ce qui résout aussi C01.

### C02 — `inscriptions` : `SELECT USING (true)` (fuite nominative)
- **Table** : `public.inscriptions`
- **Symptôme** : la policy `Lecture publique des inscriptions` ouvre la lecture
  à `anon`. La table contient `benevole_id` (FK identité) et `poste_id`. Croisée
  à la vue `public_planning` (qui est anonymisée), elle **défait l'anonymisation**
  prévue : un attaquant peut joindre `inscriptions.benevole_id` à `public_planning`
  pour reconstituer le planning nominatif.
- **Tests** : T02 (anon, 309 lignes lues) et T10 (benevole lambda, 309 lignes lues).
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §2 « `inscriptions` », §6 ligne R02,
  [`audit/17_rls_tests.md`](audit/17_rls_tests.md) tests T02 et T10.
- **Action Phase 3** : révoquer la policy SELECT publique, n'autoriser la lecture
  qu'aux `own` rows + admins. La consommation publique passe exclusivement par
  la vue `public_planning`.

---

## 🟠 Anomalies HAUT

### H01 — Historique des migrations non reproductible from-scratch
- **Symptôme** : la migration archivée `006_fix_rls_policies.sql` référence une
  colonne `benevoles.user_id` que **aucune migration antérieure** n'a créée.
  La colonne existe pourtant en prod (dump confirmé) → elle a été ajoutée hors
  migration (dashboard ou commit perdu). Toute reconstruction from-scratch
  (`supabase db reset`, `supabase start` clean) échoue.
- **Conséquence** : la source de vérité du `init.sql` consolidé (Phase 2.8) doit
  être le **dump prod actuel**, pas un replay des migrations historiques.
- **Source** : [`audit/notes.md`](audit/notes.md) section « 2026-05-25 — Bug majeur :
  historique des migrations non reproductible ».

### H02 — FK manquante `cagnotte_transactions.user_id → auth.users(id)`
- **Symptôme** : colonne `user_id` (`uuid NOT NULL`) sans contrainte FK déclarée.
  Convention du projet (cf. `benevoles.user_id`) impose la cible `auth.users(id)`.
  Le code Edge Functions (`011_public_debit.sql`, `012_smart_debit.sql`) y insère
  `auth.uid()`. 0 orphelin dans le dump → ajoutable sans backfill.
- **Action Phase 2.3** : `ALTER TABLE ... ADD CONSTRAINT cagnotte_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`
- **Source** : [`audit/11_missing_fk.md`](audit/11_missing_fk.md) Partie 1 #8.

### H03 — `FORCE ROW LEVEL SECURITY` jamais appliqué (R07)
- **Symptôme** : `pg_class.relforcerowsecurity = false` sur les 14 tables `public.*`.
  Conséquence : le propriétaire (`postgres`) et tout rôle ayant l'attribut
  `BYPASSRLS` court-circuitent l'intégralité des policies.
- **Action Phase 3.1** : `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` sur les 14 tables.
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §1 « Limite à noter » + §6 ligne R07.

### H04 — `is_admin_juge()` sans `SET search_path` (CVE-2018-1058)
- **Symptôme** : la fonction `SECURITY DEFINER` `is_admin_juge` ne fixe pas son
  `search_path`. Vecteur d'élévation de privilèges classique (un attaquant peut
  hijacker une référence non qualifiée via un schéma temporaire malveillant).
  Les autres helpers (`is_admin`, `is_referent_for_benevole`, `check_referent_access`)
  fixent bien `SET search_path = public` — celle-ci est passée à travers la
  migration `20251207165000_fix_security_search_path.sql`.
- **Action Phase 3** : `CREATE OR REPLACE FUNCTION is_admin_juge() ... SET search_path = public;`
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §3 et §6 ligne R05,
  [`audit/notes.md`](audit/notes.md) section « Bugs hors-RLS détectés en Phase 1.9 » B2.

### H05 — `check_referent_access()` fonction morte (UUID hétérogène)
- **Symptôme** : la fonction compare `postes.referent_id = auth.uid()`. Or
  `postes.referent_id` pointe vers `benevoles(id)` (FK confirmée par
  `20260316083700_add_fk_postes_referent_id.sql`), tandis que `auth.uid()` retourne
  `auth.users.id` = `benevoles.user_id`. La fonction retourne donc **toujours
  false**, rendant la policy `benevoles.Referents can view volunteers` inerte.
  L'accès "référent" continue de fonctionner uniquement grâce à la policy
  doublonnée qui utilise `is_referent_for_benevole(id)`.
- **Action Phase 3.3** : supprimer la policy morte + la fonction `check_referent_access`,
  OU corriger la fonction. Décision à acter avec le mainteneur.
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §5 Bug B1 et §6 ligne R06,
  [`audit/notes.md`](audit/notes.md) section « Bugs hors-RLS » B1.

### H06 — `benevole_repas` : `SELECT USING (true)` (fuite nominative)
- **Symptôme** : équivalent C02 mais sur les choix nominatifs de repas.
  Test T03 : `anon` lit 136 lignes (`benevole_id`, `repas_id`, `vegetarien`).
- **Action Phase 3** : restreindre la SELECT aux `own` + admins ; pas de besoin
  public connu sur cette table.
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §2 « `benevole_repas` » + §6 ligne R03,
  [`audit/17_rls_tests.md`](audit/17_rls_tests.md) test T03.
- **Sévérité** : classée HAUT (et non CRITIQUE comme C02) car la donnée est moins
  sensible (préférence alimentaire vs assignation planning) et n'invalide pas
  une vue d'anonymisation parallèle.

### H07 — `config` INSERT ouvert à tout `authenticated`
- **Symptôme** : policy `Enable insert for authenticated users`
  `WITH CHECK (auth.role() = 'authenticated')`. N'importe quel bénévole peut
  insérer une nouvelle clé de feature flag. UNIQUE sur `key` empêche l'écrasement
  mais pas la pollution du KV.
- **Action Phase 3** : restreindre l'INSERT à `is_admin()`.
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §2 « `config` » + §6 ligne R04.

### H08 — 14 colonnes devraient être `NOT NULL` (sans backfill)
- **Détail** : colonnes audit (`created_at`, `updated_at` sur la plupart des
  tables — 0 NULL en base, default `now()`), booléens à default `false`
  (`benevoles.t_shirt_recupere`), FK obligatoires (`cagnotte_transactions.benevole_id`,
  `postes.periode_id`), libellés requis (`cagnotte_transactions.description`),
  ainsi que `benevoles.cagnotte_forcee_jours` (`'{}'::text[]` default).
- **Action Phase 2.3** : migration unique `ALTER ... SET NOT NULL` sur les 14
  colonnes (0 violation prévue).
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.1
  (synthèse : 14 NOT NULL safe).

### H09 — `benevoles.telephone` : 12 NULL alors que requis par l'UI
- **Symptôme** : 12 lignes sur 140 ont `telephone IS NULL`. L'UI traite le champ
  comme requis (label « Téléphone * » dans `wizard.html:75`). Backfill préalable
  nécessaire avant `SET NOT NULL`.
- **Décision en attente** : valeur sentinelle `'INCONNU'` vs tentative de
  reconstitution sur les 12 lignes.
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.1 #1,
  « Décisions mainteneur en attente » #1.

### H10 — 11 CHECK constraints métier manquantes (sans bloqueur)
- **Détail synthétique** :
  - `cagnotte_transactions.montant <> 0`
  - `cagnotte_transactions.description` non-vide (`length(trim(.)) > 0`)
  - `periodes.montant_credit >= 0`
  - `periodes.ordre > 0`
  - `type_postes.ordre >= 0`
  - `repas.nom`, `periodes.nom`, `type_postes.titre`, `config.key`,
    `benevoles.prenom`, `benevoles.nom` non-vides
  - Cross-field `cagnotte_forcee` cohérence (forcee/type/jours)
  - Cross-field « si `cagnotte_forcee_type = 'journee'` alors `cardinality(jours) > 0` »
- **Action Phase 2.3** : 0 violation en base, bloc unique d'`ALTER TABLE ... ADD CONSTRAINT`.
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.3
  candidats #1, #3-6, #10-12, #14, #16.

---

## 🟡 Anomalies MOYEN

### M01 — Patron « famille » `benevoles.user_id` cardinalité 1:N non documenté
- **Symptôme** : 22 doublons d'`email`/`user_id` sur 140 lignes. Voulu (migration
  archivée `20251229140000_tshirt_family_support.sql` : un compte Auth peut porter
  plusieurs bénévoles d'une famille) mais non documenté hors d'une migration
  archivée. Empêche par ailleurs les UNIQUE évidents sur `email`/`user_id`.
- **Action** : documenter explicitement dans `DATABASE.md` (Phase 7.3).
  Considérer un UNIQUE `benevoles.(user_id, prenom, nom)` (cf. H/Phase 2.3).
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.2
  « Anomalie à classer dans `audit_db.md` ».

### M02 — 5 FK sans index couvrant (impact perf)
- **Détail** : `benevole_cagnotte_periodes.periode_id`, `benevole_repas.repas_id`,
  `postes.periode_id`, `postes.referent_id`, `postes.type_poste_id`.
- **Impact** : suppressions/cascade scannent les tables intégralement. Affecte
  particulièrement `postes` (table jointée dans le planning).
- **Action Phase 2.5** : 5 `CREATE INDEX`.
- **Source** : [`audit/14_indexes.md`](audit/14_indexes.md) §1.7.1.

### M03 — 3 politiques `ON DELETE CASCADE` à arbitrer pour `RESTRICT`
- **Détail** :
  - #2 `benevole_cagnotte_periodes.periode_id` → `periodes` : perte historique financière
  - #7 `cagnotte_transactions.benevole_id` → `benevoles` : transactions orphelines comptables
  - #12 `postes.periode_id` → `periodes` : intégrité référentielle métier
- **Décision en attente** : conserver CASCADE/SET NULL ou durcir en RESTRICT ?
  0 ligne orpheline → migration sans bloqueur dans tous les cas.
- **Source** : [`audit/11_missing_fk.md`](audit/11_missing_fk.md) Partie 2 #2, #7, #12.

### M04 — 2 colonnes filtrées sans index
- **Détail** :
  - `benevoles.email` (`ORDER BY email` admin)
  - `programme.date_ref` (`DELETE WHERE date_ref = ?` lors d'une suppression de jour)
- **Action Phase 2.5** : 2 `CREATE INDEX` supplémentaires.
- **Source** : [`audit/14_indexes.md`](audit/14_indexes.md) §1.7.2.

### M05 — `benevole_cagnotte_periodes` : `SELECT USING (true)` (R08)
- **Symptôme** : test T04 : `anon` lit 52 lignes. À requalifier selon contenu —
  si la table contient des montants individuels, fuite. Si c'est un barème par
  période sans montants individuels, INTENTIONAL.
- **Action Phase 3** : statuer après vérification du contenu réel (Phase 2).
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §2 et §6 ligne R08,
  [`audit/17_rls_tests.md`](audit/17_rls_tests.md) test T04.

### M06 — Policies admin : `EXISTS inline` sur `benevoles` à uniformiser via `is_admin()` (R09)
- **Symptôme** : 6 tables (`inscriptions`, `repas`, `jours`, `type_postes`,
  `orphan_relances`, `benevole_cagnotte_periodes`) utilisent un
  `EXISTS (SELECT 1 FROM benevoles WHERE user_id = auth.uid() AND role = 'admin')`
  inline. Pas de cycle (analyse §4) mais lisibilité/maintenance.
- **Action Phase 3** : remplacer les inlines par `is_admin()`.
- **Source** : [`audit/16_rls.md`](audit/16_rls.md) §4 et §6 ligne R09.

### M07 — Conversion `text → enum` pour 3 colonnes
- **Détail** :
  - `benevoles.role` → `role_type` (3 ou 6 valeurs selon décision juges/officiel)
  - `benevoles.taille_tshirt` → `tshirt_size` (7 valeurs)
  - `benevoles.cagnotte_forcee_type` → `cagnotte_forced_type` (2 valeurs)
- **Bloqueur** : statut des rôles `juge`/`admin-juge`/`officiel` ambigu — migration
  archivée `20260525040000_remove_juges_officiels` non confirmée comme appliquée
  en prod. Décision mainteneur requise avant Phase 2.4.
- **Source** : [`audit/12_typing.md`](audit/12_typing.md) Partie 1.5.1 et 1.5.4,
  [`audit/notes.md`](audit/notes.md) section « Statut réel des rôles juge / admin-juge / officiel ».

### M08 — `benevoles.email` non `citext` + cohérence d'écriture
- **Symptôme** : email sensible à la casse. Pas de doublon dégradant à date
  (22 doublons intentionnels du patron famille), mais ergonomie de connexion
  pénalisée (`User@x` vs `user@x` traités comme distincts par Auth).
- **Action Phase 2.4** : activer `citext`, convertir la colonne, ajouter CHECK
  format email en Phase 2.3.
- **Source** : [`audit/12_typing.md`](audit/12_typing.md) Partie 1.5.1 #1.

---

## 🔵 Anomalies BAS

### B01 — Code mort : table `mentions` + colonnes non référencées
- **Détail** :
  - Table `mentions` (UNUSED) — DROP en Phase 2.2.
  - Colonnes `benevoles.presence_samedi`, `benevoles.presence_dimanche`,
    `config.updated_by`, `cagnotte_transactions.auteur_id` (100 % NULL).
  - Colonnes UNUSED des vues `admin_inscriptions` (`benevole_nom`,
    `benevole_email`, `poste_periode`) et `admin_periodes` (`nb_postes`) →
    `REFACTOR VIEW`.
- **Action Phase 2.2** : 1 migration DROP table + 1 migration DROP columns
  (+ adaptation préalable de `public_debit_cagnotte` pour `cagnotte_transactions.auteur_id`).
- **Source** : [`audit/09_table_usage.md`](audit/09_table_usage.md),
  [`audit/10_column_usage.md`](audit/10_column_usage.md).

### B02 — Renommages Phase 2.6 (décidés mainteneur 2026-05-26)
- **Détail** :
  - Table `programme` → `programmes` (pluralisation).
  - Booléens à préfixer (OPTION A retenue) : `is_vegetarien`, `has_recupere_tshirt`,
    `is_present_samedi`, `is_present_dimanche`, `is_cagnotte_forcee`.
  - Triggers : `check_role_change` → `trg_prevent_role_change`,
    `trigger_check_capacity` → `trg_check_capacity`,
    `trigger_check_time_conflict` → `trg_check_time_conflict`.
  - `orphan_relances.auth_user_id` → `user_id`.
  - Fonction `public_debit_cagnotte` → `debit_cagnotte_public`.
  - Vue `public_planning.inscrits_actuels` → `nb_inscrits_actuels`.
- **Décision conservatoire** : `type_postes` non renommé (refactor coûteux,
  gain cosmétique nul).
- **Source** : [`audit/15_naming.md`](audit/15_naming.md),
  [`audit/notes.md`](audit/notes.md) section « Décisions de nommage validées ».

### B03 — 2 UNIQUE candidats à arbitrer
- **Détail** : `postes.(periode_id, type_poste_id)`, `programme.(date_ref, heure)`.
- **Décision en attente** : un même type de poste peut-il apparaître deux fois
  dans la même période (créneaux multiples) ? Idem pour `programme`.
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.2 #7 et #10.

### B04 — 2 UNIQUE à ajouter (sans bloqueur)
- **Détail** : `benevoles.(user_id, prenom, nom)` (cohérent avec M01),
  `repas.nom` (0 doublon en base).
- **Action Phase 2.3** : 2 `ADD CONSTRAINT UNIQUE`.
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.2 #4 et #9.

### B05 — 2 CHECK seuils métier à arbitrer
- **Détail** : `abs(cagnotte_transactions.montant) <= 10000`, `postes.nb_max <= 200`.
- **Décision en attente** : seuils à fixer avec le mainteneur.
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.3 #2 et #13.

### B06 — 2 CHECK pattern (après dépendances)
- **Détail** : pattern email (après citext), pattern téléphone (après backfill H09).
- **Action Phase 2.3 (différée)** : 2 `ADD CONSTRAINT CHECK` après prérequis.
- **Source** : [`audit/13_constraints.md`](audit/13_constraints.md) Partie 1.6.3 #7-#9.

### B07 — Règle `.gitignore` `*.md` trop large
- **Symptôme** : tous les livrables `*.md` (incluant `plan_refactoring.md`,
  `audit/**/*.md`, le présent `audit_db.md`) sont actuellement ignorés par Git.
  Whitelist trop courte.
- **Action Phase 8.0** : étendre la whitelist (proposition explicite dans
  `audit/notes.md`).
- **Source** : [`audit/notes.md`](audit/notes.md) section « Règle `*.md` du
  `.gitignore` trop large ».
- **Note** : ce point n'est pas un défaut DB mais bloquerait la traçabilité Git
  du présent rapport en l'état.

### B08 — Stratégie de migration vers la prod (Phase 8.1)
- **Symptôme** : la consolidation `init.sql` (Phase 2.8) entre en conflit avec
  l'état actuel des migrations en prod. Option hybride recommandée
  (`init.sql` from-scratch + migrations atomiques pour le delta prod).
- **Action Phase 2.8 / 8.1** : amender le plan selon la décision mainteneur.
- **Source** : [`audit/notes.md`](audit/notes.md) section « Stratégie de migration
  vers la prod (Phase 8.1) ».
- **Note** : également hors scope DB pure mais structurant pour la suite.

---

## Récapitulatif des actions par phase

| Phase | Actions issues de cet audit |
|---|---|
| **2.2 — Code mort** | DROP `mentions` (B01) + DROP 4 colonnes (B01) + REFACTOR 2 vues (B01) + `public_debit_cagnotte` MAJ (B01) |
| **2.3 — Contraintes** | 14 NOT NULL safe (H08) + 1 NOT NULL backfill (H09) + 2 UNIQUE (B04) + FK manquante (H02) + 11 CHECK simples (H10) + 2 CHECK pattern (B06) |
| **2.4 — Typages** | 3 ENUM (M07) + `citext` email (M08) + (décision juges bloquante) |
| **2.5 — Index** | 5 FK sans index (M02) + 2 colonnes filtrées (M04) — total 7 `CREATE INDEX` |
| **2.6 — Nommage** | Tous les renommages B02 |
| **2.8 — Consolidation** | Source = dump prod + migrations atomiques 2.x (H01) ; arbitrer init.sql vs migrations atomiques (B08) |
| **3.1 — RLS universel** | `FORCE ROW LEVEL SECURITY` × 14 tables (H03) |
| **3.3 — Implémentation policies** | Corriger C02, H06, H07, M05 ; uniformiser `is_admin()` (M06) ; `is_admin_juge` `SET search_path` (H04) ; supprimer policy morte `check_referent_access` (H05) |
| **3.4 — Tests RLS** | Refaire tests RLS post-correction ; couvrir `juge`/`officiel` (selon M07) |
| **7.3 — DATABASE.md** | Documenter patron famille (M01), CASCADE volontaires (`type_postes` / `jours`), conventions retenues B02 |
| **8.0 — Git remote** | Corriger `.gitignore` `*.md` (B07) |
| **8.1 — Push prod** | Selon arbitrage B08 (hybride ou migrations atomiques) |

---

## Décisions mainteneur — arbitrées le 2026-05-26

Synthèse des 8 décisions prises par le mainteneur en clôture de la Phase 1.10
(détails dans [`audit/notes.md`](audit/notes.md) section « Décisions mainteneur
arbitrées lors de la clôture de la Phase 1.10 »).

| # | Sujet | Décision | Anomalie liée |
|---|---|---|---|
| D1 | Rôles `juge` / `admin-juge` / `officiel` | **SUPPRESSION** — enum `role_type` à 3 valeurs ; reclasser le 1 user `admin-juge` ; nettoyer fonctions/policies/vues associées | M07 |
| D2 | Backfill `benevoles.telephone` | **`'INCONNU'`** sur les 12 lignes NULL | H09 |
| D3 | UNIQUE `postes.(periode_id, type_poste_id)` | **RÉVISÉ** — pas de UNIQUE simple (cas légitime de créneaux consécutifs) ; étudier `EXCLUDE USING gist` sur `(type_poste_id, tsrange(periode_debut, periode_fin))` | B03 |
| D4 | UNIQUE `programme.(date_ref, heure)` | **AJOUTÉ** (0 violation en base) | B03 |
| D5.a | Seuil `cagnotte_transactions.montant` | **`abs(montant) <= 100`** (et non 10 000) | B05 |
| D5.b | Seuil `postes.nb_max` | **`<= 200`** | B05 |
| D6.a | `benevole_cagnotte_periodes.periode_id` ON DELETE | **CASCADE conservé** | M03 |
| D6.b | `cagnotte_transactions.benevole_id` ON DELETE | **passe à CASCADE** (au lieu de SET NULL) | M03 |
| D6.c | `postes.periode_id` ON DELETE | **SET NULL conservé** (l'UI réaffecte auto) | M03 |
| D7 | `check_referent_access()` | **SUPPRESSION** fonction + policy morte ; couverture déjà assurée par `is_referent_for_benevole()` | H05 |
| D8 | Stratégie Phase 8.1 | **HYBRIDE 2 fichiers** — `init.sql` permanent + `prod_migration.sql` one-shot (delta jeté après application). Adapté à l'usage-unique de l'app. | B08 |

### Conséquences à intégrer dans les prochaines phases

- **Phase 2.2** — Aucun changement (B01 inchangé).
- **Phase 2.3** — Ajouter la migration de reclassement du user `admin-juge` + DROP des fonctions/policies juges (D1). Modifier les seuils CHECK (D5). Étudier la contrainte `EXCLUDE USING gist` sur `postes` (D3). Modifier la FK `cagnotte_transactions.benevole_id` en CASCADE (D6.b).
- **Phase 2.4** — Enum `role_type` à 3 valeurs uniquement (D1).
- **Phase 2.9** — **Nouvelle tâche** : générer `prod_migration.sql` par diff (`migra` ou équivalent) entre dump prod et schéma local cible (D8).
- **Phase 3.3** — DROP fonction `check_referent_access()` + policy `Referents can view volunteers` (D7).
- **Phase 8.1** — Reformuler : appliquer `prod_migration.sql` via `psql` (et non `supabase db push`) (D8).

---

## Conformité globale (synthèse rapide)

| Domaine | État |
|---|---|
| RLS activée | ✅ 14/14 tables |
| RLS forcée | ❌ 0/14 (H03) |
| Tables/colonnes en `snake_case` | ✅ 100 % |
| Tables au pluriel | 14/18 (4 exceptions, 2 justifiées) |
| FK avec convention `_id` | 12/15 (2 exceptions justifiées) |
| FK orphelines | ✅ 0/16 |
| Booléens `is_*`/`has_*` | 0/6 → décidé refactor (B02) |
| Triggers `trg_*` | 0/3 → décidé refactor (B02) |
| Fonctions verbales | 21/22 (1 exception B02) |
| Timestamps `timestamptz` | ✅ 17/17 |
| Index sur FK | 11/16 (5 manquants — M02) |
| Index inutilisés (`idx_scan = 0`) | 2 conservés à juste titre (1 FK, 1 UNIQUE) |

---

## Références

| Rapport | Fichier |
|---|---|
| Tables / colonnes / contraintes / index / vues / fonctions / RLS / enums (CSV) | [`audit/01_*.csv`](audit/01_tables.csv) à [`audit/08_enums.csv`](audit/08_enums.csv) |
| Usage des tables | [`audit/09_table_usage.md`](audit/09_table_usage.md) |
| Usage des colonnes | [`audit/10_column_usage.md`](audit/10_column_usage.md) |
| FK manquantes / orphelines / ON DELETE | [`audit/11_missing_fk.md`](audit/11_missing_fk.md) |
| Typage (text/timestamp/booléens/enums) | [`audit/12_typing.md`](audit/12_typing.md) |
| Contraintes NOT NULL / UNIQUE / CHECK | [`audit/13_constraints.md`](audit/13_constraints.md) |
| Index (FK / filtrés / redondants / inutilisés) | [`audit/14_indexes.md`](audit/14_indexes.md) |
| Conventions de nommage | [`audit/15_naming.md`](audit/15_naming.md) |
| RLS — matrice + analyse récursivité | [`audit/16_rls.md`](audit/16_rls.md) |
| RLS — tests par rôle | [`audit/17_rls_tests.md`](audit/17_rls_tests.md) |
| Notes hors-scope / décisions mainteneur | [`audit/notes.md`](audit/notes.md) |
