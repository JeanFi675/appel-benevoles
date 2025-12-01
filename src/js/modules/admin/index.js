import { ApiService } from '../../services/api.js';
import { formatDateTime, formatDateTimeForInput } from '../../utils.js';

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

    get referents() {
        return this.benevoles.filter(b => b.role === 'referent');
    },

    /**
     * Loads all admin data.
     */
    async loadData() {
        await Promise.all([
            this.loadPostes(),
            this.loadBenevoles(),
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
                    const { data: _unused } = await ApiService.fetch('inscriptions', {
                        eq: { poste_id: poste.id },
                        select: '*', // We just want count, but fetch helper defaults to select *
                        // Actually our helper doesn't support count only.
                        // Let's just use the raw supabase client for this specific count query if needed, 
                        // or accept fetching data. 
                        // Optimization: create a view in SQL later. For now, keep original logic.
                    });

                    // Wait, our helper returns { data, error }. It doesn't return count.
                    // We need to fix this or use raw supabase.
                    // Let's import supabase directly for this specific complex query or update ApiService.
                    // For simplicity in this refactor, let's assume we can add a count option to ApiService or just import supabase here.
                    // I'll use the ApiService but I need to update it to support count? 
                    // No, let's just use the raw client for this specific "count" feature to avoid over-engineering the generic service.
                    // But I can't import supabase here easily without breaking the pattern.
                    // Let's add a `count` method to ApiService?
                    // Or just fetch all inscriptions and count length (inefficient but works for small data).
                    // Given the constraint, let's fetch all inscriptions for the poste.

                    const { data: inscriptions } = await ApiService.fetch('inscriptions', { eq: { poste_id: poste.id } });
                    const count = inscriptions ? inscriptions.length : 0;

                    return {
                        ...poste,
                        periode_nom: poste.periodes?.nom || '-',
                        periode_ordre: poste.periodes?.ordre || 999,
                        inscrits_actuels: count
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
            if (this.editingPoste) {
                const { error } = await ApiService.update('postes', this.posteForm, { id: this.editingPoste.id });
                if (error) throw error;
                this.showToast('✅ Poste modifié avec succès !', 'success');
            } else {
                const { error } = await ApiService.insert('postes', this.posteForm);
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
