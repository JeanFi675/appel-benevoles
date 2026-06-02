# Matrice RLS cible — schéma `public`

> Phase 3.2 — Spécification des policies à appliquer.
> Source de vérité pour la rédaction des migrations RLS de la Phase 3.3.
>
> **Périmètre** : 13 tables `public` post-Phase 2 (la table `mentions` a été supprimée en Phase 2.2 ; `programme` renommée `programmes` en Phase 2.6).
> **Rôles applicatifs** : 3 (`benevole`, `referent`, `admin`) après suppression `juge` / `admin-juge` / `officiel` (décision D1 du 2026-05-26).
> **Rôles Postgres** : `anon` (non authentifié) et `authenticated` (JWT valide). Le rôle applicatif est lu dans `benevoles.role` via le helper `auth_has_role(role_type)` à créer en 3.3.

---

## 1) Légende

| Décision        | Signification |
|-----------------|--------------|
| `ALLOW`         | L'opération est autorisée sans restriction de ligne. |
| `DENY`          | Aucune policy ne couvre cette opération → bloquée par RLS. |
| `OWN_ROW_ONLY`  | L'opération est autorisée uniquement sur les lignes "appartenant" au rôle (cf. clé d'appartenance ci-dessous). |
| `ROLE_BASED`    | L'opération est conditionnée par une relation/fonction (ex : `is_referent_for_benevole(benevole_id)`). |

### Clés d'appartenance par table

| Table                          | Clé d'appartenance (côté bénévole) |
|--------------------------------|------------------------------------|
| `benevoles`                    | `user_id = auth.uid()` |
| `inscriptions`                 | `benevole_id IN (SELECT id FROM benevoles WHERE user_id = auth.uid())` |
| `benevole_repas`               | `benevole_id IN (SELECT id FROM benevoles WHERE user_id = auth.uid())` |
| `benevole_cagnotte_periodes`   | `benevole_id IN (SELECT id FROM benevoles WHERE user_id = auth.uid())` |
| `cagnotte_transactions`        | `user_id = auth.uid()` (cf. dénormalisation D-1 Phase 2.7) |

### Helpers `SECURITY DEFINER` cibles

| Helper                                  | Rôle | Notes |
|-----------------------------------------|------|-------|
| `auth_has_role(role_type)`              | À créer en 3.3 | Lit `benevoles.role` depuis `auth.uid()`. Remplace les `is_admin()` / `EXISTS ... WHERE role='admin'` épars. `STABLE`, `SET search_path = public`. |
| `is_admin()`                            | Existant (à conserver, alias de `auth_has_role('admin')` après refacto) | Sécurité : déjà `SET search_path = public`. |
| `is_referent_for_benevole(uuid)`        | Existant | Vérifie via `postes.referent_id` (joint sur `benevoles.user_id = auth.uid()`). Correct (cf. R06). Utilisé pour `benevoles.SELECT` referent. |
| `is_referent_for_poste(uuid)`           | **À créer en 3.3** | Vérifie qu'un `poste_id` donné a pour `referent_id` le bénévole correspondant à `auth.uid()`. `STABLE SECURITY DEFINER SET search_path = public`. Utilisé pour `inscriptions.SELECT` referent (cf. arbitrage mainteneur 2026-05-27 — point 2). |
| `check_referent_access(uuid)`           | **À SUPPRIMER** (D7) | Fonction morte (compare `auth.uid()` à `benevoles.id` au lieu de `user_id`). Cf. R06. |
| `is_admin_juge()`                       | **À SUPPRIMER** (D1) | Plus de rôle `admin-juge`. Migration `20260526130300_drop_juges_officiels.sql` déjà appliquée. |

---

## 2) Matrice Table × Opération × Rôle

> Convention de lecture : pour chaque cellule, la décision indiquée est la **décision finale cible** après application de la Phase 3.3. Les cellules marquées d'une référence (R0x) signalent une régression vs l'existant à corriger.

### 2.1 `benevoles`

| Opération | anon  | benevole       | referent                                          | admin   |
|-----------|-------|----------------|---------------------------------------------------|---------|
| SELECT    | DENY  | OWN_ROW_ONLY   | OWN_ROW_ONLY ∨ ROLE_BASED (`is_referent_for_benevole(id)`) | ALLOW   |
| INSERT    | DENY  | OWN_ROW_ONLY (`user_id = auth.uid()`) | OWN_ROW_ONLY                                        | ALLOW   |
| UPDATE    | DENY  | OWN_ROW_ONLY   | OWN_ROW_ONLY                                       | ALLOW   |
| DELETE    | DENY  | OWN_ROW_ONLY   | OWN_ROW_ONLY                                       | ALLOW   |

