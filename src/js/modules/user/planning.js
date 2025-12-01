import { ApiService } from '../../services/api.js';
import { formatDate, formatTime } from '../../utils.js';

/**
 * Module for managing planning and inscriptions.
 * @namespace PlanningModule
 */
export const PlanningModule = {
    postes: [],
    userInscriptions: [],
    showMyInscriptions: false,
    showOnlyAvailable: false,
    selectedPosteForRegistration: null,

    // Expose utils to template
    formatDate,
    formatTime,

    /**
     * Loads all public planning postes.
     */
    async loadPostes() {
        try {
            const { data, error } = await ApiService.fetch('public_planning', {
                order: { column: 'periode_debut', ascending: true }
            });

            if (error) throw error;
            this.postes = data || [];
        } catch (error) {
            this.showToast('❌ Erreur chargement postes : ' + error.message, 'error');
        }
    },

    /**
     * Loads inscriptions for the current user's profiles.
     */
    async loadUserInscriptions() {
        if (!this.user) return;

        try {
            const { data, error } = await ApiService.fetch('inscriptions', {
                select: '*, postes(*)',
                eq: { benevole_id: this.user.id } // Note: RLS handles the "managed by user" check, but here we might need a different query if we want ALL managed inscriptions. 
                // The original code used .eq('benevole_id', this.user.id) which seems wrong if user.id is auth.uid but benevole_id is the profile id.
                // Let's check the original code... 
                // Original: .eq('benevole_id', this.user.id); 
                // Wait, in the original code, `this.user` is the auth user. `benevole_id` in inscriptions refers to the `benevoles` table ID.
                // If the user has multiple profiles, we need to fetch inscriptions for ALL of them.
                // The original code might have been buggy or I misunderstood.
                // Let's look at the migration: "Users can view managed inscriptions".
                // So we should probably just select * from inscriptions and let RLS filter it?
                // Or we need to get the list of profile IDs first.
                // For now, let's replicate the original logic but be aware it might need fixing.
                // Actually, let's improve it: we want all inscriptions where the benevole is managed by me.
                // Since we don't have a complex query builder here, let's rely on RLS returning only what we are allowed to see.
            });

            // Correction: The original code did .eq('benevole_id', this.user.id). This implies the user IS the benevole.
            // But the new system has profiles.
            // Let's trust RLS and just fetch all inscriptions we have access to.
            const { data: inscriptions, error: err } = await ApiService.fetch('inscriptions');

            if (err) throw err;
            this.userInscriptions = inscriptions || [];
        } catch (error) {
            console.error('Erreur chargement inscriptions:', error);
        }
    },

    /**
     * Opens the registration modal for a specific poste.
     * @param {object} poste - The poste to register for.
     */
    openRegistrationModal(poste) {
        this.selectedPosteForRegistration = poste;
    },

    /**
     * Closes the registration modal.
     */
    closeRegistrationModal() {
        this.selectedPosteForRegistration = null;
    },

    /**
     * Registers a profile for a poste.
     * @param {string} posteId - The ID of the poste.
     * @param {string} benevoleId - The ID of the profile.
     */
    async register(posteId, benevoleId) {
        if (!this.user || !benevoleId) return;

        this.loading = true;
        try {
            const { error } = await ApiService.insert('inscriptions', {
                poste_id: posteId,
                benevole_id: benevoleId
            });

            if (error) throw error;

            this.showToast('✅ Inscription réussie !', 'success');
            await this.loadPostes();
            await this.loadUserInscriptions();
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    /**
     * Unregisters a profile from a poste.
     * @param {string} posteId - The ID of the poste.
     * @param {string} benevoleId - The ID of the profile.
     */
    async unregister(posteId, benevoleId) {
        if (!this.user || !benevoleId) return;

        if (!confirm("Êtes-vous sûr de vouloir désinscrire ce bénévole ?")) return;

        this.loading = true;
        try {
            const { error } = await ApiService.delete('inscriptions', {
                poste_id: posteId,
                benevole_id: benevoleId
            });

            if (error) throw error;

            this.showToast('✅ Désinscription réussie', 'success');
            await this.loadPostes();
            await this.loadUserInscriptions();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    // --- Helpers ---

    /**
     * Checks if any managed profile is registered for a poste.
     * @param {string} posteId - The ID of the poste.
     * @returns {boolean} True if registered.
     */
    isUserRegistered(posteId) {
        return this.userInscriptions.some(i => i.poste_id == posteId);
    },

    /**
     * Checks if a specific profile is registered for a poste.
     * @param {string} posteId - The ID of the poste.
     * @param {string} profileId - The ID of the profile.
     * @returns {boolean} True if registered.
     */
    isProfileRegistered(posteId, profileId) {
        return this.userInscriptions.some(i => i.poste_id == posteId && i.benevole_id == profileId);
    },

    /**
     * Checks for time conflicts for a profile.
     * @param {object} poste - The poste to check against.
     * @param {string} [profileId=null] - Optional profile ID to check specific conflicts.
     * @returns {boolean} True if there is a conflict.
     */
    hasTimeConflict(poste, profileId = null) {
        const posteDebut = new Date(poste.periode_debut);
        const posteFin = new Date(poste.periode_fin);

        return this.userInscriptions.some(inscription => {
            if (profileId && inscription.benevole_id !== profileId) return false;
            if (inscription.poste_id == poste.poste_id) return false;

            // Ensure we have nested poste data (depends on fetch select)
            if (!inscription.postes) return false;

            const inscriptionDebut = new Date(inscription.postes.periode_debut);
            const inscriptionFin = new Date(inscription.postes.periode_fin);

            return (posteDebut < inscriptionFin) && (posteFin > inscriptionDebut);
        });
    },

    /**
     * Getter for filtered postes based on UI state.
     * @returns {object[]} Array of filtered postes.
     */
    get filteredPostes() {
        return this.postes.filter(poste => {
            if (this.showOnlyAvailable) {
                const isFull = poste.inscrits_actuels >= poste.nb_max;
                const isRegistered = this.isUserRegistered(poste.poste_id);
                if (isFull && !isRegistered) return false;
            }

            if (this.showMyInscriptions) {
                if (!this.isUserRegistered(poste.poste_id)) return false;
            }

            return true;
        });
    },

    /**
     * Getter for grouping postes by period.
     * @returns {object[]} Array of groups { name, postes, order }.
     */
    get groupedPostes() {
        const groups = {};
        this.filteredPostes.forEach(poste => {
            if (!groups[poste.periode]) {
                groups[poste.periode] = [];
            }
            groups[poste.periode].push(poste);
        });

        return Object.keys(groups).map(periode => {
            const postes = groups[periode];
            const ordre = postes.length > 0 ? (postes[0].periode_ordre || 0) : 0;
            return {
                name: periode,
                postes: postes,
                order: ordre
            };
        }).sort((a, b) => a.order - b.order);
    }
};
