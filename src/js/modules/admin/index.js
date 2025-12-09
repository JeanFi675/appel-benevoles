import { ApiService } from '../../services/api.js';
import { formatDateTime, formatDateTimeForInput, formatTime } from '../../utils.js';

/**
 * Module for managing admin operations (Postes, Periodes, Benevoles).
 * @namespace AdminModule
 */
export const AdminModule = {
    isAdmin: false,
    loading: true,
    activeTab: 'postes',
    toasts: [],

    // Data
    postes: [],
    benevoles: [],
    periodes: [],

    // Search & Modal
    searchQuery: '',
    selectedBenevoleInscriptions: [],
    showDetailsModal: false, // Read-only modal
    showEditModal: false,    // Edit/Add modal
    selectedBenevoleName: '',
    currentBenevole: null,

    // Add Inscription Form
    newInscriptionForm: {
        periode_id: '',
        poste_id: ''
    },

    // Forms
    editingPoste: null,
    posteForm: {
        titre: '',
        periode_id: '',
        periode_debut: '',
        periode_fin: '',
        referent_id: '',
        description: '',
        nb_min: 1,
        nb_max: 5
    },
    periodeForm: {
        nom: '',
        ordre: 1
    },

    // Expose utils
    formatDateTime,
    formatDateTimeForInput,

    getReferents() {
        return this.benevoles.filter(b => b.role === 'referent' || b.role === 'admin');
    },

    getFilteredBenevoles() {
        if (!this.searchQuery) return this.benevoles;
        const lowerQuery = this.searchQuery.toLowerCase();
        return this.benevoles.filter(b =>
            (b.nom && b.nom.toLowerCase().includes(lowerQuery)) ||
            (b.prenom && b.prenom.toLowerCase().includes(lowerQuery)) ||
            (b.email && b.email.toLowerCase().includes(lowerQuery))
        );
    },

    // Computed for form
    getPostesForSelectedPeriod() {
        if (!this.newInscriptionForm.periode_id) return [];
        // Filter posts by period and sort them
        return this.postes
            .filter(p => p.periode_id === this.newInscriptionForm.periode_id)
            .sort((a, b) => a.titre.localeCompare(b.titre));
    },

    async viewBenevoleInscriptions(benevole) {
        this.currentBenevole = benevole;
        this.selectedBenevoleName = `${benevole.prenom} ${benevole.nom}`;
        this.selectedBenevoleInscriptions = [];
        this.showDetailsModal = true; // Use specific flag for read-only
        await this.refreshBenevoleInscriptions();
    },

    async openEditBenevoleInscriptions(benevole) {
        this.currentBenevole = benevole;
        this.selectedBenevoleName = `${benevole.prenom} ${benevole.nom}`;
        this.selectedBenevoleInscriptions = [];
        this.newInscriptionForm = { periode_id: '', poste_id: '' }; // Reset form
        this.showEditModal = true; // Use specific flag for edit
        await this.refreshBenevoleInscriptions();
    },

    async refreshBenevoleInscriptions() {
        if (!this.currentBenevole) return;

        try {
            const { data, error } = await ApiService.fetch('inscriptions', {
                select: '*, postes(titre, periodes(nom, ordre), periode_debut, periode_fin)',
                eq: { benevole_id: this.currentBenevole.id }
            });

            if (error) throw error;

            this.selectedBenevoleInscriptions = (data || []).map(i => {
                const debut = i.postes?.periode_debut ? formatTime(i.postes.periode_debut) : '';
                const fin = i.postes?.periode_fin ? formatTime(i.postes.periode_fin) : '';

                return {
                    ...i,
                    poste_titre: i.postes?.titre || 'Poste inconnu',
                    periode_nom: i.postes?.periodes?.nom || 'Période inconnue',
                    periode_ordre: i.postes?.periodes?.ordre || 999,
                    horaire: (debut && fin) ? `${debut} - ${fin}` : ''
                };
            }).sort((a, b) => a.periode_ordre - b.periode_ordre);

        } catch (error) {
            this.showToast('❌ Erreur chargement inscriptions : ' + error.message, 'error');
        }
    },

    async deleteInscription(inscriptionId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette inscription ?')) return;

        // Optimistic UI update
        const originalList = [...this.selectedBenevoleInscriptions];
        this.selectedBenevoleInscriptions = this.selectedBenevoleInscriptions.filter(i => i.id !== inscriptionId);

        try {
            const { error } = await ApiService.delete('inscriptions', { id: inscriptionId });
            if (error) throw error;

            this.showToast('✅ Inscription supprimée', 'success');

            // Global refresh
            this.loadBenevoles();
            this.loadPostes();

        } catch (error) {
            this.selectedBenevoleInscriptions = originalList;
            this.showToast('❌ Erreur suppression : ' + error.message, 'error');
        }
    },

    async addInscription() {
        if (!this.newInscriptionForm.periode_id || !this.newInscriptionForm.poste_id) {
            this.showToast('⚠️ Veuillez sélectionner une période et un poste.', 'warning');
            return;
        }

        const poste = this.postes.find(p => p.id === this.newInscriptionForm.poste_id);
        // Basic check, though backend might also enforce constraint
        // Check if already registered?
        const alreadyRegistered = this.selectedBenevoleInscriptions.some(i => i.poste_id === this.newInscriptionForm.poste_id);
        if (alreadyRegistered) {
            this.showToast('⚠️ Ce bénévole est déjà inscrit à ce poste.', 'warning');
            return;
        }

        this.loading = true;
        try {
            const payload = {
                benevole_id: this.currentBenevole.id,
                poste_id: this.newInscriptionForm.poste_id
            };

            const { error } = await ApiService.insert('inscriptions', payload);
            if (error) throw error;

            this.showToast('✅ Inscription ajoutée !', 'success');

            // Reset form
            this.newInscriptionForm = { periode_id: '', poste_id: '' };

            // Refresh
            await this.refreshBenevoleInscriptions();
            this.loadBenevoles();
            this.loadPostes();

        } catch (error) {
            this.showToast('❌ Erreur ajout : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    closeInscriptionsModal() {
        this.showDetailsModal = false;
        this.showEditModal = false;
        this.selectedBenevoleInscriptions = [];
        this.selectedBenevoleName = '';
        this.currentBenevole = null;
    },

    /**
     * Loads all admin data.
     */
    async loadData() {
        await this.loadBenevoles();
        await Promise.all([
            this.loadPostes(),
            this.loadPeriodes()
        ]);
    },

    /**
     * Loads postes with inscription counts.
     */
    async loadPostes() {
        try {
            const { data, error } = await ApiService.fetch('postes', {
                select: '*, periodes(nom, ordre)'
            });

            if (error) throw error;

            // Count inscriptions manually as Supabase JS client doesn't support count in select easily without foreign key alias tricks sometimes
            // But we can do it in a loop or use a view. The original code used a loop.
            const postesWithCounts = await Promise.all(
                (data || []).map(async (poste) => {
                    const { data: inscriptions } = await ApiService.fetch('inscriptions', { eq: { poste_id: poste.id } });
                    const count = inscriptions ? inscriptions.length : 0;

                    let referentIdentite = '-';
                    if (poste.referent_id) {
                        const referent = this.benevoles.find(b => b.id === poste.referent_id);
                        if (referent) {
                            referentIdentite = `${referent.prenom} ${referent.nom}`;
                        }
                    }

                    return {
                        ...poste,
                        periode_nom: poste.periodes?.nom || '-',
                        periode_ordre: poste.periodes?.ordre || 999,
                        inscrits_actuels: count,
                        referent_identite: referentIdentite
                    };
                })
            );

            this.postes = postesWithCounts.sort((a, b) => {
                if (a.periode_ordre !== b.periode_ordre) {
                    return a.periode_ordre - b.periode_ordre;
                }
                return new Date(a.periode_debut) - new Date(b.periode_debut);
            });
        } catch (error) {
            this.showToast('❌ Erreur chargement postes : ' + error.message, 'error');
        }
    },

    async loadBenevoles() {
        try {
            const { data, error } = await ApiService.fetch('admin_benevoles', {
                order: { column: 'nom', ascending: true }
            });
            if (error) throw error;
            this.benevoles = data || [];
        } catch (error) {
            this.showToast('❌ Erreur chargement bénévoles : ' + error.message, 'error');
        }
    },

    async loadPeriodes() {
        try {
            const { data, error } = await ApiService.fetch('periodes', {
                order: { column: 'ordre', ascending: true }
            });
            if (error) throw error;
            this.periodes = data || [];
        } catch (error) {
            this.showToast('❌ Erreur chargement périodes : ' + error.message, 'error');
        }
    },

    // --- Actions ---

    async savePoste() {
        this.loading = true;
        try {
            const payload = {
                ...this.posteForm,
                referent_id: this.posteForm.referent_id || null
            };

            if (this.editingPoste) {
                const { error } = await ApiService.update('postes', payload, { id: this.editingPoste.id });
                if (error) throw error;
                this.showToast('✅ Poste modifié avec succès !', 'success');
            } else {
                const { error } = await ApiService.insert('postes', payload);
                if (error) throw error;
                this.showToast('✅ Poste créé avec succès !', 'success');
            }

            this.editingPoste = null;
            this.resetPosteForm();
            await this.loadPostes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    async deletePoste(id) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce poste ?')) return;
        this.loading = true;
        try {
            const { error } = await ApiService.delete('postes', { id });
            if (error) throw error;
            this.showToast('✅ Poste supprimé', 'success');
            await this.loadPostes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    editPoste(poste) {
        this.editingPoste = poste;
        this.posteForm = {
            titre: poste.titre,
            periode_id: poste.periode_id,
            periode_debut: formatDateTimeForInput(poste.periode_debut),
            periode_fin: formatDateTimeForInput(poste.periode_fin),
            referent_id: poste.referent_id || '',
            description: poste.description || '',
            nb_min: poste.nb_min,
            nb_max: poste.nb_max
        };
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    cancelEdit() {
        this.editingPoste = null;
        this.resetPosteForm();
    },

    resetPosteForm() {
        this.posteForm = {
            titre: '',
            periode_id: '',
            periode_debut: '',
            periode_fin: '',
            referent_id: '',
            description: '',
            nb_min: 1,
            nb_max: 5
        };
    },

    // --- Periodes ---

    async createPeriode() {
        this.loading = true;
        try {
            const { error } = await ApiService.insert('periodes', this.periodeForm);
            if (error) throw error;
            this.showToast('✅ Période créée avec succès !', 'success');
            this.periodeForm = { nom: '', ordre: this.periodes.length + 1 };
            await this.loadPeriodes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    async updatePeriodeOrder(periodeId, newOrder) {
        try {
            const { error } = await ApiService.update('periodes', { ordre: parseInt(newOrder) }, { id: periodeId });
            if (error) throw error;
            this.showToast('✅ Ordre mis à jour', 'success');
            await this.loadPeriodes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        }
    },

    async renamePeriode(periode) {
        const newName = prompt("Nouveau nom de la période :", periode.nom);
        if (newName && newName.trim() !== "" && newName !== periode.nom) {
            await this.updatePeriodeName(periode.id, newName.trim());
        }
    },

    async updatePeriodeName(periodeId, newName) {
        this.loading = true;
        try {
            const { error } = await ApiService.update('periodes', { nom: newName }, { id: periodeId });
            if (error) throw error;
            this.showToast('✅ Nom de la période mis à jour', 'success');
            await this.loadPeriodes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    async deletePeriode(periodeId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette période ?')) return;
        this.loading = true;
        try {
            const { error } = await ApiService.delete('periodes', { id: periodeId });
            if (error) throw error;
            this.showToast('✅ Période supprimée', 'success');
            await this.loadPeriodes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    getPostesCountForPeriode(periodeId) {
        return this.postes.filter(p => p.periode_id === periodeId).length;
    },

    // --- Benevoles ---

    async updateBenevoleRole(benevoleId, newRole) {
        try {
            const { error } = await ApiService.update('benevoles', { role: newRole }, { id: benevoleId });
            if (error) throw error;

            // If demoted to simple volunteer, remove them from being referent on any post
            if (newRole === 'benevole') {
                const { error: updatePostesError } = await ApiService.updateMany('postes', { referent_id: null }, { referent_id: benevoleId });
                if (updatePostesError) {
                    console.error('Error removing referent from posts:', updatePostesError);
                    this.showToast('⚠️ Rôle changé, mais erreur lors du retrait des postes.', 'warning');
                } else {
                    // Refresh postes to reflect the change
                    await this.loadPostes();
                }
            }

            const roleNames = { 'benevole': 'Bénévole', 'referent': 'Référent', 'admin': 'Admin' };
            this.showToast(`✅ Rôle changé en ${roleNames[newRole]}`, 'success');
            await this.loadBenevoles();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
            await this.loadBenevoles();
        }
    },

    // --- Helpers ---

    showToast(message, type = 'success') {
        const id = Date.now();
        this.toasts.push({ id, message, type });
        setTimeout(() => {
            this.toasts = this.toasts.filter(t => t.id !== id);
        }, 5000);
    }
};
