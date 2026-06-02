# Audit 24 — Refactor admin god object → `Alpine.store` + `Alpine.data`

> Phase 5.2.5 du `plan_refactoring.md` **(fusion 5.2.5 + ex-5.2.8)**.
> Cible : éliminer le god object `adminApp()` (3073 lignes) ET le couplage cross-page `__x.$data` admin↔timeline en **une seule passe** vers l'architecture cible.
> Date : 2026-05-28

---

## 0. Décision d'architecture

L'option initiale du plan ("découper en sous-modules spread, puis plus tard remplacer `__x.$data` par un store") a été rejetée :
- Deux refacto successives sur le même code → double fenêtre de risque + double test surface admin.
- L'étape intermédiaire (god object spread) n'est jamais l'architecture cible — code mort dès qu'il est livré.
- Le couplage `__x.$data` doit être traité quand on touche visual-creator de toute façon — bundler ces deux changements est plus atomique que les séparer.

**Cible retenue** :
- `Alpine.store('admin', { ... })` : state partagé + loaders transverses + helpers globaux.
- `Alpine.store('visualProgram', { ... })` : remplace `__x.$data` admin↔timeline (chargé sur admin.html ET besoins.html).
- 7 × `Alpine.data('admin<X>Tab', () => ({ ... }))` : un par onglet UI, consomme `$store.admin`.
- 2 utils purs : `utils/admin-time.js`, `utils/admin-shift-validation.js`.
- `adminApp()` supprimé en fin de course.

---

## 1. Audit éclair des conditions préalables (2026-05-28)

### 1.1 `adminTimelineApp` utilisé hors `admin.html` ?

✅ **Oui** : `adminTimelineApp` est instancié dans `besoins.html` (ligne 29), pas dans `admin.html`. Le couplage actuel `__x.$data` dans `src/js/modules/admin/index.js` (lignes 1427, 2473) est défensif (`if (timelineAppEl && ...)`) → fonctionne même si l'élément n'existe pas (fallback sur `this.dbProgramme`).

**Implication** : `Alpine.store('visualProgram')` doit être chargé sur **les deux pages**. Code partagé via `src/js/stores/visual-program.js` importé par `admin.js` et `besoins.js` (entrypoints Vite).

### 1.2 Partials admin utilisent `$parent.X` ou scope inherited ?