**Justifications** :
- INSERT côté `benevole`/`referent` : self-onboarding via signup Supabase (`auth.uid() = user_id`). La création par admin passe par l'Edge Function `create-benevole` (service_role, bypass RLS).
- Policy `Referents can view volunteers` (qual = `check_referent_access(id)`) à **supprimer** (R06 / D7). La couverture référent reste assurée par `Referents can view benevoles on their postes` (qual = `is_referent_for_benevole(id)`).
- Un `referent` est aussi un `benevole` (son propre profil) ; les conditions OWN_ROW_ONLY sont héritées.

### 2.2 `inscriptions`

| Opération | anon  | benevole       | referent                                              | admin |
|-----------|-------|----------------|-------------------------------------------------------|-------|
| SELECT    | **DENY (R02)** | OWN_ROW_ONLY | OWN_ROW_ONLY ∨ ROLE_BASED (`is_referent_for_poste(poste_id)`) | ALLOW |
| INSERT    | DENY  | OWN_ROW_ONLY   | OWN_ROW_ONLY                                          | ALLOW |
| UPDATE    | DENY  | DENY (INTENTIONAL) | DENY (INTENTIONAL)                                | DENY (INTENTIONAL) |
| DELETE    | DENY  | OWN_ROW_ONLY   | OWN_ROW_ONLY                                          | ALLOW |

**Justifications** :
- **R02** — Révoquer la policy actuelle `Lecture publique des inscriptions` (`USING (true)`). L'affichage public du planning passe par la vue `public_planning` (anonymisation prénom + initiale).
- UPDATE = `DENY` global : choix métier (immutable). Le frontend supprime + recrée. Compatible avec les triggers `trg_check_capacity` / `trg_check_time_conflict`.
- **Portée référent (arbitrage mainteneur 2026-05-27)** : un référent voit **ses propres inscriptions** (en tant que bénévole, via OWN_ROW_ONLY) **ET les inscriptions pointant sur ses postes** (via `is_referent_for_poste(poste_id)`). Il ne voit **PAS** les inscriptions hors de ses postes pour les bénévoles de son équipe (ex : si Marie est sur ton accueil + sur cuisine ailleurs, tu vois uniquement la ligne "accueil"). Cf. helper `is_referent_for_poste` à créer en 3.3.

### 2.3 `postes`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | ALLOW | ALLOW    | ALLOW    | ALLOW |
| INSERT    | DENY  | DENY     | DENY     | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | ALLOW |

**Justifications** : référentiel public du planning. Aucune donnée nominative dans `postes` (le `referent_id` est un UUID, pas une identité).

### 2.4 `periodes`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | ALLOW | ALLOW    | ALLOW    | ALLOW |
| INSERT    | DENY  | DENY     | DENY     | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | ALLOW |

**Justifications** : référentiel public (bornes temporelles du championnat).

### 2.5 `type_postes`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | ALLOW | ALLOW    | ALLOW    | ALLOW |
| INSERT    | DENY  | DENY     | DENY     | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | ALLOW |

**Justifications** : référentiel.

### 2.6 `programmes`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | ALLOW | ALLOW    | ALLOW    | ALLOW |
| INSERT    | DENY  | DENY     | DENY     | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | ALLOW |

**Justifications** : programme officiel public (affichage).

### 2.7 `jours`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | ALLOW | ALLOW    | ALLOW    | ALLOW |
| INSERT    | DENY  | DENY     | DENY     | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | ALLOW |

**Justifications** : référentiel.

### 2.8 `repas`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | ALLOW | ALLOW    | ALLOW    | ALLOW |
| INSERT    | DENY  | DENY     | DENY     | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | ALLOW |

**Justifications** : référentiel des repas servis (catalogue côté UI). Données non sensibles.

### 2.9 `benevole_repas`

| Opération | anon  | benevole       | referent                  | admin |
|-----------|-------|----------------|---------------------------|-------|
| SELECT    | **DENY (R03)** | OWN_ROW_ONLY | OWN_ROW_ONLY (= benevole) | ALLOW |
| INSERT    | DENY  | OWN_ROW_ONLY   | OWN_ROW_ONLY              | ALLOW |
| UPDATE    | DENY  | DENY (INTENTIONAL) | DENY (INTENTIONAL)    | DENY (INTENTIONAL) |
| DELETE    | DENY  | OWN_ROW_ONLY   | OWN_ROW_ONLY              | ALLOW |

