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
    viewMode: 'list', // 'list' or 'week'
    calendarPage: 0,
    itemsPerPage: 4,
    PIXELS_PER_HOUR: 60,
    START_HOUR: 6, // 06:00
    END_HOUR: 28, // 04:00 next day (24 + 4)

    // Expose utils to template
    formatDate,
    formatTime,

    /**
     * Calculates the style for a poste in the calendar view.
     * @param {object} poste - The poste to position.
     * @returns {string} The style string (top, height).
     */
    getPosteStyle(poste) {
        const start = new Date(poste.periode_debut);
        const end = new Date(poste.periode_fin);

        // Calculate hours from start of day (START_HOUR)
        let startHour = start.getHours() + (start.getMinutes() / 60);
        let endHour = end.getHours() + (end.getMinutes() / 60);

        // Handle crossing midnight
        if (startHour < this.START_HOUR) startHour += 24;
        if (endHour < this.START_HOUR) endHour += 24;
        if (endHour < startHour) endHour += 24; // Should be covered by above, but safety

        const top = (startHour - this.START_HOUR) * this.PIXELS_PER_HOUR;
        const duration = endHour - startHour;
        const height = duration * this.PIXELS_PER_HOUR;

        return `top: ${top}px; height: ${height}px; position: absolute; width: 100%;`;
    },

    /**
     * Calculates the total height of the calendar container.
     * @returns {string} The height in pixels.
     */
    getCalendarHeight() {
        const totalHours = this.END_HOUR - this.START_HOUR;
        return (totalHours * this.PIXELS_PER_HOUR) + 'px';
    },

    toggleView() {
        this.viewMode = this.viewMode === 'list' ? 'week' : 'list';
        this.calendarPage = 0;
    },

    /**
     * Returns unique referents from the currently filtered postes.
     */
    getReferentsList() {
        const referents = new Map();
        this.filteredPostes().forEach(poste => {
            if (poste.referent_id && poste.referent_nom) {
                if (!referents.has(poste.referent_id)) {
                    referents.set(poste.referent_id, {
                        id: poste.referent_id,
                        nom: poste.referent_nom,
                        email: poste.referent_email,
                        telephone: poste.referent_telephone
                    });
                }
            }
        });
        return Array.from(referents.values());
    },

    /**
     * Helper to get all unique active dates based on current filters.
     */
    _getSortedActiveDates() {
        const sourcePostes = this.filteredPostes();
        if (sourcePostes.length === 0) return [];

        const uniqueDates = new Set();
        sourcePostes.forEach(p => {
            const date = new Date(p.periode_debut);
            date.setHours(0, 0, 0, 0);
            uniqueDates.add(date.getTime());
        });

        return Array.from(uniqueDates).sort((a, b) => a - b).map(time => new Date(time));
    },

    /**
     * Prepares data for the weekly calendar view.
     * Groups: Day -> Profile -> Postes
     * PAGINATED: Returns only itemsPerPage days.
     */
    getCalendarData() {
        const sortedDates = this._getSortedActiveDates();

        // Pagination logic
        const start = this.calendarPage * this.itemsPerPage;
        const visibleDates = sortedDates.slice(start, start + this.itemsPerPage);

        // Use the same source as dates to ensure consistency
        const sourcePostes = this.filteredPostes();

        // Build Data Structure
        return visibleDates.map(day => {
            const dayStr = day.toDateString();

            // For each profile, find their shifts on this day
            const profilesData = (this.profiles || []).map(profile => {
                const profilePostes = sourcePostes.filter(poste => {
                    const pDate = new Date(poste.periode_debut);
                    const isSameDay = pDate.toDateString() === dayStr;
                    const isRegistered = this.isProfileRegistered(poste.poste_id, profile.id);
                    return isSameDay && isRegistered;
                });

                // Sort by time
                profilePostes.sort((a, b) => new Date(a.periode_debut) - new Date(b.periode_debut));

                return {
                    profile: profile,
                    postes: profilePostes
                };
            });

            return {
                date: day,
                formattedDate: day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }),
                profiles: profilesData
            };
        });
    },

    nextPage() {
        if (this.hasNextPage()) {
            this.calendarPage++;
        }
    },

    prevPage() {
        if (this.hasPrevPage()) {
            this.calendarPage--;
        }
    },

    hasNextPage() {
        const totalDays = this._getSortedActiveDates().length;
        return (this.calendarPage + 1) * this.itemsPerPage < totalDays;
    },

    hasPrevPage() {
        return this.calendarPage > 0;
    },

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
            // We fetch all inscriptions. RLS ensures we only see what we are allowed to see.
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

        if (!await this.askConfirm("Êtes-vous sûr de vouloir désinscrire ce bénévole ?", "Désinscription")) return;

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
     * Method for filtered postes based on UI state.
     * @returns {object[]} Array of filtered postes.
     */
    filteredPostes() {
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
     * Method for grouping postes by period.
     * @returns {object[]} Array of groups { name, postes, order }.
     */
    groupedPostes() {
        const groups = {};
        this.filteredPostes().forEach(poste => {
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