✅ **Aucun `$parent`** dans `src/partials/sections/admin/*.html`.
⚠️ **Méthodes globales consommées par les partials** :
- `getReferents()` est appelée depuis `tab-visual-creator.html` (l. 535, 614).
- `formatDateTime`, `formatTime` exposés comme props sur `adminApp` (l. 90-92 de l'index.js).
- `showToast` appelé partout (mais via méthode du composant, pas via global).

**Implication** : ces helpers doivent être exposés via `$store.admin` (ex : `$store.admin.getReferents()`) plutôt que dupliqués dans chaque `Alpine.data`.

### 1.3 Décision de gouvernance

✅ Fusion 5.2.5 + 5.2.8 validée par le mainteneur (2026-05-28). `plan_refactoring.md` réécrit en conséquence.

---

## 2. Inventaire des onglets UI réels

Onglets effectivement présents dans `src/partials/sections/admin/tabs.html` :

| # | `activeTab` | Partial | `Alpine.data` cible |
|---|---|---|---|
| 1 | `visual-creator` (défaut) | `tab-visual-creator.html` | `adminVisualCreatorTab` |
| 2 | `referents` | `tab-referents.html` | `adminReferentsTab` |
| 3 | `benevoles` | `tab-benevoles.html` | `adminBenevolesTab` |
| 4 | `cagnotte-forcee` | `tab-cagnotte-forcee.html` | `adminCagnotteTab` |
| 5 | `mailing` | `tab-mailing.html` | `adminMailingTab` |
| 6 | `recap` | `tab-recap.html` | `adminRecapTab` |
| 7 | `heures` | `tab-heures.html` | `adminHeuresTab` |

---

## 3. Cartographie state / méthodes → cible

### 3.1 `Alpine.store('admin')` — state + loaders + helpers transverses

**State partagé (consommé par ≥ 2 onglets) :**
- `postes`, `benevoles`, `periodes`, `dbProgramme`, `dbJours`, `repasList`, `config`, `stats`
- `currentUser`, `isAdmin`, `loading`

**Loaders transverses :**
- `loadData()` (orchestrateur)
- `loadJours()`, `loadPeriodes()`, `loadProgramme()`, `loadConfig()`, `loadRepas()`
- `loadPostes()`
- `loadBenevolesAndStats()` (alimente `benevoles` + déclenche `calculateStats`)

**Helpers globaux :**
- `showToast(message, type)`
- `getReferents()`
- Réexports `formatDateTime`, `formatDateTimeForInput`, `formatTime` (depuis `utils.js`).

⚠️ `calculateStats()` est **appelée depuis le store** (fin de `loadBenevolesAndStats`) mais sa logique appartient à `recap`. Décision : la **garder dans le store** (consommée transversalement via mutation de `$store.admin.stats`).

### 3.2 `Alpine.store('visualProgram')` — couplage admin↔timeline

Remplace les 3 occurrences `document.querySelector('[x-data="adminTimelineApp()"]').__x.$data` (lignes 1427, 2473, 2474).

**State partagé :**
- `dbProgramme` (synchronisé entre visual-creator de admin et timeline de besoins.html)

**Méthodes :**
- `loadProgramme()` : appelable depuis l'un ou l'autre composant.
- `loadPostes()` : idem.

Chaque composant consomme `$store.visualProgram.dbProgramme` et appelle `$store.visualProgram.loadProgramme()` quand il a besoin de refresh.

### 3.3 `Alpine.data('adminBenevolesTab', () => ({ ... }))`

**State local de l'onglet :**
- `searchQuery`, `benevolesSort`
- `showDetailsModal`, `showEditModal`, `selectedBenevoleName`, `currentBenevole`
- `selectedBenevoleInscriptions`, `newInscriptionForm`
- `showAddBenevoleModal`, `newBenevoleForm`

**Méthodes :**
- `getBenevolesStandardAvecInscriptions()`, `getBenevolesStandardSansInscriptions()`
- `getFilteredBenevoles()`
- `exportBenevolesExcel()`
- `getPostesForSelectedPeriod()`
- `viewBenevoleInscriptions()`, `openEditBenevoleInscriptions()`, `refreshBenevoleInscriptions()`
- `deleteInscription()`, `addInscription()`, `closeInscriptionsModal()`
- `openAddBenevoleModal()`, `closeAddBenevoleModal()`, `createBenevole()`
- `updateBenevoleRole()`

### 3.4 `Alpine.data('adminVisualCreatorTab', () => ({ ... }))`

**State local** (volumineux — voir §1.3 de la version précédente de cet audit) : `visualDaySelected`, `visualDays`, `visualProgramEvents`, `visualPeriods`, `visualLines`, `dragState`, `hoursRange`, `periodConflicts`, `autoSaveStatus`, `autoSaveTimeout`, `isSavingVisual`, `hasPendingChanges`, `showAddDayModal`, `newDayDate`, `selectedPeriodFilterId`, `showPeriodCreditModal`, `editPeriodCreditData`, `periodDragState`, `showAddShiftModal`, `addShiftData`, `showEditShiftModal`, `editShiftData`, `hoveredShift`, `isDrawingShift`, `drawingLineIndex`, `drawingState`, `lineDragTimer`, `lineDragState`, `visualDeletedPosteIds`, `visualDeletedPeriodIds`, `visualDeletedEventIds`, `visualDeletedTypePosteTitres`.

**Méthodes** (~40) : voir §1.3 audit précédent.

⚠️ **Taille estimée** : ~1500 lignes après extraction des 2 utils. Si > 800 lignes : sous-découpage interne (`admin-visual-creator/{state,drag,save}.js`) — à décider au moment du commit C7.

### 3.5 `Alpine.data('adminReferentsTab', () => ({ ... }))`

State : `referentAssignments`, `uniquePosteTitres`.
Méthodes : `initReferentAssignments()`, `addReferentAssignmentLine()`, `removeReferentAssignmentLine()`, `getPeriodesForTitre()`, `getOrphanPostes()`, `saveReferentAssignments()`.

### 3.6 `Alpine.data('adminCagnotteTab', () => ({ ... }))`

State : `forcedSearchQuery`, `selectedForcedBenevole`, `forcedForm`.
Méthodes : `toggleCagnotte()`, `saveForcedJourneeTarif()`, `selectBenevoleForCagnotte()`, `saveCagnotteForcee()`, `revertCagnotteForcee()`.

### 3.7 `Alpine.data('adminMailingTab', () => ({ ... }))`

State : `mailingFilterRole`, `mailingFilterAssignation`, `mailingPostLines`.
Méthodes : `addMailingPostLine()`, `removeMailingPostLine()`, `getSlotsForPostTitle()`, `getFilteredMailingBenevoles()`, `getFilteredMailingEmails()`, `copyMailingEmails()`.

### 3.8 `Alpine.data('adminRecapTab', () => ({ ... }))`

State : `newRepasName`, `editingRepasId`, `editingRepasName`, `toggleTshirtQuestion`.
Méthodes : `addRepas()`, `deleteRepas()`, `startEditRepas()`, `cancelEditRepas()`, `saveEditRepas()`, `toggleTshirtQuestion()`.

Note : `calculateStats()` et `loadRepas()` restent dans `$store.admin` (consommés transversalement).

### 3.9 `Alpine.data('adminHeuresTab', () => ({ ... }))`

Méthodes : `getHeuresParPeriode()`, `getTotalHeures()`.
Aucun state local. Lecture seule sur `$store.admin.{postes,periodes}`.

### 3.10 `utils/admin-time.js`

Fonctions pures : `getLocalDateKey(iso)`, `formatDecimalHour(dec)`, `formatDay(dayKey)`, `formatDecimalToISO(dec, dayStr)`.

### 3.11 `utils/admin-shift-validation.js`

Fonctions pures : logique de `validateAndAutoAssignPeriods` (calcul d'overlap, snapping 0.25h, détection conflits).

---

## 4. Sous-tâches (commits atomiques)

### A — Extraction utils purs
- Créer `src/js/utils/admin-time.js` et `src/js/utils/admin-shift-validation.js`.
- `index.js` importe et délègue. Pas de changement de comportement.
- **DoD :** `npm run build` OK + `admin.html` charge sans regression + extraction visible dans `git diff`.

### B — Créer `Alpine.store('admin')`
- Créer `src/js/stores/admin.js` exportant un `Alpine.store('admin', { ... })`.
- Migrer le state partagé + loaders + helpers depuis `index.js` vers le store.
- `adminApp()` consomme `$store.admin.X` pour ces champs (proxy minimal).
- **DoD :** Tous les onglets fonctionnent identiquement (test manuel par onglet, documenté §5).

### C — Convertir chaque onglet en `Alpine.data` (7 commits)

Ordre proposé : du plus simple au plus complexe.

| # | Onglet | Justification de l'ordre |
|---|---|---|
| C1 | `heures` | 2 méthodes pures, zéro state local, zéro CRUD → valide la mécanique |
| C2 | `mailing` | State local simple, lecture seule sur store |
| C3 | `referents` | CRUD modéré sur store |
| C4 | `recap` | CRUD repas + config flags |
| C5 | `cagnotte-forcee` | CRUD + state form |
| C6 | `benevoles` | Plus gros, multiples modals |
| C7 | `visual-creator` | Énorme, à faire en dernier (avec sous-découpage si > 800 lignes) |

**Procédure par commit :**
1. Créer `src/js/components/admin/admin-<x>-tab.js` avec `Alpine.data('admin<X>Tab', () => ({ ... }))`.
2. Modifier `src/partials/sections/admin/tab-<x>.html` : ajouter `x-data="admin<X>Tab"` sur l'élément racine.
3. Supprimer les méthodes/state correspondants de `src/js/modules/admin/index.js`.
4. Importer le nouveau composant dans `src/js/admin.js`.
5. Build + test manuel onglet + non-régression autres onglets.

**DoD par commit :** documenté dans §5 ci-dessous.

### D — Élimination du couplage `__x.$data` admin↔timeline

**Plan initial révisé après audit (2026-05-29)** : la création de `Alpine.store('visualProgram')` était prévue pour synchroniser `dbProgramme` entre `adminVisualCreatorTab` et `adminTimelineApp`. L'audit a montré que **le couplage `__x.$data` était du code mort** : `adminTimelineApp` n'est monté que dans `besoins.html`, jamais dans `admin.html`. Les deux `document.querySelector('[x-data="adminTimelineApp()"]')` retournaient toujours `null` ; les `if (timelineAppEl && ...)` no-opaient silencieusement. Aucun store partagé n'est nécessaire : chaque page possède son propre loader `dbProgramme`.

D s'est donc résumé à supprimer les deux blocs de code mort dans `adminVisualCreatorTab` (`selectVisualDay` + `saveVisualCreator`).

- **DoD :** `grep -rn "__x" src/js/` → vide ; `grep -rn "adminTimelineApp" src/js/components/` → vide.

### E — Supprimer le god object `AdminModule`

**Réalisation effective** : en E.b la coquille a été réduite à 4 propriétés racine (`activeTab` + getters `isAdmin`/`loading`/`toasts`) ; en E.c ces 4 propriétés ont été inlinées dans la factory `Alpine.data("adminApp", ...)` de `admin.js`, et `src/js/modules/admin/index.js` supprimé.

`admin.html` conserve `x-data="adminApp()"` sur `<body>` (factory triviale d'objet littéral), mais l'objet `AdminModule` exporté avec ses getters/setters de prototype et son pattern `Object.create` n'existe plus.

- **DoD :** `src/js/modules/admin/index.js` supprimé ; `grep -rn "AdminModule" src/` → vide ; `grep -rn "Object.create" src/js/admin.js` → vide ; admin.html charge sans erreur, tous les onglets fonctionnels.

---

## 5. Résultats par commit (à remplir)

| Commit | Sous-tâche | Build | Onglet testé | Régression autres | Lignes supprimées de index.js | Date |
|---|---|---|---|---|---|---|
| _A_ | Utils extraction | ✅ | N/A | OK | −113 (3073→2960) | 2026-05-28 |
| _B_ | Store admin | ✅ | tous | OK | −375 (2960→2585) | 2026-05-28 |
| `a223be7` | C1 — heures | ✅ | heures | OK | −39 (2585→2546) | 2026-05-28 |
| `a223be7`+1 | C2 — mailing | ✅ | mailing | OK (referents via proxy dérivé) | −87 (2546→2459) | 2026-05-28 |
| `97083de`+1 | C3.a — referents (refactor pur) | ✅ | referents | OK | −125 (2459→2334) | 2026-05-28 |
| `55478f3`+1 | C3.b — referents (bug type_postes) | ✅ | referents | OK (mailing inchangé) | 0 | 2026-05-29 |
| `353f317`+1 | C3.c — referents (bug slot pris) | ✅ | referents | OK | 0 | 2026-05-29 |
| `fd65007`+1 | C3.d — referents (encart save) | ✅ | referents | OK | 0 | 2026-05-29 |
| `a460bfa`+1 | C4 — recap | ✅ | recap | OK | 0 | 2026-05-29 |
| `b0945a0`+1 | C5 — cagnotte-forcee | ✅ | cagnotte-forcee | OK | −145 (2334→2189) | 2026-05-29 |
| `a51c509`+1 | C6 — benevoles (+ 2 bug fixes) | ✅ | benevoles | OK | −392 (2189→1797) | 2026-05-29 |
| `f1485e5` | C7.a — hoist `visualDays` vers store | ✅ | cagnotte-forcee + visual-creator | OK | 0 | 2026-05-29 |
| `5333982` | C7.b — extract visual-creator (+ 2 bug fixes DB sync) | ✅ | visual-creator | OK | −1710 (1797→87) | 2026-05-29 |
| `5ed7460` | D — suppression couplage mort `__x.$data` | ✅ | visual-creator | OK | 0 (sur composant) | 2026-05-29 |
| `95cbaee` | E.a — proxy `visualDays` dans cagnotte-forcee | ✅ | cagnotte-forcee | OK | 0 | 2026-05-29 |
| `78f2dba` | E.b — réduction `AdminModule` à coquille root-scope | ✅ | tous | OK | −56 (87→31) | 2026-05-29 |
| `98ee4f3` | E.c — suppression god object (fichier supprimé) | ✅ | tous | OK | −31 (31→0) | 2026-05-29 |

---

## 6. DoD globale 5.2.5 — **Clôturée le 2026-05-29**

- [x] `src/js/modules/admin/index.js` supprimé (commit `98ee4f3`).
- [x] `grep -rn "__x" src/js/` ne retourne rien (commit `5ed7460`).
- [x] `grep -rn "AdminModule" src/` ne retourne rien (commit `98ee4f3`).
- [x] Chaque onglet admin a été testé manuellement et documenté §5.
- [x] Aucun fichier dans `src/js/components/admin/*.js` ne dépasse 500 lignes — **exception justifiée** : `admin-visual-creator-tab.js` (~1660 lignes). Cohésion forte (édition Gantt interactive : drag-and-drop, validation auto, autosave, ~30 méthodes inter-dépendantes). Sous-découpage interne possible (`state/drag/save`) mais non prioritaire — toutes les méthodes opèrent sur le même state local volumineux.
- [x] **Synchronisation bi-directionnelle admin↔besoins (timeline)** — critère caduc : audit D a démontré que le couplage `__x.$data` était du code mort (cf. §4 D). Aucun mécanisme de synchronisation à tester. Chaque page charge son propre `dbProgramme`.

**Bilan chiffré :**
- `src/js/modules/admin/index.js` : 3073 → 0 lignes.
- Architecture finale : 1 store (`Alpine.store('admin')`), 7 composants `Alpine.data('admin<X>Tab')` autonomes, 2 utils purs (`admin-time`, `admin-shift-validation`), factory `adminApp` triviale (4 propriétés + `init`) inlinée dans `admin.js`.
- Couplage `__x.$data` : éliminé.
