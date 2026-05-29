import Alpine from 'alpinejs';

/**
 * Coquille `adminApp` — Phase 5.2.5 (E.b).
 *
 * Tous les onglets sont des `Alpine.data(...)` autonomes ; le state partagé
 * vit dans `Alpine.store('admin')`. Cette coquille n'expose plus que les
 * trois champs utilisés par le scope racine de `admin.html` :
 *  - `isAdmin` / `loading` : bandeaux d'accès et de chargement
 *  - `toasts`              : `toast.html` (inclu au niveau racine)
 *
 * `activeTab` reste un champ local (lu par `tabs.html`, non partagé entre pages).
 *
 * IMPORTANT : `admin.js` instancie cet objet via `Object.create(AdminModule)`
 * pour préserver les getters/setters du prototype. Suppression complète prévue
 * en phase E.c (inlining direct dans `Alpine.data("adminApp", ...)`).
 */
export const AdminModule = {
    activeTab: 'visual-creator',
};

const SHARED_STATE_FIELDS = ['isAdmin', 'loading', 'toasts'];

SHARED_STATE_FIELDS.forEach(field => {
    Object.defineProperty(AdminModule, field, {
        get() { return Alpine.store('admin')[field]; },
        set(v) { Alpine.store('admin')[field] = v; },
        enumerable: true,
        configurable: true
    });
});
