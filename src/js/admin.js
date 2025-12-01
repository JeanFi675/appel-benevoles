import Alpine from 'alpinejs';
import { supabase } from './config.js';
import { formatDateTime, formatDateTimeForInput } from './utils.js';

document.addEventListener('alpine:init', () => {
    Alpine.data('adminApp', () => ({
        isAdmin: false,
        loading: true,
        activeTab: 'postes',
        toasts: [],

        postes: [],
        benevoles: [],
        periodes: [],
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

        get referents() {
            return this.benevoles.filter(b => b.role === 'referent');
        },

        async init() {
            // Check authentication and admin status
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                window.location.href = 'index.html';
                return;
            }

            // Check if user is admin
            const { data: profile, error } = await supabase
                .from('benevoles')
                .select('role')
                .eq('id', session.user.id)
                .single();

            if (error || !profile || profile.role !== 'admin') {
                this.isAdmin = false;
                this.loading = false;
                return;
            }

            this.isAdmin = true;
            this.loading = false;

            await this.loadData();

            // Écouter les changements d'auth et nettoyer l'URL après connexion
            supabase.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
                    window.history.replaceState(null, '', window.location.pathname);
                }
            });
        },

        async loadData() {
            await Promise.all([
                this.loadPostes(),
                this.loadBenevoles(),
                this.loadPeriodes()
            ]);
        },

        async loadPostes() {
            try {
                const { data, error } = await supabase
                    .from('postes')
                    .select('*, periodes(nom, ordre)');

                if (error) throw error;

                // Count inscriptions for each poste
                const postesWithCounts = await Promise.all(
                    (data || []).map(async (poste) => {
                        const { count } = await supabase
                            .from('inscriptions')
                            .select('*', { count: 'exact', head: true })
                            .eq('poste_id', poste.id);

                        return {
                            ...poste,
                            periode_nom: poste.periodes?.nom || '-',
                            periode_ordre: poste.periodes?.ordre || 999,
                            inscrits_actuels: count || 0
                        };
                    })
                );

                // Sort by periode order, then by start date
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
                const { data, error } = await supabase
                    .from('admin_benevoles')
                    .select('*')
                    .order('nom');

                if (error) throw error;
                this.benevoles = data || [];
            } catch (error) {
                this.showToast('❌ Erreur chargement bénévoles : ' + error.message, 'error');
            }
        },

        async loadPeriodes() {
            try {
                const { data, error } = await supabase
                    .from('periodes')
                    .select('*')
                    .order('ordre');

                if (error) throw error;
                this.periodes = data || [];
            } catch (error) {
                this.showToast('❌ Erreur chargement périodes : ' + error.message, 'error');
            }
        },

        async savePoste() {
            this.loading = true;
            try {
                if (this.editingPoste) {
                    // Update existing poste
                    const { error } = await supabase
                        .from('postes')
                        .update(this.posteForm)
                        .eq('id', this.editingPoste.id);

                    if (error) throw error;
                    this.showToast('✅ Poste modifié avec succès !', 'success');
                } else {
                    // Create new poste
                    const { error } = await supabase
                        .from('postes')
                        .insert([this.posteForm]);

                    if (error) throw error;
                    this.showToast('✅ Poste créé avec succès !', 'success');
                }

                // Reset form
                this.editingPoste = null;
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

            // Scroll to form
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        cancelEdit() {
            this.editingPoste = null;
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

        async deletePoste(id) {
            if (!confirm('Êtes-vous sûr de vouloir supprimer ce poste ?')) return;

            this.loading = true;
            try {
                const { error } = await supabase
                    .from('postes')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                this.showToast('✅ Poste supprimé', 'success');
                await this.loadPostes();
            } catch (error) {
                this.showToast('❌ Erreur : ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        async createPeriode() {
            this.loading = true;
            try {
                const { error } = await supabase
                    .from('periodes')
                    .insert([this.periodeForm]);

                if (error) throw error;

                this.showToast('✅ Période créée avec succès !', 'success');

                // Reset form
                this.periodeForm = {
                    nom: '',
                    ordre: this.periodes.length + 1
                };

                await this.loadPeriodes();
            } catch (error) {
                this.showToast('❌ Erreur : ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        async updatePeriodeOrder(periodeId, newOrder) {
            try {
                const { error } = await supabase
                    .from('periodes')
                    .update({ ordre: parseInt(newOrder) })
                    .eq('id', periodeId);

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
                const { error } = await supabase
                    .from('periodes')
                    .delete()
                    .eq('id', periodeId);

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

        async updateBenevoleRole(benevoleId, newRole) {
            try {
                const { error } = await supabase
                    .from('benevoles')
                    .update({ role: newRole })
                    .eq('id', benevoleId);

                if (error) throw error;

                const roleNames = {
                    'benevole': 'Bénévole',
                    'referent': 'Référent',
                    'admin': 'Admin'
                };

                this.showToast(`✅ Rôle changé en ${roleNames[newRole]}`, 'success');
                await this.loadBenevoles();
            } catch (error) {
                this.showToast('❌ Erreur : ' + error.message, 'error');
                await this.loadBenevoles(); // Reload to reset the select
            }
        },

        formatDateTime,

        showToast(message, type = 'success') {
            const id = Date.now();
            this.toasts.push({ id, message, type });

            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, 5000);
        }
    }));
});

Alpine.start();
