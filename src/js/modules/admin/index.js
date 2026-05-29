import Alpine from 'alpinejs';

/**
 * God object historique de la page admin.
 *
 * État de la migration (Phase 5.2.5) :
 *  - Le state partagé (postes, benevoles, periodes, dbProgramme, dbJours, repasList,
 *    config, stats, currentUser, loading, toasts, isAdmin, visualDays) vit dans
 *    `Alpine.store('admin')`. AdminModule l'expose ici via des getters/setters
 *    installés en bas de fichier — `this.X` lit/écrit `Alpine.store('admin').X`.
 *  - Les loaders sont des stubs qui délèguent au store ; ils restent ici pour le
 *    scope parent Alpine d'éventuels appels résiduels.
 *  - Tous les onglets ont été extraits dans `Alpine.data('admin<X>Tab', ...)`.
 *    AdminModule ne contient plus que la coquille (activeTab, délégations) et
 *    sera supprimé en Phase E.
 *
 * IMPORTANT : `admin.js` instancie cet objet via `Object.create(AdminModule)` (et non
 * un spread `...AdminModule`) pour préserver les getters du prototype.
 */
export const AdminModule = {
    activeTab: 'visual-creator',

    // Onglets migrés vers Alpine.data(...) :
    //   C1 — Heures        → adminHeuresTab
    //   C2 — Mailing       → adminMailingTab
    //   C3 — Référents     → adminReferentsTab
    //   C4 — Récap         → adminRecapTab
    //   C5 — Cagnotte forcée → adminCagnotteForceeTab
    //   C6 — Bénévoles     → adminBenevolesTab
    //   C7 — Configuration (visual-creator + repas + cagnotte/T-shirt)
    //                       → adminVisualCreatorTab

    getReferents() {
        return Alpine.store('admin').getReferents();
    },

    async loadData() {
        return Alpine.store('admin').loadData();
    },

    async loadJours() {
        return Alpine.store('admin').loadJours();
    },

    async loadPostes() {
        return Alpine.store('admin').loadPostes();
    },

    async loadBenevolesAndStats() {
        return Alpine.store('admin').loadBenevolesAndStats();
    },

    async loadPeriodes() {
        return Alpine.store('admin').loadPeriodes();
    },

    async loadProgramme() {
        return Alpine.store('admin').loadProgramme();
    },

    async loadConfig() {
        return Alpine.store('admin').loadConfig();
    },

    showToast(message, type = 'success') {
        return Alpine.store('admin').showToast(message, type);
    }
};

// --- Délégation du state partagé vers `Alpine.store('admin')` ---
// Installé sur le prototype après la définition du littéral. `admin.js` instancie
// AdminModule via `Object.create(AdminModule)` pour préserver ces getters/setters.
const SHARED_STATE_FIELDS = [
    'isAdmin', 'loading', 'currentUser', 'toasts',
    'postes', 'benevoles', 'periodes', 'dbProgramme', 'dbJours', 'repasList',
    'stats', 'config',
    'visualDays'
];

SHARED_STATE_FIELDS.forEach(field => {
    Object.defineProperty(AdminModule, field, {
        get() { return Alpine.store('admin')[field]; },
        set(v) { Alpine.store('admin')[field] = v; },
        enumerable: true,
        configurable: true
    });
});
