# Audit Phase 5.0 — Propagation Phase 2.6 dans le code front

> Date : 2026-05-28
> Source : `plan_refactoring.md` §5.0 (sous-tâches 5.0.1 à 5.0.8)
> Méthode : un `grep -rn <ancien_nom> src/` par renommage, interprétation ligne par ligne, classification {À MODIFIER, FALSE POSITIVE, HORS PÉRIMÈTRE}.
> État LOCAL vérifié dans `supabase/migrations/00000000000000_init.sql` : renommages 2.6 appliqués (table `programmes` ligne ~?, colonne `benevole_repas.is_vegetarien` l.1017, vue `public_planning.nb_inscrits_actuels` l.1126, fonction `debit_cagnotte_public` l.172, colonne `orphan_relances.user_id`).

---

## 5.0.1 — Table `programme` → `programmes`

### Grep `'programme'` (avec quotes, pour cibler les chaînes API)

| Fichier | Ligne | Contenu | Décision |
|---|---|---|---|
| `src/js/admin-timeline.js` | 365 | `await ApiService.fetch('programme', {` | **À MODIFIER** → `'programmes'` |
| `src/js/modules/admin/index.js` | 802 | `await ApiService.fetch('programme', {` | **À MODIFIER** → `'programmes'` |
| `src/js/modules/admin/index.js` | 1609 | `ApiService.delete('programme', { date_ref: day })` | **À MODIFIER** |
| `src/js/modules/admin/index.js` | 2237 | `ApiService.delete('programme', { id: this.visualDeletedEventIds })` | **À MODIFIER** |
| `src/js/modules/admin/index.js` | 2439 | `ApiService.delete('programme', { date_ref: this.visualDaySelected })` | **À MODIFIER** |
| `src/js/modules/admin/index.js` | 2443 | `ApiService.upsertMany('programme', programmePayload)` | **À MODIFIER** |

### Grep `programme` (sans quotes, pour vérifier les false positives sémantiques)

Le grep large remonte ~25 occurrences supplémentaires : commentaires, libellés UI ("événements de programme", "marqueurs programme"), variables JS locales (`programmeDuJour`, `programmeMeta`, `programmePayload`, `visualProgramEvents`), getters Alpine (`programmeDuJour()`, `programmeMeta()`), classes CSS / clés d'`x-for` (`'cprog-'`, `'pm-'`, `'pr-'`, `'meta-'`).

→ **TOUS FALSE POSITIVES** : ce sont des libellés métier ou des noms de variables JS qui n'ont aucun rapport avec le nom de la table SQL. Aucune référence à la table elle-même hors des 6 appels API listés ci-dessus.

**Fichiers à modifier (5.0.1)** : `src/js/admin-timeline.js`, `src/js/modules/admin/index.js`.

---

## 5.0.2 — Colonne `benevole_repas.vegetarien` → `is_vegetarien`

### Grep `vegetarien`

| Fichier | Ligne | Contenu | Type d'objet `r`/`ur` | Décision |
|---|---|---|---|---|
| `src/js/modules/admin/index.js` | 1094 | `if (ur.vegetarien) {` | `ur` ∈ `b.repas` (issu de vue `admin_benevoles` qui agrège `benevole_repas` en JSONB avec clé `is_vegetarien` — cf. init.sql l.1659) | **À MODIFIER** → `ur.is_vegetarien` |
| `src/js/modules/user/wizard.js` | 23 | `repas: [] // Array of { repas_id, vegetarien }` | Commentaire décrivant le shape du tableau `repas` (lui-même destiné à `benevole_repas`) | **À MODIFIER** (commentaire) → `is_vegetarien` |
| `src/js/modules/user/wizard.js` | 231 | `(profile.benevole_repas || []).map(r => ({ repas_id: r.repas_id, vegetarien: r.vegetarien }))` | Lecture DB (`r.vegetarien` issu de `benevole_repas`) + création shape interne | **À MODIFIER** (lecture ET clé locale, car la clé locale sera ensuite ré-INSÉRÉE telle quelle dans `benevole_repas`) |
| `src/js/modules/user/wizard.js` | 297 | `vegetarien: r.vegetarien` (payload pour `ApiService.insert('benevole_repas', ...)`) | INSERT colonne `benevole_repas.vegetarien` | **À MODIFIER** (colonne SQL) |
| `src/js/modules/user/wizard.js` | 355 | `return r ? r.vegetarien : false` (getter `isWizardRepasVege`) | Lecture sur le shape interne `wizardProfileForm.repas[]` | **À MODIFIER** par cohérence (le shape doit utiliser le même nom dans toute la chaîne) |
| `src/js/modules/user/wizard.js` | 362 | `this.wizardProfileForm.repas.push({ repas_id: repasId, vegetarien: false })` | Init shape interne | **À MODIFIER** |
| `src/js/modules/user/wizard.js` | 373 | `r.vegetarien = vege` (setter `setWizardRepasVege`) | Setter shape interne | **À MODIFIER** |

