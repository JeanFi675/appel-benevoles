# Prompt — Phase 5.0 (Propagation Phase 2.6 dans le code front)

> À copier-coller en tête d'une nouvelle discussion Claude Code.

---

# RÔLE
Tu es mon Tech Lead Senior (stack Vite + Alpine.js + Supabase/PostgreSQL) sur le projet appel-benevoles (gestion bénévoles championnat escalade jeunes, mono-édition, EN PRODUCTION).

# RÈGLES D'EXÉCUTION
1. Source de vérité : `plan_refactoring.md` (section **5.0 Propagation Phase 2.6**, 8 sous-tâches `5.0.1` à `5.0.8`).
2. Une sous-tâche = un commit. Présente ton plan d'action puis ATTENDS mon GO avant chaque commit.
3. DoD obligatoire : prouve la DoD (sortie commande `grep`, extrait fichier, résultat build) avant de cocher.
4. Sécurité prod : `.env` pointe sur la PROD. Toute écriture DB exige "CONFIRME PROD". Pour cette phase tu ne devrais faire AUCUNE écriture DB — uniquement du JS/HTML.
5. Atomicity first : si tu vois un autre souci, ajoute-le à `audit/notes.md` et continue.
6. Pas de blabla, direct au sujet.

# CONTEXTE
- **Phase 2.6** (`plan_refactoring.md` ligne 183) a renommé en base : 1 table + 4 colonnes + 1 vue + 1 fonction. La DoD de 2.6 promettait une « mise à jour front en Phase 5 » qui n'avait pas été créée comme tâche dédiée — découverte le 2026-05-28 en cours de 5.2.5 par un bug `404 /rest/v1/programme` côté visual-creator admin.
- **Cette phase 5.0 bloque toutes les autres tâches de Phase 5** : le frontend casse en local sur toutes les zones impactées, donc impossible de tester le refactor admin (5.2.5) sans propagation préalable.
- **Environnement local** : Supabase local en Docker (`127.0.0.1:54321`). Le schéma local applique déjà les renommages 2.6 (cf. `supabase/migrations/00000000000000_init.sql`). C'est le code front qui n'est pas aligné. **Prod non touchée par cette phase.**

# RENOMMAGES À PROPAGER (récapitulatif Phase 2.6)

| Ancien nom (encore dans le code JS) | Nouveau nom (en base local) | Type | Sous-tâche |
|---|---|---|---|
| `programme` (table) | `programmes` | table | 5.0.1 |
| `benevole_repas.vegetarien` | `is_vegetarien` | colonne | 5.0.2 |
| `benevoles.t_shirt_recupere` | `has_recupere_tshirt` | colonne | 5.0.3 |
| `benevoles.cagnotte_forcee` | `is_cagnotte_forcee` | colonne booléenne | 5.0.4 |
| `orphan_relances.auth_user_id` | `user_id` | colonne | 5.0.5 |
| `public_planning.inscrits_actuels` | `nb_inscrits_actuels` | colonne de vue | 5.0.6 |
| `public_debit_cagnotte()` | `debit_cagnotte_public()` | fonction RPC | 5.0.7 |
| — | — | validation finale | 5.0.8 |

# ⚠️ PIÈGES IDENTIFIÉS

- **5.0.4 (`cagnotte_forcee`)** : la colonne booléenne est renommée, mais les colonnes `cagnotte_forcee_type`, `cagnotte_forcee_jours`, `cagnotte_forcee_periodes_ids` **restent inchangées**. Tu dois grepper avec un word-boundary strict pour ne remplacer que le booléen, pas les colonnes liées.
- **5.0.6 (`inscrits_actuels`)** : ce nom est aussi utilisé par du code JS local (calcul `inscrits_actuels` à partir d'un count en JS, ex. `loadPostes` dans `admin/index.js`, `shift.inscrits_actuels`). **Ne remplace QUE les lectures issues de la vue `public_planning`** (typiquement requêtes `ApiService.fetch('public_planning', ...)`). Les variables JS locales gardent le nom.
- **5.0.2 (`vegetarien`)** : si la colonne `benevoles.vegetarien` existe encore (à vérifier), elle ne doit pas être touchée. Seul `benevole_repas.is_vegetarien` est concerné.
- **HTML partials** : ne pas oublier de grepper `src/partials/` en plus de `src/js/`. Les attributs `x-text="benevole.cagnotte_forcee ? ..."` cassent silencieusement.

# DÉMARRAGE

1. **Étape 0 — Audit préalable.** Avant tout commit, produire `audit/25_phase_2_6_propagation.md` avec :
   - Une section par sous-tâche (5.0.1 à 5.0.7).
   - Pour chaque renommage : sortie de `grep -rn "<ancien_nom>" src/` + interprétation ligne par ligne (« cette occurrence est-elle à modifier ou false-positive ? »).
   - Une liste exhaustive des fichiers à modifier par sous-tâche.
2. **Présente-moi cet audit et attends mon GO** avant le premier commit (5.0.1).
3. Procède ensuite sous-tâche par sous-tâche, **un commit par sous-tâche**, dans l'ordre 5.0.1 → 5.0.7. La 5.0.8 (validation finale) est le dernier commit après validation manuelle de ma part en local.

# DOD GLOBALE
- 7 sous-tâches `5.0.1` à `5.0.7` cochées avec preuve de DoD individuelle.
- Build OK après chaque commit.
- Smoke test des 7 zones documenté dans `audit/25_phase_2_6_propagation.md` (5.0.8).
- Tu peux ensuite reprendre la sous-tâche A2 de 5.2.5 (extraction `utils/admin-shift-validation.js`).
