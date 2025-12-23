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
    
    // Stats
    stats: {
        tshirts: {},
        repas: {
            vendredi: 0,
            samedi: 0
        },
        cagnotte: {
            total_distribue: 0,
            total_consomme: 0,
            total_restant: 0
        }
    },

    // Configuration
    config: {
        cagnotte_active: false
    },

    // Search & Modal

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
        ordre: 1,
        montant_credit: 0.00
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
            this.loadBenevolesAndStats();
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
            // Refresh
            // Refresh
            await this.refreshBenevoleInscriptions();
            this.loadBenevolesAndStats(); // Refresh logic to update cagnotte credits
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
        // Parallel fetch of all improved
        const p1 = this.loadBenevolesAndStats(); // Merged logic
        const p2 = this.loadPostes(); // Postes needs inscriptions too, but we handle it separately or optimize
        const p3 = this.loadPeriodes();
        const p4 = this.loadConfig();

        await Promise.all([p1, p2, p3, p4]);
        
        // Post-process logic for Cagnotte if needed, but loadBenevolesAndStats does it.
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

    // Unified loader for benevoles + cagnotte stats
    async loadBenevolesAndStats() {
        try {
            // 1. Fetch Benevoles
            const { data: benevolesData, error: benevolesError } = await ApiService.fetch('admin_benevoles', {
                order: { column: 'nom', ascending: true }
            });
            if (benevolesError) throw benevolesError;
            
            // 2. Fetch Transactions (Debits/Manual Adjustments)
            const { data: transactionsData, error: transactionsError } = await ApiService.fetch('cagnotte_transactions', {
                 select: '*'
            });
            const transactions = transactionsError ? [] : (transactionsData || []);

            // 3. Fetch All Inscriptions (for Credits)
            // We need to link Inscription -> Poste -> Periode -> Credit
            const { data: inscriptionsData, error: inscriptionsError } = await ApiService.fetch('inscriptions', {
                select: 'benevole_id, poste_id, postes(periode_id, periodes(montant_credit))'
            });
            const allInscriptions = inscriptionsError ? [] : (inscriptionsData || []);
            


            // Process Stats
            const userStats = {}; // Map user_id -> stats (Family Wallet)
            const benevoleCredits = {}; // Map benevole_id -> credit (Individual contribution)
            
            // Helper to get user stats object
            const getUserStats = (userId) => {
                if (!userId) return null;
                if (!userStats[userId]) {
                    userStats[userId] = { 
                        inscriptions_credit: 0, 
                        transactions_solde: 0, // Sum of ALL transactions (positive and negative)
                        transaction_debit_abs: 0 // Sum of ABS(negative transactions)
                    };
                }
                return userStats[userId];
            };

            // Calculate Credits from Inscriptions
            // We need to map benevole_id to user_id (if exists).
            const benevoleMap = {}; // benevole_id -> user_id
            (benevolesData || []).forEach(b => { benevoleMap[b.id] = b.user_id; });
            
            allInscriptions.forEach(insc => {
                // 1. Calculate Credit for this inscription
                if (insc.postes && insc.postes.periodes) {
                    const credit = parseFloat(insc.postes.periodes.montant_credit || 0);
                    
                    // A. Store individual credit
                    benevoleCredits[insc.benevole_id] = (benevoleCredits[insc.benevole_id] || 0) + credit;

                    // B. Store family credit if user attached
                    const userId = benevoleMap[insc.benevole_id];
                    if (userId) {
                        const stats = getUserStats(userId);
                        stats.inscriptions_credit += credit;
                    }
                }
            });

            // Calculate Debits/Adjustments from Transactions (Only applicable if user_id exists)
            transactions.forEach(t => {
                const stats = getUserStats(t.user_id);
                if (stats) {
                    const amount = parseFloat(t.amount);
                    stats.transactions_solde += amount;
                    if (amount < 0) {
                        stats.transaction_debit_abs += Math.abs(amount);
                    } else {
                        // Positive transaction = Bonus credit
                        stats.inscriptions_credit += amount;
                    }
                }
            });
            this.benevoles = (benevolesData || []).map(b => {
                const userId = b.user_id;
                let total_materiel = 0;
                let dispo = 0;
                let total_consomme = 0;

                if (userId && userStats[userId]) {
                    // LINKED TO FAMILY
                    const stats = userStats[userId];
                    total_materiel = stats.inscriptions_credit;
                    total_consomme = stats.transaction_debit_abs;
                    const balance = total_materiel - total_consomme;
                    dispo = Math.max(0, balance);
                } else {
                    // ORPHAN VOLUNTEER (No User Account)
                    // Can generate credits but cannot spend/have a balance
                    total_materiel = benevoleCredits[b.id] || 0;
                    dispo = 0; 
                    total_consomme = 0;
                }
                
                return {
                    ...b,
                    cagnotte_total: total_materiel,
                    cagnotte_solde: dispo,
                    cagnotte_real_consumed: total_consomme 
                };
            });

            this.calculateStats();
        } catch (error) {
            console.error(error);
            this.showToast('❌ Erreur chargement bénévoles/cagnotte : ' + error.message, 'error');
        }
    },

    // Alias for compatibility
    async loadBenevoles() {
        return this.loadBenevolesAndStats();
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

    async loadConfig() {
        try {
            const { data, error } = await ApiService.fetch('config', {
                eq: { key: 'cagnotte_active' }
            });
            if (error) throw error;
            
            if (data && data.length > 0) {
                this.config.cagnotte_active = data[0].value;
            } else {
                // Should exist from migration, but fallback
                this.config.cagnotte_active = false;
            }
        } catch (error) {
            console.error('Error loading config:', error);
            this.showToast('⚠️ Erreur chargement configuration', 'warning');
        }
    },
    
    async toggleCagnotte() {
        const newValue = !this.config.cagnotte_active;
        // Optimistic update
        this.config.cagnotte_active = newValue;
        
        try {
            // Check if exists first (or upsert if API supports it, here assuming update works if row exists)
            // Ideally ApiService supports upsert, but let's try update or insert
            
            // We know row exists from migration
            const { error } = await ApiService.update('config', { value: newValue }, { key: 'cagnotte_active' });
            
            if (error) throw error;
            
            this.showToast(`✅ Cagnotte ${newValue ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`, 'success');
        } catch (error) {
            // Revert
            this.config.cagnotte_active = !newValue;
            this.showToast('❌ Erreur mise à jour : ' + error.message, 'error');
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
            this.periodeForm = { nom: '', ordre: this.periodes.length + 1, montant_credit: 0.00 };
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

    async updatePeriodeAmount(periodeId, newAmount) {
        try {
            const { error } = await ApiService.update('periodes', { montant_credit: parseFloat(newAmount) }, { id: periodeId });
            if (error) throw error;
            this.showToast('✅ Montant mis à jour', 'success');
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
            await this.loadBenevolesAndStats();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
            await this.loadBenevolesAndStats();
        }
    },

    calculateStats() {
        const tshirts = {};
        let vendredi = 0;
        let samedi = 0;

        this.benevoles.forEach(b => {
            // T-Shirts
            const size = b.taille_tshirt || 'Non défini';
            tshirts[size] = (tshirts[size] || 0) + 1;

            // Repas
            if (b.repas_vendredi) vendredi++;
            if (b.repas_samedi) samedi++;
        });

        // CAGNOTTE STATS
        // total_distribue = sum of all positive transactions (we have this aggregated in benevoles check if useful, or re-calc)
        // Actually, we can just sum up from the this.benevoles mapped data
        
        const total_distribue = this.benevoles.reduce((sum, b) => sum + (b.cagnotte_total || 0), 0);
        const total_restant = this.benevoles.reduce((sum, b) => sum + (b.cagnotte_solde || 0), 0);
        
        // Total consumed = Sum of REAL consumption
        const total_consomme = this.benevoles.reduce((sum, b) => sum + (b.cagnotte_real_consumed || 0), 0);

        // Sort sizes specifically
        const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Non défini'];
        const sortedTshirts = {};
        sizeOrder.forEach(size => {
            if (tshirts[size]) sortedTshirts[size] = tshirts[size];
        });
        // Add any others not in order
        Object.keys(tshirts).forEach(size => {
            if (!sortedTshirts[size]) sortedTshirts[size] = tshirts[size];
        });

        this.stats = {
            tshirts: sortedTshirts,
            repas: {
                vendredi,
                samedi
            },
            cagnotte: {
                total_distribue,
                total_consomme,
                total_restant
            }
        };
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