### Vérification : la colonne `benevoles.vegetarien` (qui aurait été à NE PAS toucher) existe-t-elle ?

```
grep "vegetarien" supabase/migrations/00000000000000_init.sql
1017:    is_vegetarien boolean DEFAULT false NOT NULL    [benevole_repas]
1659:    ... 'is_vegetarien', br.is_vegetarien ...        [vue admin_benevoles]
```

→ **AUCUNE colonne `benevoles.vegetarien` n'existe** en LOCAL. Toutes les occurrences `vegetarien` du grep src/ ciblent `benevole_repas`. Pas de risque de fausse-rénommée.

### Partial wizard

`src/partials/wizard.html:131-132` appelle `isWizardRepasVege()` et `setWizardRepasVege()` — pas de référence directe au champ → aucun changement HTML pour 5.0.2.

**Fichiers à modifier (5.0.2)** : `src/js/modules/admin/index.js`, `src/js/modules/user/wizard.js`.

---

## 5.0.3 — Colonne `benevoles.t_shirt_recupere` → `has_recupere_tshirt`

### Grep `t_shirt_recupere`

| Fichier | Ligne | Contenu | Décision |
|---|---|---|---|
| `src/js/scanner-tshirt.js` | 13 | `* @property {boolean} t_shirt_recupere` (JSDoc) | **À MODIFIER** |
| `src/js/scanner-tshirt.js` | 51 | `selected: v.has_registrations && !v.t_shirt_recupere` | **À MODIFIER** |
| `src/js/scanner-tshirt.js` | 68 | `return this.volunteers.some(v => v.selected && !v.t_shirt_recupere)` | **À MODIFIER** |
| `src/js/scanner-tshirt.js` | 72 | `const toValidate = this.volunteers.filter(v => v.selected && !v.t_shirt_recupere)` | **À MODIFIER** |
| `src/js/scanner-tshirt.js` | 99 | `v.t_shirt_recupere = true;` | **À MODIFIER** |
| `src/js/modules/user/tshirt.js` | 43 | `eligibles.every(v => v.t_shirt_recupere)` | **À MODIFIER** |
| `src/js/modules/user/tshirt.js` | 54 | `eligibles.filter(v => !v.t_shirt_recupere).length` | **À MODIFIER** |

Aucun partial HTML ne référence ce nom (vérifié par grep sur `src/partials/`).

**Fichiers à modifier (5.0.3)** : `src/js/scanner-tshirt.js`, `src/js/modules/user/tshirt.js`.

---

## 5.0.4 — Colonne `benevoles.cagnotte_forcee` → `is_cagnotte_forcee`

### ⚠️ Piège : 3 colonnes SŒURS ne sont PAS renommées

Les colonnes suivantes restent intactes : `cagnotte_forcee_type`, `cagnotte_forcee_jours`, `cagnotte_forcee_periodes_ids`. Le grep doit donc être interprété avec un word-boundary.

### Grep `cagnotte_forcee` (puis filtrage manuel des suffixes `_type`, `_jours`, `_periodes_ids`)

#### `src/partials/sections/admin/tab-cagnotte-forcee.html`