**Justifications** :
- **R03** — Révoquer `Lecture publique des choix de repas` (`USING (true)`). Donnée nominative (`is_vegetarien` lié à un `benevole_id`).
- **Portée référent (arbitrage mainteneur 2026-05-27)** : un référent ne voit **que ses propres choix de repas** (en tant que bénévole). Il n'a **pas** accès aux choix de repas des bénévoles de son équipe — la logistique repas est centralisée admin. Pas de ROLE_BASED.
- UPDATE = DENY global : supprime + recrée (comme `inscriptions`).

### 2.10 `benevole_cagnotte_periodes`

| Opération | anon  | benevole       | referent | admin |
|-----------|-------|----------------|----------|-------|
| SELECT    | **DENY (R08)** | OWN_ROW_ONLY | DENY     | ALLOW |
| INSERT    | DENY  | DENY           | DENY     | ALLOW |
| UPDATE    | DENY  | DENY           | DENY     | ALLOW |
| DELETE    | DENY  | DENY           | DENY     | ALLOW |

**Justifications** :
- **R08** — Révoquer `Lecture publique de benevole_cagnotte_periodes` (`USING (true)`). Donnée nominative (association bénévole ↔ périodes "cagnotte forcée").
- Un `benevole` doit pouvoir voir **ses propres** périodes cagnotte (UI récap perso). Pas d'accès aux autres lignes.
- Le `referent` n'a pas besoin d'accès cagnotte (les référents gèrent l'équipe terrain, pas la comptabilité).
- Écriture admin uniquement.

### 2.11 `cagnotte_transactions`

| Opération | anon  | benevole                      | referent | admin |
|-----------|-------|-------------------------------|----------|-------|
| SELECT    | DENY  | OWN_ROW_ONLY (`user_id = auth.uid()`) | DENY     | ALLOW |
| INSERT    | DENY  | DENY                           | DENY     | ALLOW |
| UPDATE    | DENY  | DENY (INTENTIONAL)             | DENY (INTENTIONAL) | DENY (INTENTIONAL) |
| DELETE    | DENY  | DENY (INTENTIONAL)             | DENY (INTENTIONAL) | DENY (INTENTIONAL) |

**Justifications** :
- Le `benevole` voit l'historique de **ses propres** transactions (cf. dénormalisation D-1 Phase 2.7 — `user_id` direct sur la table, sans JOIN sur `benevoles`).
- Le RPC `debit_cagnotte_public` (`SECURITY DEFINER`) reste le seul chemin d'INSERT côté front pour les bénévoles ; il bypass RLS (pas besoin de policy `benevole INSERT`).
- UPDATE / DELETE bloqués pour tous, **y compris admin** → immutabilité comptable. **Arbitrage mainteneur 2026-05-27** : aucune correction par l'UX. Les rares corrections passent par un accès DB direct (Supabase Studio / `psql`) opéré manuellement par un admin technique, hors flux applicatif.
- Le `referent` n'a pas accès à la cagnotte des autres bénévoles (séparation des préoccupations).

### 2.12 `orphan_relances`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | DENY  | DENY     | DENY     | ALLOW |
| INSERT    | DENY  | DENY     | DENY     | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | ALLOW |

**Justifications** : table interne d'admin (suivi des relances aux bénévoles inactifs/orphelins). Pas d'accès utilisateur final.

### 2.13 `config`

| Opération | anon  | benevole | referent | admin |
|-----------|-------|----------|----------|-------|
| SELECT    | ALLOW | ALLOW    | ALLOW    | ALLOW |
| INSERT    | DENY  | **DENY (R04)** | DENY  | ALLOW |
| UPDATE    | DENY  | DENY     | DENY     | ALLOW |
| DELETE    | DENY  | DENY     | DENY     | DENY (INTENTIONAL) |

**Justifications** :
- SELECT public : la table contient des feature flags lus côté front avant authentification (ex : `cagnotte_active`).
- **R04** — Révoquer `Enable insert for authenticated users` (`WITH CHECK (auth.role() = 'authenticated')`). Tout `authenticated` peut polluer le KV. À restreindre à `auth_has_role('admin')`.
- DELETE = DENY global : KV statique, jamais supprimé en runtime.

---

## 3) Récapitulatif des écarts vs l'existant (Phase 3.3)

| ID anomalie audit | Table              | Opération | Action de correction |
|-------------------|--------------------|-----------|----------------------|
| **R02**           | `inscriptions`     | SELECT    | DROP policy `Lecture publique des inscriptions`. |
| **R03**           | `benevole_repas`   | SELECT    | DROP policy `Lecture publique des choix de repas`. Conserver policy "own" benevole, ajouter policy referent ROLE_BASED. |
| **R04**           | `config`           | INSERT    | DROP policy `Enable insert for authenticated users`, CREATE policy `Admins can insert config` avec `auth_has_role('admin')`. |
| **R06**           | `benevoles`        | SELECT    | DROP policy `Referents can view volunteers` + DROP function `check_referent_access` (D7). Couverture conservée par `is_referent_for_benevole`. |
| **R07**           | toutes             | —         | Déjà couvert par 3.1 (`FORCE ROW LEVEL SECURITY` activé). |
| **R08**           | `benevole_cagnotte_periodes` | SELECT | DROP policy `Lecture publique de benevole_cagnotte_periodes`. Ajouter policy OWN_ROW_ONLY benevole. |
| **R09**           | inscriptions, repas, jours, type_postes, orphan_relances, benevole_cagnotte_periodes | ALL (admin) | Refactor : remplacer `EXISTS (SELECT 1 FROM benevoles WHERE user_id=auth.uid() AND role='admin')` inline par `auth_has_role('admin')`. Bénéfice : lisibilité + perf + audit centralisé. |

Anomalies déjà traitées en amont :
- **R01** (`mentions` open) — table `mentions` supprimée en Phase 2.2.
- **R05** (`is_admin_juge` sans search_path) — fonction supprimée en Phase 2.3 (D1).

---

## 4) Conventions de nommage des policies (Phase 3.3)

Pour homogénéiser le `pg_policies` final :

```
<table>_<role>_<op>          -- ex: inscriptions_benevole_select, config_admin_update
<table>_<role>_<op>_<scope>  -- ex: benevoles_referent_select_managed
```

- `op` ∈ `{select, insert, update, delete, all}`.
- `scope` optionnel pour distinguer les policies multiples sur une même cellule (ex : `_own` vs `_managed`).
- Toutes les policies en minuscules `snake_case`.

---

## 5) Méthodologie d'implémentation (Phase 3.3)

1. Créer le helper `auth_has_role(role_type)` en `STABLE SECURITY DEFINER SET search_path = public`.
2. Une migration unique `..._rls_policies.sql` :
   - DROP toutes les policies existantes sur `public.*` (idempotent via `DROP POLICY IF EXISTS`).
   - DROP function `check_referent_access` (D7).
   - CREATE chaque policy selon la matrice ci-dessus, avec les noms en `snake_case`.
3. Vérification finale : `SELECT count(*) FROM pg_policies WHERE schemaname='public'` doit correspondre au compte attendu (≈ 30 policies pour 13 tables).
4. Tests automatisés dans `security/rls_tests.sql` (Phase 3.4) couvrant les 4 rôles × N opérations critiques.

---

## 6) Décisions mainteneur consignées (2026-05-27)

| # | Sujet | Décision | Impact matrice |
|---|-------|----------|----------------|
| 1 | `benevole_repas` SELECT referent | **DENY** | §2.9 : referent ne voit que ses propres choix. Logistique repas centralisée admin. |
| 2 | Portée référent sur `inscriptions` SELECT | **"mes inscriptions + inscriptions sur mes postes"** | §2.2 : `OWN_ROW_ONLY ∨ is_referent_for_poste(poste_id)`. Nouveau helper à créer en 3.3. Le référent ne voit PAS les inscriptions hors de ses postes pour ses bénévoles. |
| 3 | Flow self-service sur `benevole_cagnotte_periodes` | **Aucun** | §2.10 inchangé : admin only sur INSERT/UPDATE/DELETE. |
| 4 | Suppression `check_referent_access` | **Confirmé** | §3 R06 : DROP function + DROP policy `Referents can view volunteers` en Phase 3.3. |
| 5 | `cagnotte_transactions` UPDATE/DELETE | **Immutabilité stricte (option A)** | §2.11 : DENY pour tous y compris admin. Corrections via accès DB direct (Supabase Studio / psql), hors UX. |

Validation à acter par un commit `docs: validation rls_matrix` (Phase 3.2 #2 du plan).