| Ligne | Contenu | Décision |
|---|---|---|
| 58 | `<template x-if="benevole.cagnotte_forcee">` | **À MODIFIER** → `is_cagnotte_forcee` |
| 60 | `x-text="benevole.cagnotte_forcee_type ..."` | FALSE POSITIVE (`_type`) |
| 137 | `x-model="forcedForm.cagnotte_forcee"` | **À MODIFIER** |
| 146 | `x-show="forcedForm.cagnotte_forcee"` | **À MODIFIER** |
| 153, 159, 166, 172 | `forcedForm.cagnotte_forcee_type` | FALSE POSITIVE (`_type`) |
| 181, 213, 321, 326, 336, 350 | `..._type` | FALSE POSITIVE (`_type`) |
| 192, 195, 197, 208, 339, 342 | `..._jours` | FALSE POSITIVE (`_jours`) |
| 224, 227, 229, 244, 353, 356 | `..._periodes_ids` | FALSE POSITIVE (`_periodes_ids`) |
| 282 | `benevoles.filter(b => b.cagnotte_forcee).length + ' actives'` | **À MODIFIER** |
| 290 | `benevoles.filter(b => b.cagnotte_forcee).length === 0` | **À MODIFIER** |
| 298 | `benevoles.filter(b => b.cagnotte_forcee).length > 0` | **À MODIFIER** |
| 311 | `benevoles.filter(b => b.cagnotte_forcee)` | **À MODIFIER** |

#### `src/js/modules/admin/index.js`

| Ligne | Contenu | Décision |
|---|---|---|
| 64 | `cagnotte_forcee: false,` (init `forcedForm`) | **À MODIFIER** |
| 65-67 | `cagnotte_forcee_{type,jours,periodes_ids}` | FALSE POSITIVE (suffixes) |
| 235 | `b.cagnotte_forcee ? ('Oui (' + ...)` | **À MODIFIER** |
| 676 | `const isForced = benevole?.cagnotte_forcee;` | **À MODIFIER** |
| 691 | `(benevolesData || []).filter(b => b.cagnotte_forcee).forEach(b => {` | **À MODIFIER** |
| 693, 694, 696, 697 | `b.cagnotte_forcee_{type,jours,periodes_ids}` | FALSE POSITIVE |
| 2931 | `this.forcedForm.cagnotte_forcee = benevole.cagnotte_forcee \|\| false;` | **À MODIFIER** (les 2 occurrences) |
| 2932-2934 | `..._{type,jours,periodes_ids}` | FALSE POSITIVE |
| 2945 | `const isForced = this.forcedForm.cagnotte_forcee;` | **À MODIFIER** |
| 2946-2947 | `..._{type,jours}` | FALSE POSITIVE |
| 2950 | `cagnotte_forcee: isForced,` (payload UPDATE sur `benevoles`) | **À MODIFIER** (colonne SQL) |
| 2951-2952 | `..._{type,jours}` (payload colonnes inchangées) | FALSE POSITIVE |
| 2963-2964 | `..._periodes_ids` | FALSE POSITIVE |
| 3003 | `cagnotte_forcee: false,` (reset payload UPDATE) | **À MODIFIER** |
| 3004-3005 | `..._{type,jours}` | FALSE POSITIVE |

### Stratégie d'édition

Pour éviter de toucher accidentellement les suffixes, l'`Edit` se fera par `old_string` **suffisamment contextuel** (ex: `benevole.cagnotte_forcee ?` ou `cagnotte_forcee: false,` ou `b.cagnotte_forcee).length`) plutôt que par `replace_all`.

**Fichiers à modifier (5.0.4)** : `src/partials/sections/admin/tab-cagnotte-forcee.html`, `src/js/modules/admin/index.js`.

---

## 5.0.5 — Colonne `orphan_relances.auth_user_id` → `user_id`

### Grep `auth_user_id`

| Fichier | Ligne | Contenu | Décision |
|---|---|---|---|
| `src/js/admin-connexions.js` | 222 | `body: { auth_user_id: user.id }` dans `ApiService.invoke('send-relance-orphelin', ...)` | **FALSE POSITIVE** — c'est le body envoyé à l'Edge Function `send-relance-orphelin`, pas une lecture/écriture directe en DB. L'Edge Function continue d'attendre `auth_user_id` dans son JSON d'entrée (`supabase/functions/send-relance-orphelin/index.ts:58`). Le contrat HTTP de l'Edge Function n'est pas remappé dans le périmètre de 5.0.5 (qui ne touche que `src/`). |
| `src/js/admin-connexions.js` | 285 | `p_auth_user_id: (user).id` dans `ApiService.rpc('save_orphelin_phone', ...)` | **FALSE POSITIVE** — c'est le nom du **paramètre** de la fonction RPC `save_orphelin_phone(p_auth_user_id uuid, p_telephone text)`. Init.sql l.725 confirme que la signature de cette fonction n'a PAS été renommée (le paramètre reste `p_auth_user_id` même si le `INSERT` interne écrit dans `orphan_relances.user_id` via le nouveau nom de colonne). |

### Conclusion 5.0.5

→ **0 changement dans `src/`**. Aucun appel direct PostgREST sur la colonne `orphan_relances.auth_user_id` n'existe dans le code front (la table est manipulée uniquement via l'Edge Function et la fonction RPC `save_orphelin_phone`, qui encapsulent toutes deux le nom de colonne côté serveur).

### ⚠️ Anomalie hors-périmètre à reporter dans `audit/notes.md`

L'Edge Function `supabase/functions/send-relance-orphelin/index.ts` (lignes 150, `.upsert({ auth_user_id, ... }, { onConflict: 'auth_user_id' })`) écrit **TOUJOURS** sur la colonne `auth_user_id`, qui n'existe plus en LOCAL (et n'existera plus en PROD après application de l'init.sql). → Edge Function cassée. À traiter hors Phase 5.0 (probablement Phase 8 / déploiement Edge Functions). Sera consigné dans `audit/notes.md`.

**Fichiers à modifier (5.0.5)** : aucun en `src/`. Le commit 5.0.5 sera donc un **commit doc** (mise à jour de cet audit + entrée `audit/notes.md`) sans changement de code.

---

## 5.0.6 — Colonne vue `public_planning.inscrits_actuels` → `nb_inscrits_actuels`

### ⚠️ Piège : `inscrits_actuels` désigne aussi des champs JS calculés localement (≠ colonne de vue)

Le plan stipule : « ne remplacer QUE les lectures issues de la vue `public_planning` ». Les variables JS locales gardent le nom `inscrits_actuels`.

### Identification des lectures `public_planning`

Grep `public_planning` dans `src/` → 3 occurrences :
- `src/js/admin-timeline.js:425` — `ApiService.fetch('public_planning', { select: 'poste_id, titre, description, periode_debut, periode_fin, nb_min, nb_max, liste_benevoles', ... })` → **N'inclut PAS `inscrits_actuels` dans le `select`**. Donc rien à changer.
- `src/js/modules/user/planning.js:242` — `ApiService.fetch('public_planning', { order: ... })` → pas de `select`, donc PostgREST retourne `*` y compris la colonne renommée. **DOIT être adapté** : soit aliaser au niveau du select (`select: '*, inscrits_actuels:nb_inscrits_actuels'`), soit renommer en JS localement après le fetch, soit propager le rename à toute la chaîne. → Stratégie retenue : **aliasing via `select`** pour limiter le diff et garder `poste.inscrits_actuels` partout côté JS (cohérent avec la consigne du plan : ne pas toucher les calculs JS locaux). Précision DoD : on aliase explicitement la colonne pour récupérer la nouvelle au nom de l'ancien.
- `src/js/modules/user/planning.js:387` — commentaire `// Find the full poste details from the loaded public_planning (this.postes)`. Pas de changement.

### Conséquence pour les ~20 autres occurrences de `inscrits_actuels`

Toutes les autres occurrences de `inscrits_actuels` (admin/index.js loadPostes, partials, user/wizard.js, user/planning.js reconcile/optimistic updates) lisent des objets JS locaux peuplés soit par la vue (alias appliqué), soit par un calcul JS (count sur inscriptions admin). → **FALSE POSITIVES** au regard de 5.0.6.

### Stratégie d'édition

Modifier uniquement `src/js/modules/user/planning.js:242` pour ajouter un `select` qui aliase :
```js
select: '*, inscrits_actuels:nb_inscrits_actuels'
```
ou (préférable car évite la double colonne dans le retour PostgREST — à vérifier au build) :
```js
select: 'poste_id, titre, description, periode_debut, periode_fin, nb_min, nb_max, liste_benevoles, inscrits_actuels:nb_inscrits_actuels'
```

**Fichiers à modifier (5.0.6)** : `src/js/modules/user/planning.js` (1 ligne).

---

## 5.0.7 — Fonction RPC `public_debit_cagnotte` → `debit_cagnotte_public`

### Grep `public_debit_cagnotte`

| Fichier | Ligne | Contenu | Décision |
|---|---|---|---|
| `src/js/debit.js` | 89 | `await supabase.rpc('public_debit_cagnotte', { ... })` | **À MODIFIER** → `'debit_cagnotte_public'` |

Init.sql l.172 confirme que la nouvelle fonction `debit_cagnotte_public(target_benevole_id uuid, montant_input numeric, description_input text)` existe avec la même signature.

**Fichiers à modifier (5.0.7)** : `src/js/debit.js` (1 ligne).

---

## 5.0.8 — Validation finale (smoke test)

À remplir après les 7 commits, en exécutant manuellement les parcours suivants sur Supabase local (`supabase start` actif, `.env.local` actif) :

| # | Zone | Action de test | Résultat attendu | PASS/FAIL |
|---|---|---|---|---|
| 1 | Admin visual-creator (5.0.1) | Ouvrir l'onglet visual-creator dans `admin.html`, sélectionner un jour | Pas de 404 `/rest/v1/programme`, la liste des événements programme se charge | **PASS** (Network: 200 sur `/rest/v1/programmes`) |
| 2 | Admin recap repas (5.0.2) | Ouvrir l'onglet récap → stats repas | `repasStats[x].vege` et `.normal` se remplissent correctement | **PASS** |
| 2b | Wizard benevole (5.0.2) | `index.html` → wizard → édition profil → cocher repas + végé → valider | Insert OK dans `benevole_repas` ; reload du profil → repas et état végé persistent | **PASS** |
| 3 | Scanner T-shirt (5.0.3) | `scanner-tshirt.html` → scanner un QR → marquer récupéré | `has_recupere_tshirt` passé à `true` côté DB ; widget tshirt côté benevole disparaît | **PASS** (anomalie UI hors-périmètre signalée — cf. `audit/notes.md`) |
| 3b | Widget t-shirt user (5.0.3) | `index.html` famille avec un membre déjà collecté | Masquage du widget si tous collectés, sinon count correct | **PASS** |
| 4 | Admin cagnotte forcée (5.0.4) | Onglet `cagnotte-forcee` → activer / désactiver pour un bénévole | Badge "FORCÉE" apparaît / disparaît, compteur "X actives" cohérent | **PASS** |
| 5 | Relance orphelin (5.0.5) | Onglet `admin-connexions.html` → relancer un orphelin | Edge Function `send-relance-orphelin` reçoit `auth_user_id` (Edge Function casse côté DB — limitation hors 5.0 cf. `audit/notes.md`) | **SKIP** (FAIL attendu — report sur Phase 8 lors de la correction de l'Edge Function) |
| 6 | Compteurs wizard étape postes (5.0.6) | `index.html` → wizard → étape sélection postes | Compteurs `inscrits / max` s'affichent ; pas d'`undefined` ; optimistic updates fonctionnent | **PASS** (test reformulé : l'affichage planning standalone d'`index.html` a été supprimé en amont — `loadPostes()` alimente désormais uniquement le wizard et les helpers de visibilité) |
| 7 | Débit cagnotte QR (5.0.7) | `debit.html` → scan QR + montant + valider | RPC `debit_cagnotte_public` renvoie OK ; transaction visible en DB | **PASS** |

**Bilan 5.0.8 — 2026-05-28** : 8/9 tests **PASS**, 1 **SKIP** (FAIL attendu hors-périmètre). Phase 5.0 close.

### Garde-fou CI (à ajouter avant Phase 8, hors 5.0)

Un check `grep` automatisé devra détecter dans `src/` (et `supabase/functions/`) tout usage des anciens noms : `'programme'`, `\bvegetarien\b` (sur `benevole_repas`), `t_shirt_recupere`, `\bcagnotte_forcee\b` (sans suffixe), `auth_user_id`, `public_planning.*inscrits_actuels`, `public_debit_cagnotte`. → Note à reporter dans `plan_refactoring.md` §5.0.8.

---

## Récapitulatif des fichiers touchés

| Sous-tâche | Fichiers | Nb d'occurrences |
|---|---|---|
| 5.0.1 | `src/js/admin-timeline.js`, `src/js/modules/admin/index.js` | 6 |
| 5.0.2 | `src/js/modules/admin/index.js`, `src/js/modules/user/wizard.js` | 7 |
| 5.0.3 | `src/js/scanner-tshirt.js`, `src/js/modules/user/tshirt.js` | 7 |
| 5.0.4 | `src/partials/sections/admin/tab-cagnotte-forcee.html`, `src/js/modules/admin/index.js` | 14 |
| 5.0.5 | (aucun fichier `src/` — commit doc) | 0 |
| 5.0.6 | `src/js/modules/user/planning.js` | 1 |
| 5.0.7 | `src/js/debit.js` | 1 |
| **TOTAL** | | **36** |

---

## Suivi des DoD individuelles (à remplir au fil des commits)

- [x] 5.0.1 — **2026-05-28** : 6 chaînes `'programme'` → `'programmes'` dans `src/js/admin-timeline.js:365` + `src/js/modules/admin/index.js:802,1609,2237,2439,2443`. `grep -rn "'programme'" src/js/` → `No matches found`. `npm run build` OK (163 modules, 2.91s). Smoke test visual-creator → différé en 5.0.8.
- [x] 5.0.2 — **2026-05-28** : 7 occurrences `vegetarien` → `is_vegetarien` (admin/index.js:1094 + wizard.js:23,231,297,355,362,373). `grep -rn "\bvegetarien\b" src/` → `No matches found`. `npm run build` OK. Smoke tests (récap repas + wizard édition) différés en 5.0.8.
- [x] 5.0.3 — **2026-05-28** : 7 occurrences `t_shirt_recupere` → `has_recupere_tshirt` (scanner-tshirt.js JSDoc + logique; user/tshirt.js logique widget). RPC `get_family_tshirt_info_smart` retourne désormais `has_recupere_tshirt` (cf. init.sql l.381). `grep -rn "t_shirt_recupere" src/` → 0. `npm run build` OK.
- [x] 5.0.4 — **2026-05-28** : 15 occurrences booléennes renommées (7 HTML + 8 JS). `grep "cagnotte_forcee[^_a-zA-Z]" src/` ne montre plus que des `is_cagnotte_forcee` ; `grep "cagnotte_forcee$" src/` = 0 ; les 42 occurrences `_type`/`_jours`/`_periodes_ids` intactes (vérifié par compte). Build OK.
- [x] 5.0.5 — **2026-05-28** : 0 changement `src/` (les 2 hits visent un contrat Edge Function et un paramètre RPC inchangés en 2.6). Entrée ajoutée à `audit/notes.md` documentant l'anomalie hors-périmètre : Edge Function `send-relance-orphelin/index.ts:150` casse sur la table renommée → à corriger Phase 8.
- [x] 5.0.6 — **2026-05-28** : `src/js/modules/user/planning.js:242` augmenté d'un `select: '*, inscrits_actuels:nb_inscrits_actuels'` qui aliase la colonne renommée de la vue vers le nom JS local. Les ~20 références JS à `.inscrits_actuels` (admin loadPostes calculé, wizard, reconcile, optimistic updates, partials) restent intactes conformément au plan. `admin-timeline.js:425` n'a pas besoin de modification (son `select` explicite n'inclut pas la colonne). Build OK.
- [x] 5.0.7 — **2026-05-28** : 1 ligne modifiée (`src/js/debit.js:89` — `supabase.rpc('public_debit_cagnotte', ...)` → `supabase.rpc('debit_cagnotte_public', ...)`). Signature de la fonction inchangée (init.sql l.172). `grep -rn "public_debit_cagnotte" src/` → 0. Build OK.
- [x] 5.0.8 — **2026-05-28** : tableau ci-dessus rempli. 8 PASS + 1 SKIP (test 5 relance orphelin — FAIL attendu hors-périmètre). Anomalie UI hors-périmètre détectée au passage (scanner-tshirt : impossible de changer la taille) consignée dans `audit/notes.md`.
