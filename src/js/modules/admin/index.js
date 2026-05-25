import { ApiService } from '../../services/api.js';
import { formatDateTime, formatDateTimeForInput, formatTime } from '../../utils.js';

/**
 * Module for managing admin operations (Postes, Periodes, Benevoles).
 * @namespace AdminModule
 */
export const AdminModule = {
    isAdmin: false,
    loading: true,
    activeTab: 'visual-creator',
    toasts: [],

    // Data
    postes: [],
    benevoles: [],
    periodes: [],
    dbProgramme: null,
    
    // Stats
    stats: {
        tshirts: {},
        repas: {}, // Rempli dynamiquement par repas_id
        cagnotte: {
            total_distribue: 0,
            total_consomme: 0,
            total_restant: 0
        }
    },

    // Configuration
    config: {
        cagnotte_active: false,
        tshirt_question_active: true,
        tarif_cagnotte_journee: 15.00
    },
    savingConfig: false,

    repasList: [],
    newRepasName: '',
    editingRepasId: null,
    editingRepasName: '',

    // Mailing
    mailingFilterRole: 'tous', // 'tous', 'benevole', 'referent', 'admin'
    mailingFilterAssignation: 'tous', // 'tous', 'avec_poste', 'sans_poste', 'poste_specifique'
    mailingPostLines: [
        { id: 1, selectedTitle: '', selectedSlots: [] }
    ],

    referentAssignments: {},
    uniquePosteTitres: [],

    // Cagnotte forcée
    forcedSearchQuery: '',
    selectedForcedBenevole: null,
    forcedForm: {
        cagnotte_forcee: false,
        cagnotte_forcee_type: 'journee',
        cagnotte_forcee_jours: [],
        cagnotte_forcee_periodes_ids: []
    },

    // Search & Modal
    searchQuery: '',
    benevolesSort: 'name_asc', // 'name_asc', 'date_desc', 'inscriptions_desc'
    posteFilterPeriode: '',
    selectedBenevoleInscriptions: [],
    showDetailsModal: false, // Read-only modal
    showEditModal: false,    // Edit/Add modal
    selectedBenevoleName: '',
    currentBenevole: null,
    currentUser: null,

    // Poste Inscrits Modal
    showPosteInscritsModal: false,
    selectedPoste: null,
    selectedPosteInscrits: [],

    // Add Benevole Modal
    showAddBenevoleModal: false,
    newBenevoleForm: {
        email: '',
        nom: '',
        prenom: ''
    },

    // Add Inscription Form
    newInscriptionForm: {
        periode_id: '',
        poste_id: ''
    },



    // Expose utils
    formatDateTime,
    formatDateTimeForInput,
    formatTime,

    getReferents() {
        return this.benevoles.filter(b => ['referent', 'admin'].includes(b.role));
    },

    getBenevolesStandardAvecInscriptions() {
        return this.benevoles.filter(b => ['admin', 'referent', 'benevole'].includes(b.role || 'benevole') && (b.nb_inscriptions || 0) > 0).length;
    },

    getBenevolesStandardSansInscriptions() {
        return this.benevoles.filter(b => ['admin', 'referent', 'benevole'].includes(b.role || 'benevole') && (b.nb_inscriptions || 0) === 0).length;
    },



    isReferentInscritPeriode(referentId, periodeId) {
        if (!referentId) return false;
        return this.postes.some(p => p.periode_id === periodeId && (p.inscrits_ids || []).includes(referentId));
    },

    getFilteredPostes() {
        if (!this.posteFilterPeriode) return this.postes;
        return this.postes.filter(p => String(p.periode_id) === String(this.posteFilterPeriode));
    },

    async updatePosteReferent(posteId, referentId) {
        try {
            const { error } = await ApiService.update('postes', { referent_id: referentId || null }, { id: posteId });
            if (error) throw error;
            this.showToast('✅ Référent mis à jour', 'success');
            await this.loadPostes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        }
    },

    getFilteredBenevoles() {
        let filtered = [...this.benevoles];

        // 1. Filter
        if (this.searchQuery) {
            const lowerQuery = this.searchQuery.toLowerCase();
            filtered = filtered.filter(b =>
                (b.nom && b.nom.toLowerCase().includes(lowerQuery)) ||
                (b.prenom && b.prenom.toLowerCase().includes(lowerQuery)) ||
                (b.email && b.email.toLowerCase().includes(lowerQuery))
            );
        }

        // 2. Sort
        filtered.sort((a, b) => {
            // Prépare le tri secondaire par identité
            const nameA = ((a.nom || '') + ' ' + (a.prenom || '')).toLowerCase();
            const nameB = ((b.nom || '') + ' ' + (b.prenom || '')).toLowerCase();
            const sortIdentity = nameA.localeCompare(nameB);

            if (this.benevolesSort === 'date_desc') {
                const dateDiff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                return dateDiff !== 0 ? dateDiff : sortIdentity;
            } else if (this.benevolesSort === 'inscriptions_desc') {
                const inscriDiff = (b.nb_inscriptions || 0) - (a.nb_inscriptions || 0);
                return inscriDiff !== 0 ? inscriDiff : sortIdentity;
            } else if (this.benevolesSort === 'role_desc') {
                const roleOrder = { 'admin': 1, 'referent': 2, 'benevole': 3 };
                const roleA = roleOrder[a.role] || 4;
                const roleB = roleOrder[b.role] || 4;
                const roleDiff = roleA - roleB;
                return roleDiff !== 0 ? roleDiff : sortIdentity;
            } else {
                // default 'name_asc' (A -> Z identity)
                return sortIdentity;
            }
        });

        // 3. Assign alternating colors
        let lastEmail = null;
        let isAlt = false;

        return filtered.map((b, index) => {
             if (this.benevolesSort === 'name_asc') {
                 // Quinconce based on email family grouping
                 const currentEmail = (b.email || '').toLowerCase();
                 if (currentEmail !== lastEmail) {
                     if (lastEmail !== null) {
                         isAlt = !isAlt;
                     }
                     lastEmail = currentEmail;
                 }
             } else {
                 // Simple alternate for other sorts
                 isAlt = index % 2 !== 0;
             }

             return {
                 ...b,
                 bgClass: isAlt ? 'bg-gray-100' : 'bg-white'
             };
        });
    },

    exportBenevolesExcel() {
        const filtered = this.getFilteredBenevoles();
        if (filtered.length === 0) {
            this.showToast('⚠️ Aucun bénévole à exporter.', 'warning');
            return;
        }

        // En-têtes du fichier
        const headers = [
            'Nom',
            'Prénom',
            'Email',
            'Téléphone',
            'Taille T-shirt',
            'Rôle',
            'Club (Type adhésion)',
            'Inscriptions',
            'Postes Référent',
            'Total Cagnotte Matériel (D)',
            'Compte Principal Famille ?',
            'Consommé Global Famille (D)',
            'Reste Global Famille (D)',
            'Cagnotte forcée ?',
            'Créé le'
        ];

        // Traduction des rôles pour l'export
        const roleTraduit = {
            'admin': '🔐 Administrateur',
            'referent': '👔 Référent',
            'benevole': '👤 Bénévole'
        };

        const rows = [headers];

        filtered.forEach(b => {
            const adhesionType = b.adhesion ? b.adhesion.type : '—';
            const roleStr = roleTraduit[b.role] || b.role || '👤 Bénévole';
            const dateStr = b.created_at ? new Date(b.created_at).toLocaleDateString('fr-FR') : '';

            rows.push([
                b.nom || '',
                b.prenom || '',
                b.email || '',
                b.telephone || '',
                b.taille_tshirt || '',
                roleStr,
                adhesionType,
                b.nb_inscriptions || 0,
                b.nb_postes_referent || 0,
                b.cagnotte_total || 0,
                b.is_family_head ? 'Oui' : (b.user_id ? 'Non (Membre famille)' : 'Non (Compte unique)'),
                b.cagnotte_real_consumed || 0,
                b.cagnotte_solde || 0,
                b.cagnotte_forcee ? ('Oui (' + (b.cagnotte_forcee_type === 'journee' ? 'Jour' : 'Période') + ')') : 'Non',
                dateStr
            ]);
        });

        // Conversion en CSV avec séparateur point-virgule et échappement
        const csvContent = rows.map(row => 
            row.map(val => {
                const str = String(val).replace(/"/g, '""');
                return `"${str}"`;
            }).join(';')
        ).join('\r\n');

        // Ajout du BOM UTF-8 pour Excel sous Windows pour préserver les accents
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // Déclenchement du téléchargement
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `export_benevoles_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showToast('✅ Export Excel réussi !', 'success');
        }
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

    async viewPosteInscrits(poste) {
        this.selectedPoste = poste;
        this.selectedPosteInscrits = [];
        this.showPosteInscritsModal = true;

        try {
            const { data, error } = await ApiService.fetch('inscriptions', {
                select: '*, benevoles(prenom, nom, email, taille_tshirt)',
                eq: { poste_id: poste.id }
            });
            if (error) throw error;

            this.selectedPosteInscrits = (data || []).map(i => ({
                id: i.id,
                prenom: i.benevoles?.prenom || '?',
                nom: i.benevoles?.nom || '?',
                email: i.benevoles?.email || '',
                taille_tshirt: i.benevoles?.taille_tshirt || ''
            })).sort((a, b) => a.nom.localeCompare(b.nom));
        } catch (error) {
            this.showToast('❌ Erreur chargement inscrits : ' + error.message, 'error');
        }
    },

    closePosteInscritsModal() {
        this.showPosteInscritsModal = false;
        this.selectedPoste = null;
        this.selectedPosteInscrits = [];
    },

    /**
     * Loads all admin data.
     */
    async loadData() {
        const p1 = this.loadBenevolesAndStats();
        const p2 = this.loadPostes();
        const p3 = this.loadPeriodes();
        const p4 = this.loadConfig();
        const p5 = this.loadRepas();
        const p6 = this.loadProgramme();
        const p7 = this.loadJours();

        await Promise.all([p1, p2, p3, p4, p5, p6, p7]);
        this.initReferentAssignments();
    },

    async loadJours() {
        try {
            const { data, error } = await ApiService.fetch('jours', {
                order: { column: 'date_ref', ascending: true }
            });
            if (error) throw error;
            this.dbJours = (data || []).map(j => j.date_ref);
        } catch (error) {
            console.error("Erreur chargement jours:", error);
        }
    },

    initReferentAssignments() {
        const uniqueTitres = new Set();
        this.postes.forEach(p => {
            if (p.titre) uniqueTitres.add(p.titre);
        });
        this.uniquePosteTitres = Array.from(uniqueTitres).sort();

        const assignments = {};
        this.getReferents().forEach(ref => {
            // Find all postes where this referent is assigned
            const refPostes = this.postes.filter(p => p.referent_id === ref.id);
            
            // Group them by titre
            const groupedByTitre = {};
            refPostes.forEach(p => {
                if (!groupedByTitre[p.titre]) {
                    groupedByTitre[p.titre] = [];
                }
                groupedByTitre[p.titre].push(p.periode_id);
            });

            const lines = [];
            for (const [titre, periodes] of Object.entries(groupedByTitre)) {
                lines.push({ titre, periodes });
            }
            assignments[ref.id] = lines;
        });

        this.referentAssignments = assignments;
    },

    addReferentAssignmentLine(refId) {
        if (!this.referentAssignments[refId]) {
            this.referentAssignments[refId] = [];
        }
        this.referentAssignments[refId].push({ titre: '', periodes: [] });
    },

    removeReferentAssignmentLine(refId, index) {
        if (this.referentAssignments[refId]) {
            this.referentAssignments[refId].splice(index, 1);
            this.saveReferentAssignments(refId);
        }
    },

    getPeriodesForTitre(titre) {
        if (!titre) return [];
        const postesAvecCeTitre = this.postes.filter(p => p.titre === titre);
        const periodesIds = new Set(postesAvecCeTitre.map(p => p.periode_id));
        return this.periodes.filter(p => periodesIds.has(p.id));
    },

    getOrphanPostes() {
        const orphans = {};
        this.postes.forEach(p => {
            if (!p.referent_id) {
                if (!orphans[p.titre]) orphans[p.titre] = [];
                const periode = this.periodes.find(per => per.id === p.periode_id);
                if (periode && !orphans[p.titre].some(per => per.id === p.periode_id)) {
                    orphans[p.titre].push(periode);
                }
            }
        });

        return Object.entries(orphans).map(([titre, periodes]) => {
            // Trier les périodes par ordre
            periodes.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
            return { titre, periodes };
        }).sort((a, b) => a.titre.localeCompare(b.titre));
    },

    async saveReferentAssignments(refId) {
        try {
            const assignments = this.referentAssignments[refId] || [];
            
            // On ignore les lignes incomplètes silencieusement au lieu de bloquer
            // car l'utilisateur peut juste être en train de décocher la dernière case
            // ou d'ajouter une nouvelle ligne.

            // We need to update referent_id on the corresponding postes.
            // 1. Get all current postes for this referent to clear them if they were removed
            const oldRefPostes = this.postes.filter(p => p.referent_id === refId);
            
            // 2. Identify which postes should NOW be assigned to this referent
            const newRefPosteIds = new Set();
            for (const a of assignments) {
                // Find matching postes by title and periode
                for (const pid of a.periodes) {
                    const matchingPoste = this.postes.find(p => p.titre === a.titre && p.periode_id === pid);
                    if (matchingPoste) {
                        newRefPosteIds.add(matchingPoste.id);
                    }
                }
            }

            // 3. Compare and execute updates
            const updates = [];
            
            // Remove from old postes that are not in new list
            for (const oldP of oldRefPostes) {
                if (!newRefPosteIds.has(oldP.id)) {
                    updates.push(ApiService.update('postes', { referent_id: null }, { id: oldP.id }));
                    
                    // Mise à jour de l'état local pour éviter le rechargement complet
                    const localP = this.postes.find(p => p.id === oldP.id);
                    if (localP) localP.referent_id = null;
                }
            }

            // Add to new postes
            for (const newPid of newRefPosteIds) {
                updates.push(ApiService.update('postes', { referent_id: refId }, { id: newPid }));
                
                // Mise à jour de l'état local pour éviter le rechargement complet
                const localP = this.postes.find(p => p.id === newPid);
                if (localP) localP.referent_id = refId;
            }

            if (updates.length > 0) {
                await Promise.all(updates);
            }

            // La sauvegarde se fait "en sourdine", 
            // la vue n'est pas reconstruite pour ne pas interrompre l'utilisateur.
        } catch (error) {
            console.error(error);
            this.showToast('❌ Erreur : ' + error.message, 'error');
        }
    },



    /**
     * Loads postes with inscription counts.
     */
    async loadPostes() {
        try {
            const { data, error } = await ApiService.fetch('postes', {
                select: '*, type_postes(titre, description, ordre), periodes(nom, ordre), benevoles(prenom, nom)'
            });

            if (error) throw error;

            const postesWithCounts = await Promise.all(
                (data || []).map(async (poste) => {
                    const { data: inscriptions } = await ApiService.fetch('inscriptions', {
                        select: '*, benevoles(prenom, nom)',
                        eq: { poste_id: poste.id }
                    });
                    const count = inscriptions ? inscriptions.length : 0;
                    const inscrits_ids = (inscriptions || []).map(i => i.benevole_id);
                    const inscrits_noms = (inscriptions || [])
                        .map(i => i.benevoles ? `${i.benevoles.prenom} ${i.benevoles.nom}` : '')
                        .filter(Boolean);

                    let referentIdentite = '-';
                    if (poste.benevoles) {
                        referentIdentite = `${poste.benevoles.prenom} ${poste.benevoles.nom}`;
                    }

                    return {
                        ...poste,
                        titre: poste.type_postes?.titre || '',
                        description: poste.type_postes?.description || '',
                        ordre: poste.type_postes?.ordre || 0,
                        periode_nom: poste.periodes?.nom || '-',
                        periode_ordre: poste.periodes?.ordre || 999,
                        inscrits_actuels: count,
                        inscrits_ids,
                        inscrits_noms,
                        referent_identite: referentIdentite
                    };
                })
            );

            this.postes = postesWithCounts.sort((a, b) => {
                if (a.periode_ordre !== b.periode_ordre) {
                    return a.periode_ordre - b.periode_ordre;
                }
                return new Date(a.periode_debut).getTime() - new Date(b.periode_debut).getTime();
            });
        } catch (error) {
            this.showToast('❌ Erreur chargement postes : ' + error.message, 'error');
        }
    },

    // Unified loader for benevoles + cagnotte stats
    async loadBenevolesAndStats() {
        try {
            // 1. Fetch Benevoles
            // 1. Fetch Benevoles (Sorted by Email to group families, then Name)
            const { data: benevoleRaw, error: benevolesError } = await ApiService.fetch('admin_benevoles', {
                order: { column: 'email', ascending: true }
            });
            // Secondary sort in JS to be safe (if Supabase only supports one order param effectively here, or simply to refine)
            const benevolesData = (benevoleRaw || []).sort((a, b) => {
                const mailA = (a.email || '').toLowerCase();
                const mailB = (b.email || '').toLowerCase();
                if (mailA < mailB) return -1;
                if (mailA > mailB) return 1;
                // If same email, sort by First Name (or Name)
                return (a.prenom || '').localeCompare(b.prenom || '');
            });
            if (benevolesError) throw benevolesError;
            
            // 2. Fetch Transactions (Debits/Manual Adjustments)
            const { data: transactionsData, error: transactionsError } = await ApiService.fetch('cagnotte_transactions', {
                 select: '*'
            });
            const transactions = transactionsError ? [] : (transactionsData || []);
            if (transactions.length > 0) {
                 // console.log('DEBUG: Transaction 0 sample:', ... );
            }

            // 3. Fetch All Inscriptions (for Credits)
            // We need to link Inscription -> Poste -> Periode -> Credit
            const { data: inscriptionsData, error: inscriptionsError } = await ApiService.fetch('inscriptions', {
                select: 'benevole_id, poste_id, postes(periode_id, periodes(montant_credit))'
            });
            const allInscriptions = inscriptionsError ? [] : (inscriptionsData || []);

            // 4. Fetch all periodes (needed for forced cagnottes)
            const { data: periodesData } = await ApiService.fetch('periodes', { select: 'id, montant_credit' });

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

                    // A. Store individual credit (only for non forced cagnottes)
                    const benevole = (benevolesData || []).find(b => b.id === insc.benevole_id);
                    const isForced = benevole?.cagnotte_forcee;
                    if (!isForced) {
                        benevoleCredits[insc.benevole_id] = (benevoleCredits[insc.benevole_id] || 0) + credit;

                        // B. Store family credit if user attached
                        const userId = benevoleMap[insc.benevole_id];
                        if (userId) {
                            const stats = getUserStats(userId);
                            stats.inscriptions_credit += credit;
                        }
                    }
                }
            });

            // Crédits pour les bénévoles avec cagnotte forcée
            (benevolesData || []).filter(b => b.cagnotte_forcee).forEach(b => {
                let creditForced = 0;
                if (b.cagnotte_forcee_type === 'journee') {
                    const nbJours = Array.isArray(b.cagnotte_forcee_jours) ? b.cagnotte_forcee_jours.length : 0;
                    creditForced = nbJours * parseFloat(this.config.tarif_cagnotte_journee || 0);
                } else if (b.cagnotte_forcee_type === 'periode') {
                    const periodesIds = b.cagnotte_forcee_periodes_ids || [];
                    creditForced = (periodesData || [])
                        .filter(p => periodesIds.includes(p.id))
                        .reduce((sum, p) => sum + parseFloat(p.montant_credit || 0), 0);
                }

                benevoleCredits[b.id] = creditForced;
                if (b.user_id) {
                    const stats = getUserStats(b.user_id);
                    stats.inscriptions_credit += creditForced;
                }
            });

            // Calculate Debits/Adjustments from Transactions (Only applicable if user_id exists)
            transactions.forEach(t => {
                const stats = getUserStats(t.user_id);
                if (stats) {
                    const amount = parseFloat(t.montant); // FIX: amount -> montant
                    stats.transactions_solde += amount;
                    if (amount < 0) {
                        stats.transaction_debit_abs += Math.abs(amount);
                    } else {
                        // Positive transaction = Bonus credit
                        stats.inscriptions_credit += amount;
                    }
                }
            });
            // NEW LOGIC: Identify which benevole is the "Primary" for display purposes
            // We want to show the specific earned credits for EVERYONE
            // But show the Consumed/Restant ONLY on the first member of the family
            const familyHeadMap = {}; // userId -> benevoleId (first one encountered)
            
            // Assuming benevolesData is sorted enough or random, we just pick the first one we see per userId
            (benevolesData || []).forEach(b => {
                if (b.user_id && !familyHeadMap[b.user_id]) {
                    familyHeadMap[b.user_id] = b.id;
                }
            });

            this.benevoles = (benevolesData || []).map(b => {
                const userId = b.user_id;

                // 1. Total Matériel (Earned) is ALWAYS individual contribution
                const earned_individuel = benevoleCredits[b.id] || 0;

                let dispo = 0;
                let total_consomme = 0;
                let is_family_head = false;
                let has_family = !!userId;

                if (userId && userStats[userId]) {
                    // It is a specific account
                    const stats = userStats[userId];
                    
                    // Logic: Only the "Head" of family displays the consumption/balance
                    if (familyHeadMap[userId] === b.id) {
                        is_family_head = true;
                        // Consumed = Family Total Consumed
                        total_consomme = stats.transaction_debit_abs;
                        // Balance = Family Total Credit - Family Total Consumed
                        const family_total_credit = stats.inscriptions_credit;
                        const balance = family_total_credit - total_consomme;
                        dispo = Math.max(0, balance);
                    } else {
                        // Secondary member: Does not show consumption/balance repetition
                        total_consomme = 0; // Or handle as null in UI
                        dispo = 0; 
                    }
                } else {
                    // Orphan
                    total_consomme = 0;
                    dispo = 0;
                }
                
                return {
                    ...b,
                    cagnotte_total: earned_individuel, // DISPLAY: "Gagné" (Individual)
                    cagnotte_solde: dispo,             // DISPLAY: "Restant Global" (Only on head)
                    cagnotte_real_consumed: total_consomme, // DISPLAY: "Consommé Global" (Only on head)
                    is_family_head: is_family_head,
                    has_family: has_family
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

    async loadProgramme() {
        try {
            const { data, error } = await ApiService.fetch('programme', {
                order: { column: 'heure', ascending: true }
            });
            if (error) throw error;
            if (data && data.length > 0) {
                const days = {};
                data.forEach(item => {
                    const dateKey = item.date_ref; // format YYYY-MM-DD
                    if (!days[dateKey]) {
                        const d = new Date(dateKey + 'T00:00:00');
                        const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                        days[dateKey] = { label, events: [] };
                    }
                    
                    // Convert time '07:00:00' to hStart decimal and timeLabel
                    const [h, m] = item.heure.split(':');
                    const hStart = parseInt(h) + parseInt(m) / 60;
                    const timeLabel = `${h}h${m}`;
                    
                    days[dateKey].events.push({
                        num: days[dateKey].events.length + 1,
                        timeLabel,
                        hStart,
                        description: item.description,
                        id: item.id
                    });
                });
                this.dbProgramme = { meta: [], days };
            } else {
                this.dbProgramme = null;
            }
        } catch (err) {
            console.warn('Erreur chargement programme de la DB :', err.message);
            this.dbProgramme = null;
        }
    },

    async loadConfig() {
        try {
            const { data, error } = await ApiService.fetch('config', {
                in: { key: ['cagnotte_active', 'tarif_cagnotte_journee', 'tshirt_question_active'] }
            });
            if (error) throw error;
            
            if (data && data.length > 0) {
                const cagnotteActive = data.find(c => c.key === 'cagnotte_active');
                if (cagnotteActive) this.config.cagnotte_active = cagnotteActive.value;

                const tshirt = data.find(c => c.key === 'tshirt_question_active');
                if (tshirt) this.config.tshirt_question_active = tshirt.value;

                const tarifJournee = data.find(c => c.key === 'tarif_cagnotte_journee');
                if (tarifJournee) this.config.tarif_cagnotte_journee = parseFloat(tarifJournee.value);
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
            // Upsert configuration to guarantee key existence
            const { error } = await ApiService.upsert('config', { 
                key: 'cagnotte_active', 
                value: newValue 
            });
            
            if (error) throw error;
            
            this.showToast(`✅ Cagnotte ${newValue ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`, 'success');
        } catch (error) {
            // Revert
            this.config.cagnotte_active = !newValue;
            this.showToast('❌ Erreur mise à jour : ' + error.message, 'error');
        }
    },

    async toggleTshirtQuestion() {
        const newValue = !this.config.tshirt_question_active;
        this.config.tshirt_question_active = newValue;
        
        try {
            const { error } = await ApiService.upsert('config', { 
                key: 'tshirt_question_active', 
                value: newValue 
            });
            
            if (error) throw error;
            
            this.showToast(`✅ Question T-Shirt ${newValue ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`, 'success');
        } catch (error) {
            this.config.tshirt_question_active = !newValue;
            this.showToast('❌ Erreur : ' + error.message, 'error');
        }
    },

    async loadRepas() {
        try {
            const { data, error } = await ApiService.fetch('repas', {
                order: { column: 'created_at', ascending: true }
            });
            if (error) throw error;
            this.repasList = data || [];
        } catch (error) {
            this.showToast('❌ Erreur chargement repas : ' + error.message, 'error');
        }
    },

    async addRepas() {
        if (!this.newRepasName || this.newRepasName.trim() === '') return;
        this.loading = true;
        try {
            const { error } = await ApiService.insert('repas', {
                nom: this.newRepasName.trim()
            });
            if (error) throw error;
            
            this.showToast('✅ Repas ajouté avec succès !', 'success');
            this.newRepasName = '';
            await this.loadRepas();
            await this.loadBenevolesAndStats(); // Re-calculer les stats car il y a un nouveau repas
        } catch (error) {
            this.showToast('❌ Erreur ajout repas : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    async deleteRepas(id) {
        if (!confirm('Voulez-vous vraiment supprimer ce repas ? Tous les choix des bénévoles associés à ce repas seront perdus.')) return;
        this.loading = true;
        try {
            const { error } = await ApiService.delete('repas', { id });
            if (error) throw error;
            
            this.showToast('✅ Repas supprimé !', 'success');
            await this.loadRepas();
            await this.loadBenevolesAndStats();
        } catch (error) {
            this.showToast('❌ Erreur suppression : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    startEditRepas(repas) {
        this.editingRepasId = repas.id;
        this.editingRepasName = repas.nom;
    },

    cancelEditRepas() {
        this.editingRepasId = null;
        this.editingRepasName = '';
    },

    async saveEditRepas(id) {
        if (!this.editingRepasName || this.editingRepasName.trim() === '') return;
        this.loading = true;
        try {
            const { error } = await ApiService.update('repas', {
                nom: this.editingRepasName.trim()
            }, { id });
            
            if (error) throw error;
            
            this.showToast('✅ Repas mis à jour avec succès !', 'success');
            this.editingRepasId = null;
            this.editingRepasName = '';
            await this.loadRepas();
            await this.loadBenevolesAndStats();
        } catch (error) {
            this.showToast('❌ Erreur modification repas : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    // --- Actions ---
    // (Les méthodes manuelles savePoste, deletePoste, editPoste, createPeriode, etc. ont été supprimées car la gestion se fait désormais exclusivement via le Planning Interactif)

    getPostesCountForPeriode(periodeId) {
        return this.postes.filter(p => p.periode_id === periodeId).length;
    },

    getBenevolesMinForPeriode(periodeId) {
        return this.postes.filter(p => p.periode_id === periodeId).reduce((sum, p) => sum + parseInt(p.nb_min || 0), 0);
    },

    getBenevolesMaxForPeriode(periodeId) {
        return this.postes.filter(p => p.periode_id === periodeId).reduce((sum, p) => sum + parseInt(p.nb_max || 0), 0);
    },

    getBenevolesInscritsForPeriode(periodeId) {
        return this.postes.filter(p => p.periode_id === periodeId).reduce((sum, p) => sum + parseInt(p.inscrits_actuels || 0), 0);
    },

    getPeriodeInscritsColor(periodeId) {
        const inscrits = this.getBenevolesInscritsForPeriode(periodeId);
        const min = this.getBenevolesMinForPeriode(periodeId);
        const max = this.getBenevolesMaxForPeriode(periodeId);
        
        if (max === 0 && min === 0) return 'text-gray-600'; // Cas spécial : pas de besoins définis
        if (inscrits < min) return 'text-red-600 font-black';
        if (inscrits >= max) return 'text-green-600 font-black';
        return 'text-yellow-600 font-black'; // Mini atteint
    },

    // --- Add Benevole ---

    openAddBenevoleModal() {
        this.newBenevoleForm = { email: '', nom: '', prenom: '' };
        this.showAddBenevoleModal = true;
    },

    closeAddBenevoleModal() {
        this.showAddBenevoleModal = false;
        this.newBenevoleForm = { email: '', nom: '', prenom: '' };
    },

    async createBenevole() {
        if (!this.newBenevoleForm.email || !this.newBenevoleForm.nom || !this.newBenevoleForm.prenom) {
            this.showToast('⚠️ Veuillez remplir tous les champs.', 'warning');
            return;
        }

        this.loading = true;
        try {
            // Appel de l'Edge Function pour créer le compte et le bénévole
            const { data, error } = await ApiService.invoke('create-benevole', {
                body: {
                    email: this.newBenevoleForm.email,
                    nom: this.newBenevoleForm.nom,
                    prenom: this.newBenevoleForm.prenom
                }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            const newBenevole = data.benevole;

            this.showToast('✅ Bénévole ajouté avec succès !', 'success');
            
            this.closeAddBenevoleModal();
            
            // Refresh first to get updated lists
            await this.loadBenevolesAndStats();

            // Then open the edit modal for the NEW volunteer
            await this.openEditBenevoleInscriptions(newBenevole);

        } catch (error) {
            this.showToast('❌ Erreur création : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    // --- Benevoles ---

    async updateBenevoleRole(benevoleId, newRole) {
        try {
            const { error } = await ApiService.update('benevoles', { role: newRole }, { id: benevoleId });
            if (error) throw error;

            // If changing away from referent, remove them from being referent on any post
            if (newRole !== 'referent') {
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
        let total_tshirts = 0;
        
        // Initialiser la map des repas dynamiques
        const repasStats = {};
        this.repasList.forEach(r => {
            repasStats[r.id] = { nom: r.nom, total: 0, normal: 0, vege: 0 };
        });

        this.benevoles.forEach(b => {
            // T-Shirts: les bénévoles (rôle "benevole") sans aucune inscription n'ont pas de T-shirt
            const skipTshirt = b.role === 'benevole' && (b.nb_inscriptions || 0) === 0;
            if (!skipTshirt) {
                const size = b.taille_tshirt || 'Non défini';
                tshirts[size] = (tshirts[size] || 0) + 1;
                // Le total exclut SANS et Non défini (pas de T-shirt réel à commander)
                if (size !== 'SANS' && size !== 'Non défini') {
                    total_tshirts++;
                }
            }

            // Repas dynamiques
            if (b.repas && Array.isArray(b.repas)) {
                b.repas.forEach(ur => {
                    if (!repasStats[ur.repas_id]) {
                        repasStats[ur.repas_id] = { nom: ur.nom || 'Repas inconnu', total: 0, normal: 0, vege: 0 };
                    }
                    repasStats[ur.repas_id].total++;
                    if (ur.vegetarien) {
                        repasStats[ur.repas_id].vege++;
                    } else {
                        repasStats[ur.repas_id].normal++;
                    }
                });
            }
        });

        // CAGNOTTE STATS
        // total_distribue = sum of all positive transactions
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
            total_tshirts,
            repas: repasStats,
            cagnotte: {
                total_distribue,
                total_consomme,
                total_restant
            }
        };
    },

    // --- Heures de bénévolat ---

    getHeuresParPeriode() {
        const arrondi = v => Math.round(v * 10) / 10;
        return this.periodes.map(periode => {
            const postesAvecHeures = this.postes
                .filter(p => p.periode_id === periode.id && p.periode_debut && p.periode_fin)
                .map(p => {
                    const dureeH = (new Date(p.periode_fin).getTime() - new Date(p.periode_debut).getTime()) / 3600000;
                    const inscrits = p.inscrits_actuels || 0;
                    return {
                        id: p.id,
                        titre: p.titre,
                        debut: p.periode_debut,
                        fin: p.periode_fin,
                        dureeH: arrondi(dureeH),
                        inscrits,
                        heuresInscrits: arrondi(dureeH * inscrits),
                        heuresMin: arrondi(dureeH * p.nb_min),
                        heuresMax: arrondi(dureeH * p.nb_max),
                    };
                });

            return {
                nom: periode.nom,
                postes: postesAvecHeures,
                totalHeuresInscrits: arrondi(postesAvecHeures.reduce((s, p) => s + p.heuresInscrits, 0)),
                totalHeuresMin: arrondi(postesAvecHeures.reduce((s, p) => s + p.heuresMin, 0)),
                totalHeuresMax: arrondi(postesAvecHeures.reduce((s, p) => s + p.heuresMax, 0)),
            };
        });
    },

    getTotalHeures() {
        const periodes = this.getHeuresParPeriode();
        return {
            inscrits: Math.round(periodes.reduce((s, p) => s + p.totalHeuresInscrits, 0) * 10) / 10,
            min: Math.round(periodes.reduce((s, p) => s + p.totalHeuresMin, 0) * 10) / 10,
            max: Math.round(periodes.reduce((s, p) => s + p.totalHeuresMax, 0) * 10) / 10,
        };
    },

    // --- Analyse des inscriptions ---

    getPeriodesCritiques() {
        return this.periodes.map(periode => {
            const inscrits = this.getBenevolesInscritsForPeriode(periode.id);
            const min = this.getBenevolesMinForPeriode(periode.id);
            const max = this.getBenevolesMaxForPeriode(periode.id);
            const taux = min > 0 ? Math.round((inscrits / min) * 100) : 100;
            return { nom: periode.nom, inscrits, min, max, taux, manquantsMin: Math.max(0, min - inscrits), manquantsMax: Math.max(0, max - inscrits) };
        }).sort((a, b) => a.taux - b.taux);
    },

    getPostesCritiques() {
        const groups = {};
        this.postes.forEach(p => {
            const key = p.titre.trim().toLowerCase();
            if (!groups[key]) groups[key] = { titre: p.titre, inscrits: 0, min: 0, max: 0, nbPeriodes: 0 };
            groups[key].inscrits += p.inscrits_actuels || 0;
            groups[key].min += p.nb_min || 0;
            groups[key].max += p.nb_max || 0;
            groups[key].nbPeriodes++;
        });
        return Object.values(groups)
            .filter(g => g.min > 0 && g.inscrits < g.min)
            .map(g => ({ ...g, taux: Math.round((g.inscrits / g.min) * 100), manquantsMin: g.min - g.inscrits, manquantsMax: Math.max(0, g.max - g.inscrits) }))
            .sort((a, b) => a.taux - b.taux);
    },

    getTauxCouleur(taux) {
        if (taux < 50) return { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' };
        if (taux < 80) return { bar: 'bg-orange-400', text: 'text-orange-700', bg: 'bg-orange-50' };
        if (taux < 100) return { bar: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50' };
        return { bar: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' };
    },

    async generateRapportIA() {
        const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
        if (!apiKey) {
            this.rapportIAError = '❌ Clé API OpenRouter manquante. Ajoutez VITE_OPENROUTER_API_KEY dans votre fichier .env.';
            return;
        }

        this.rapportIALoading = true;
        this.rapportIAError = '';
        this.rapportIA = '';

        try {
            // Construire les données structurées par période
            const periodesData = this.periodes.map(periode => {
                const postesDesPeriode = this.postes.filter(p => p.periode_id === periode.id);
                const totalInscrits = postesDesPeriode.reduce((sum, p) => sum + (p.inscrits_actuels || 0), 0);
                const totalMin = postesDesPeriode.reduce((sum, p) => sum + (p.nb_min || 0), 0);
                const totalMax = postesDesPeriode.reduce((sum, p) => sum + (p.nb_max || 0), 0);

                return {
                    nom: periode.nom,
                    totalInscrits,
                    totalMin,
                    totalMax,
                    postes: postesDesPeriode.map(p => ({
                        titre: p.titre,
                        inscrits: p.inscrits_actuels || 0,
                        min: p.nb_min,
                        max: p.nb_max,
                        statut: (p.inscrits_actuels || 0) < p.nb_min ? 'INSUFFISANT' :
                                (p.inscrits_actuels || 0) >= p.nb_max ? 'COMPLET' : 'EN COURS'
                    }))
                };
            });

            const totalGeneralInscrits = this.postes.reduce((sum, p) => sum + (p.inscrits_actuels || 0), 0);
            const totalGeneralMin = this.postes.reduce((sum, p) => sum + (p.nb_min || 0), 0);
            const totalGeneralMax = this.postes.reduce((sum, p) => sum + (p.nb_max || 0), 0);

            const prompt = `Tu es un assistant pour le Championnat de France d'escalade de difficulté jeunes.
Voici les données d'avancement des inscriptions bénévoles en temps réel.

=== RÉSUMÉ GLOBAL ===
Total inscrits : ${totalGeneralInscrits}
Objectif minimum : ${totalGeneralMin}
Objectif maximum : ${totalGeneralMax}
Taux de remplissage (vs min) : ${totalGeneralMin > 0 ? Math.round((totalGeneralInscrits / totalGeneralMin) * 100) : 0}%

=== DÉTAIL PAR PÉRIODE ===
${periodesData.map(p => `
--- ${p.nom} ---
Inscrits : ${p.totalInscrits} / Min ${p.totalMin} / Max ${p.totalMax}
Postes :
${p.postes.map(poste => `  - ${poste.titre} : ${poste.inscrits} inscrits (min ${poste.min} / max ${poste.max}) [${poste.statut}]`).join('\n')}`).join('\n')}

=== INSTRUCTIONS ===
Génère un rapport d'avancement concis et pratique en français. Structure-le ainsi :
1. **Bilan global** : une phrase sur l'état général
2. **Points positifs** : postes bien remplis ou complets
3. **Points d'attention** : postes insuffisants ou critiques (inscrits < min), triés par urgence
4. **Recommandation** : une action concrète à faire en priorité

Sois direct et actionnable. Utilise des emojis pour rendre le rapport lisible. Maximum 300 mots.`;

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'Appel Bénévoles Admin'
                },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-001',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 600
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.error?.message || `Erreur HTTP ${response.status}`);
            }

            const result = await response.json();
            this.rapportIA = result.choices?.[0]?.message?.content || '(Aucune réponse reçue)';
            this.rapportIADate = new Date().toLocaleString('fr-FR');
        } catch (error) {
            this.rapportIAError = '❌ Erreur lors de la génération : ' + error.message;
        } finally {
            this.rapportIALoading = false;
        }
    },

    addMailingPostLine() {
        this.mailingPostLines.push({
            id: Date.now(),
            selectedTitle: '',
            selectedSlots: []
        });
    },

    removeMailingPostLine(index) {
        this.mailingPostLines.splice(index, 1);
        if (this.mailingPostLines.length === 0) {
            this.addMailingPostLine();
        }
    },

    getSlotsForPostTitle(title) {
        if (!title) return [];
        return this.postes
            .filter(p => p.titre === title)
            .sort((a, b) => {
                if (a.periode_ordre !== b.periode_ordre) {
                    return a.periode_ordre - b.periode_ordre;
                }
                return new Date(a.periode_debut).getTime() - new Date(b.periode_debut).getTime();
            });
    },

    getFilteredMailingBenevoles() {
        let list = [...this.benevoles];

        // 1. Filtre par rôle
        if (this.mailingFilterRole !== 'tous') {
            list = list.filter(b => b.role === this.mailingFilterRole);
        }

        // 2. Filtre par assignation/poste
        if (this.mailingFilterAssignation === 'avec_poste') {
            list = list.filter(b => (b.nb_inscriptions || 0) > 0);
        } else if (this.mailingFilterAssignation === 'sans_poste') {
            list = list.filter(b => (b.nb_inscriptions || 0) === 0);
        } else if (this.mailingFilterAssignation === 'poste_specifique') {
            // Collect all selected slot (poste) IDs across all lines
            const allSelectedSlotIds = new Set();
            this.mailingPostLines.forEach(line => {
                if (line.selectedTitle) {
                    line.selectedSlots.forEach(slotId => {
                        allSelectedSlotIds.add(slotId);
                    });
                }
            });

            if (allSelectedSlotIds.size > 0) {
                const matchedBenevoleIds = new Set();
                this.postes.forEach(p => {
                    if (allSelectedSlotIds.has(p.id)) {
                        (p.inscrits_ids || []).forEach(bId => {
                            matchedBenevoleIds.add(bId);
                        });
                    }
                });

                list = list.filter(b => matchedBenevoleIds.has(b.id));
            } else {
                list = [];
            }
        }

        return list;
    },

    getFilteredMailingEmails() {
        const list = this.getFilteredMailingBenevoles();
        return list
            .map(b => b.email ? b.email.trim() : '')
            .filter(email => email.length > 0);
    },

    copyMailingEmails() {
        const emails = this.getFilteredMailingEmails();
        if (emails.length === 0) {
            this.showToast('⚠️ Aucun e-mail à copier.', 'warning');
            return;
        }

        const emailString = emails.join(', ');
        navigator.clipboard.writeText(emailString)
            .then(() => {
                this.showToast(`📋 ${emails.length} adresses e-mail copiées !`, 'success');
            })
            .catch(err => {
                console.error('Erreur lors de la copie :', err);
                this.showToast('❌ Impossible de copier les e-mails automatiquement.', 'error');
            });
    },

    // --- Planning Interactif (Créateur Visuel) ---
    visualDaySelected: '',
    visualDays: [],
    dbJours: [],
    visualProgramEvents: [],
    visualPeriods: [],
    visualLines: [],
    visualDeletedPosteIds: [],
    visualDeletedPeriodIds: [],
    visualDeletedEventIds: [],
    dragState: null,
    hoursRange: { start: 6, end: 22 },
    periodConflicts: [],
    autoSaveStatus: 'synced', // 'synced', 'saving', 'error'
    autoSaveTimeout: null,
    isSavingVisual: false,
    hasPendingChanges: false,
    showAddDayModal: false,
    newDayDate: '2026-05-18',

    // États pour le filtrage et les crédits des périodes associées
    selectedPeriodFilterId: null,
    showPeriodCreditModal: false,
    editPeriodCreditData: {
        idx: -1,
        nom: '',
        montant_credit: 0
    },
    periodDragState: null,


    // États pour les modals d'édition et création
    showAddShiftModal: false,
    addShiftData: {
        lineIndex: -1,
        titre: '',
        description: '',
        debut: 8,
        fin: 12,
        nb_min: 1,
        nb_max: 5,
        referent_id: ''
    },
    showEditShiftModal: false,
    editShiftData: {
        lineIndex: -1,
        shiftIndex: -1,
        id: '',
        titre: '',
        description: '',
        debut: 8,
        fin: 12,
        nb_min: 1,
        nb_max: 5,
        referent_id: ''
    },
    // État pour le tooltip au survol
    hoveredShift: null, // { shift, line, referentNom, x: 0, y: 0 }
    
    // États pour le tracé visuel de créneau
    isDrawingShift: false,
    drawingLineIndex: -1,
    drawingState: null, // { lineIdx, startHour, currentHour, containerWidth, containerLeft }

    // États pour le drag-and-drop de lignes (clic long)
    lineDragTimer: null,
    lineDragState: null, // { lineIndex: -1, startY: 0, currentY: 0 }

    getLocalDateKey(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    async initVisualCreator() {
        // Enregistrer la sécurité anti-fermeture
        if (!window._beforeUnloadHandlerRegistered) {
            window._beforeUnloadHandlerRegistered = true;
            window.addEventListener('beforeunload', (e) => {
                const hasPending = this.autoSaveTimeout || this.autoSaveStatus === 'saving' || this.isSavingVisual;
                if (hasPending) {
                    e.preventDefault();
                    e.returnValue = 'Vous avez des modifications de planning non enregistrées. Voulez-vous vraiment quitter ?';
                    return e.returnValue;
                }
            });
        }

        const days = new Set(this.dbJours || []);
        
        // 1. Extraire les jours des postes existants en utilisant getLocalDateKey
        this.postes.forEach(p => {
            if (p.periode_debut) {
                days.add(this.getLocalDateKey(p.periode_debut));
            }
        });
        
        // 2. Extraire du programme de la DB s'il est chargé
        if (this.dbProgramme && this.dbProgramme.days) {
            Object.keys(this.dbProgramme.days).forEach(d => days.add(d));
        }

        // 3. Extraire également les jours à partir des périodes existantes dans la base de données.
        // Si une période a été créée pour un jour mais n'a pas encore de postes ou de programme,
        // son nom commencera par le préfixe textuel du jour (ex: "Lundi 18 mai").
        // Pour les détecter, on peut scanner une plage de dates raisonnable autour des jours déjà identifiés (ou de la date actuelle).
        let baseDate = new Date();
        if (days.size > 0) {
            // Utiliser le premier jour identifié comme base
            const sortedIdentified = Array.from(days).sort();
            baseDate = new Date(sortedIdentified[0] + 'T00:00:00');
        }

        // Générer une plage de 30 jours avant et 30 jours après la date de base
        for (let i = -30; i <= 30; i++) {
            const tempDate = new Date(baseDate.getTime());
            tempDate.setDate(baseDate.getDate() + i);
            
            const y = tempDate.getFullYear();
            const m = String(tempDate.getMonth() + 1).padStart(2, '0');
            const day = String(tempDate.getDate()).padStart(2, '0');
            const dateKey = `${y}-${m}-${day}`;

            // Si le jour est déjà dans les Set, inutile de tester
            if (days.has(dateKey)) continue;

            const dayLabel = tempDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const dayPrefix = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
            const dayPrefixNoYear = dayPrefix.split(' 202')[0];

            // Vérifier si une période commence par le libellé textuel de ce jour
            const hasMatchingPeriod = this.periodes.some(per => per.nom && per.nom.startsWith(dayPrefixNoYear));
            if (hasMatchingPeriod) {
                days.add(dateKey);
            }
        }
        
        // Fallback s'il n'y a rien
        if (days.size === 0) {
            days.add('2026-05-16');
            days.add('2026-05-17');
        }
        
        this.visualDays = Array.from(days).sort();
        
        // Sélectionner le premier jour par défaut
        if (this.visualDays.length > 0) {
            await this.selectVisualDay(this.visualDays[0]);
        }
    },

    async selectVisualDay(day) {
        this.visualDaySelected = day;
        this.visualDeletedPosteIds = [];
        this.visualDeletedPeriodIds = [];
        this.visualDeletedEventIds = [];
        this.dragState = null;
        this.selectedPeriodFilterId = null; // Réinitialiser le filtre de période au changement de jour
        
        // 1. Charger les événements de programme pour ce jour
        this.visualProgramEvents = [];
        
        const timelineAppEl = document.querySelector('[x-data="adminTimelineApp()"]');
        let currentDbProg = null;
        if (timelineAppEl && timelineAppEl.__x && timelineAppEl.__x.$data) {
            currentDbProg = timelineAppEl.__x.$data.dbProgramme;
        }

        const activeProg = currentDbProg || (this.dbProgramme);
        if (activeProg && activeProg.days && activeProg.days[day]) {
            this.visualProgramEvents = activeProg.days[day].events.map(ev => ({
                id: ev.id || null,
                hStart: ev.hStart,
                description: ev.description
            })).sort((a, b) => a.hStart - b.hStart);
        }

        // 2. Filtrer les postes de ce jour en utilisant getLocalDateKey
        const dayPostes = this.postes.filter(p => p.periode_debut && this.getLocalDateKey(p.periode_debut) === day);

        // 3. Filtrer les périodes de ce jour
        const d = new Date(day + 'T00:00:00');
        const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const dayPrefix = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
        
        // On isole la partie "Jour DD Mois" (ex: "Samedi 16 Mai") pour matcher même si l'année diffère légèrement
        const dayPrefixNoYear = dayPrefix.split(' 202')[0];

        const dayPeriods = this.periodes.filter(per => {
            const hasPostsOnDay = dayPostes.some(p => p.periode_id === per.id);
            const isDayPrefix = per.nom && per.nom.startsWith(dayPrefixNoYear);
            return isDayPrefix || hasPostsOnDay;
        });

        this.visualPeriods = dayPeriods.map((per, index) => {
            let debut = null;
            let fin = null;

            // Essayer d'extraire les heures personnalisées directement depuis le nom de la période
            if (per.nom) {
                const timeMatch = per.nom.match(/ - (\d{2})[:h](\d{2}) \/ (\d{2})[:h](\d{2})/);
                if (timeMatch) {
                    debut = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
                    fin = parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 60;
                }
            }

            // Fallback si l'extraction depuis le nom a échoué (anciennes périodes ou format libre)
            if (debut === null || fin === null) {
                const perPostes = dayPostes.filter(p => p.periode_id === per.id);
                if (perPostes.length > 0) {
                    const starts = perPostes.map(p => {
                        const d = new Date(p.periode_debut);
                        return d.getHours() + d.getMinutes() / 60;
                    });
                    const ends = perPostes.map(p => {
                        const d = new Date(p.periode_fin);
                        return d.getHours() + d.getMinutes() / 60;
                    });
                    debut = Math.min(...starts);
                    fin = Math.max(...ends);
                } else {
                    if (index === 0) { debut = 7; fin = 13; }
                    else if (index === 1) { debut = 13; fin = 19; }
                    else { debut = 19; fin = 22; }
                }
            }
            
            return {
                id: per.id,
                nom: per.nom,
                ordre: per.ordre,
                montant_credit: per.montant_credit || 0.00,
                debut,
                fin
            };
        }).sort((a, b) => a.ordre - b.ordre);

        // S'assurer qu'il y a au moins une période par défaut pour le jour s'il n'y en a aucune
        if (this.visualPeriods.length === 0) {
            const tempPerId = crypto.randomUUID();
            this.visualPeriods.push({
                id: tempPerId,
                nom: `${dayPrefixNoYear} - 08:00 / 12:00`,
                ordre: 1,
                montant_credit: 10.00,
                debut: 8,
                fin: 12,
                isNew: true
            });
        }


        // 4. Regrouper les postes de ce jour par Titre et Description (Lignes du Gantt)
        const groups = {};
        dayPostes.forEach(p => {
            const key = `${p.titre.trim()}|||${(p.description || '').trim()}`;
            if (!groups[key]) {
                const dayOrder = p.ordre !== undefined ? p.ordre : 999999;

                groups[key] = {
                    titre: p.titre,
                    description: p.description || '',
                    shifts: [],
                    ordre: dayOrder
                };
            }
            
            const dStart = new Date(p.periode_debut);
            const dEnd = new Date(p.periode_fin);
            const startHour = dStart.getHours() + dStart.getMinutes() / 60;
            const endHour = dEnd.getHours() + dEnd.getMinutes() / 60;
            
            groups[key].shifts.push({
                id: p.id,
                debut: startHour,
                fin: endHour,
                nb_min: p.nb_min,
                nb_max: p.nb_max,
                referent_id: p.referent_id || '',
                inscrits_actuels: p.inscrits_actuels || 0,
                inscrits_noms: p.inscrits_noms || [],
                periode_id: p.periode_id || null,
                error: null
            });
        });

        const initialLines = Object.values(groups);
        
        // Trier par l'ordre persistant dans Supabase pour ce jour, puis alphabétiquement par titre
        initialLines.sort((a, b) => {
            if (a.ordre !== b.ordre) {
                return a.ordre - b.ordre;
            }
            return a.titre.localeCompare(b.titre);
        });

        this.visualLines = initialLines.map((line, index) => ({
            ...line,
            lineIndex: index
        }));

        this.validateAndAutoAssignPeriods();
    },

    addVisualDay() {
        this.newDayDate = '2026-05-18';
        this.showAddDayModal = true;
    },

    confirmAddVisualDay() {
        const d = this.newDayDate;
        if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
            if (!this.visualDays.includes(d)) {
                this.visualDays.push(d);
                this.visualDays.sort();
                this.selectVisualDay(d);
                this.showAddDayModal = false;
                // Déclencher immédiatement la sauvegarde automatique pour enregistrer la période par défaut créée pour ce nouveau jour dans Supabase
                this.triggerAutoSave();
            } else {
                this.showToast("Ce jour existe déjà !", "warning");
            }
        } else {
            this.showToast("Format de date invalide. Utilisez AAAA-MM-JJ.", "error");
        }
    },

    async deleteVisualDay(day) {
        if (!day) return;
        
        const formattedDayStr = this.formatDay(day);
        if (!confirm(`⚠️ Attention : Êtes-vous sûr de vouloir supprimer le jour "${formattedDayStr}" ?\n\nCette action supprimera DÉFINITIVEMENT :\n- Tous les postes et créneaux associés à ce jour\n- Toutes les périodes définies pour ce jour\n- Toutes les inscriptions de bénévoles sur ces postes\n- Tous les événements de programme de ce jour\n\nCette action est irréversible et modifiera directement la base de production. Voulez-vous continuer ?`)) {
            return;
        }

        this.loading = true;

        try {

            // 3. Supprimer de Supabase : on supprime le jour, les cascades DB font le reste
            //    jours → type_postes (CASCADE) → postes (CASCADE) → inscriptions (CASCADE)

            // Programme du jour (pas en cascade, à supprimer manuellement)
            const { error: progError } = await ApiService.delete('programme', { date_ref: day });
            if (progError) {
                console.warn("Erreur lors de la suppression du programme :", progError);
            }

            // Supprimer le jour — la cascade PostgreSQL nettoie type_postes, postes, inscriptions
            const { error: jourError } = await ApiService.delete('jours', { date_ref: day });
            if (jourError) {
                console.error("Erreur lors de la suppression du jour de la table jours :", jourError);
                throw jourError;
            }

            // 4. Mettre à jour l'état local
            this.visualDays = this.visualDays.filter(d => d !== day);

            // 5. Recharger toutes les données pour rafraîchir l'application
            await this.loadData();

            // 6. Sélectionner un autre jour
            if (this.visualDays.length > 0) {
                await this.selectVisualDay(this.visualDays[0]);
            } else {
                await this.initVisualCreator();
            }

            this.showToast(`✅ Le jour "${formattedDayStr}" et toutes ses données associées ont été supprimés avec succès.`, 'success');
        } catch (err) {
            console.error("Erreur de suppression du jour :", err);
            this.showToast(`❌ Erreur lors de la suppression : ${err.message}`, 'error');
        } finally {
            this.loading = false;
        }
    },

    addVisualLine(titre = '', description = '') {
        const index = this.visualLines.length;
        this.visualLines.push({
            titre: titre || 'Nouveau type de poste',
            description: description || '',
            shifts: [],
            lineIndex: index
        });
        this.triggerAutoSave();
    },

    deleteVisualLine(lineIndex) {
        if (!confirm("Voulez-vous supprimer cette ligne de postes et tous ses créneaux ?")) return;
        const line = this.visualLines[lineIndex];
        if (line && line.shifts) {
            line.shifts.forEach(shift => {
                if (shift.id && !shift.isNew) {
                    this.visualDeletedPosteIds.push(shift.id);
                }
            });
        }
        // Marquer le type_poste de cette ligne pour suppression en DB
        if (line && line.titre) {
            this.visualDeletedTypePosteTitres = this.visualDeletedTypePosteTitres || [];
            this.visualDeletedTypePosteTitres.push({ date_ref: this.visualDaySelected, titre: line.titre.trim() });
        }
        this.visualLines.splice(lineIndex, 1);
        this.visualLines.forEach((l, idx) => l.lineIndex = idx);
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    addVisualShift(lineIndex) {
        const line = this.visualLines[lineIndex];
        if (!line) return;

        let debut = 8;
        let fin = 12;
        
        let hasOverlap = true;
        while (hasOverlap && fin <= this.hoursRange.end) {
            hasOverlap = line.shifts.some(s => (debut < s.fin && fin > s.debut));
            if (hasOverlap) {
                debut += 1;
                fin += 1;
            }
        }

        if (hasOverlap) {
            debut = this.hoursRange.start;
            fin = debut + 2;
        }

        const tempId = crypto.randomUUID();
        line.shifts.push({
            id: tempId,
            isNew: true,
            debut,
            fin,
            nb_min: 1,
            nb_max: 5,
            referent_id: '',
            inscrits_actuels: 0,
            periode_id: null,
            error: null
        });

        line.shifts.sort((a, b) => a.debut - b.debut);
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    deleteVisualShift(lineIndex, shiftIndex) {
        const line = this.visualLines[lineIndex];
        if (!line) return;
        const shift = line.shifts[shiftIndex];
        if (shift.id && !shift.isNew) {
            this.visualDeletedPosteIds.push(shift.id);
        }
        line.shifts.splice(shiftIndex, 1);
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    startDrag(event, lineIndex, shiftIndex, mode) {
        event.preventDefault();
        const line = this.visualLines[lineIndex];
        if (!line) return;
        const shift = line.shifts[shiftIndex];
        if (!shift) return;

        const container = event.target.closest('.timeline-track');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        
        this.dragState = {
            lineIndex,
            shiftIndex,
            mode,
            initialDebut: shift.debut,
            initialFin: shift.fin,
            startX: event.clientX || (event.touches ? event.touches[0].clientX : 0),
            containerWidth: rect.width || 800,
            hasMoved: false
        };

        const handleMove = (e) => this.handleDrag(e);
        const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleUp);
            this.stopDrag();
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleUp);
    },

    handleDrag(event) {
        if (!this.dragState) return;
        if (event.cancelable) event.preventDefault();

        const clientX = event.clientX || (event.touches ? event.touches[0].clientX : 0);
        const dx = clientX - this.dragState.startX;

        if (Math.abs(dx) > 4) {
            this.dragState.hasMoved = true;
        }
        
        const totalHours = this.hoursRange.end - this.hoursRange.start;
        const deltaHours = (dx / this.dragState.containerWidth) * totalHours;
        const deltaHoursSnapped = Math.round(deltaHours / 0.25) * 0.25;

        const line = this.visualLines[this.dragState.lineIndex];
        const shift = line.shifts[this.dragState.shiftIndex];

        if (this.dragState.mode === 'move') {
            const duration = this.dragState.initialFin - this.dragState.initialDebut;
            let newDebut = this.dragState.initialDebut + deltaHoursSnapped;

            // Identifie le créneau immédiatement à gauche (le plus grand s.fin <= début initial)
            let gaucheShift = null;
            line.shifts.forEach((s, idx) => {
                if (idx === this.dragState.shiftIndex) return;
                if (s.fin <= this.dragState.initialDebut) {
                    if (!gaucheShift || s.fin > gaucheShift.fin) {
                        gaucheShift = s;
                    }
                }
            });

            // Identifie le créneau immédiatement à droite (le plus petit s.debut >= fin initiale)
            let droiteShift = null;
            line.shifts.forEach((s, idx) => {
                if (idx === this.dragState.shiftIndex) return;
                if (s.debut >= this.dragState.initialFin) {
                    if (!droiteShift || s.debut < droiteShift.debut) {
                        droiteShift = s;
                    }
                }
            });

            // Détermine les limites physiques réelles (bornes de glissement)
            const limiteGauche = gaucheShift ? gaucheShift.fin : this.hoursRange.start;
            const limiteDroite = droiteShift ? droiteShift.debut : this.hoursRange.end;

            // Contraint newDebut pour rester strictement dans l'intervalle de sécurité
            newDebut = Math.max(limiteGauche, Math.min(limiteDroite - duration, newDebut));
            const newFin = newDebut + duration;

            // Applique les valeurs directement
            shift.debut = newDebut;
            shift.fin = newFin;
        } 
        else if (this.dragState.mode === 'resize-start') {
            let newDebut = this.dragState.initialDebut + deltaHoursSnapped;
            newDebut = Math.max(this.hoursRange.start, Math.min(shift.fin - 0.5, newDebut));

            const previousShift = line.shifts[this.dragState.shiftIndex - 1];
            if (previousShift && newDebut < previousShift.fin) {
                newDebut = previousShift.fin;
            }

            shift.debut = newDebut;
        } 
        else if (this.dragState.mode === 'resize-end') {
            let newFin = this.dragState.initialFin + deltaHoursSnapped;
            newFin = Math.min(this.hoursRange.end, Math.max(shift.debut + 0.5, newFin));

            const nextShift = line.shifts[this.dragState.shiftIndex + 1];
            if (nextShift && newFin > nextShift.debut) {
                newFin = nextShift.debut;
            }

            shift.fin = newFin;
        }
    },

    stopDrag() {
        if (this.dragState && !this.dragState.hasMoved && this.dragState.mode === 'move') {
            const lIdx = this.dragState.lineIndex;
            const sIdx = this.dragState.shiftIndex;
            this.dragState = null;
            this.openEditShiftModal(lIdx, sIdx);
            return;
        }

        this.dragState = null;
        this.visualLines.forEach(line => {
            line.shifts.sort((a, b) => a.debut - b.debut);
        });
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    addVisualPeriod() {
        // Ajouter une période avec heures par défaut
        const ordre = this.visualPeriods.length + 1;
        let debut = 8;
        let fin = 12;
        
        if (this.visualPeriods.length > 0) {
            const last = this.visualPeriods[this.visualPeriods.length - 1];
            debut = last.fin;
            fin = Math.min(this.hoursRange.end, debut + 4);
        }

        const tempPerId = crypto.randomUUID();
        this.visualPeriods.push({
            id: tempPerId,
            nom: '', // Sera défini par validateAndAutoAssignPeriods()
            ordre,
            montant_credit: 10.00,
            debut,
            fin,
            isNew: true
        });

        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    deleteVisualPeriod(index) {
        if (!confirm("Voulez-vous supprimer cette période ? Les postes associés seront automatiquement réassignés.")) return;
        const per = this.visualPeriods[index];
        if (per && per.id && !per.isNew) {
            this.visualDeletedPeriodIds.push(per.id);
        }
        this.visualPeriods.splice(index, 1);
        this.visualPeriods.forEach((p, idx) => p.ordre = idx + 1);
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    addVisualProgramEvent() {
        const desc = prompt("Description de l'événement (ex: Qualifications U15) :");
        if (!desc || desc.trim() === '') return;
        
        const hStr = prompt("Heure de début (Format: HHhMM, ex: 08h30) :", "08h00");
        const m = hStr ? hStr.match(/^(\d{1,2})h(\d{2})$/) : null;
        if (!m) {
            this.showToast("Format d'heure invalide. Utilisez HHhMM (ex: 08h30).", "error");
            return;
        }

        const h = parseInt(m[1]);
        const min = parseInt(m[2]);
        const hStart = h + min / 60;

        this.visualProgramEvents.push({
            id: crypto.randomUUID(),
            isNew: true,
            hStart,
            description: desc.trim()
        });

        this.visualProgramEvents.sort((a, b) => a.hStart - b.hStart);
        this.triggerAutoSave();
    },

    deleteVisualProgramEvent(index) {
        const ev = this.visualProgramEvents[index];
        if (ev && ev.id && !ev.isNew) {
            this.visualDeletedEventIds.push(ev.id);
        }
        this.visualProgramEvents.splice(index, 1);
        this.triggerAutoSave();
    },

    validateAndAutoAssignPeriods() {
        this.periodConflicts = [];
        
        // 1. Calculer les extrêmes des créneaux de ce jour (H_min et H_max)
        let H_min = 8;
        let H_max = 18;
        let hasShifts = false;

        const allShifts = [];
        this.visualLines.forEach(line => {
            line.shifts.forEach(shift => {
                allShifts.push({
                    shift,
                    lineTitle: line.titre.trim().toLowerCase(),
                    lineTitleRaw: line.titre.trim(),
                    lineDescription: line.description ? line.description.trim() : ''
                });
            });
        });

        if (allShifts.length > 0) {
            hasShifts = true;
            H_min = Math.min(...allShifts.map(s => s.shift.debut));
            H_max = Math.max(...allShifts.map(s => s.shift.fin));
        }

        // S'assurer d'avoir au moins une période par défaut si la liste est vide
        if (this.visualPeriods.length === 0) {
            const tempPerId = crypto.randomUUID();
            this.visualPeriods.push({
                id: tempPerId,
                nom: '',
                ordre: 1,
                montant_credit: 10.00,
                debut: H_min,
                fin: H_max,
                isNew: true
            });
        }

        // Trier les périodes existantes par début
        this.visualPeriods.sort((a, b) => a.debut - b.debut);

        // Fixer les extrémités absolues : début de la première période et fin de la dernière période
        this.visualPeriods[0].debut = H_min;
        this.visualPeriods[this.visualPeriods.length - 1].fin = H_max;

        // Assurer la continuité exacte des jonctions intermédiaires et que chaque période dure au moins 0.5h (30 min)
        for (let i = 0; i < this.visualPeriods.length - 1; i++) {
            const current = this.visualPeriods[i];
            const next = this.visualPeriods[i+1];
            
            // Faire coïncider la fin de l'une avec le début de l'autre
            next.debut = current.fin;

            // Limite de 0.5h pour le bloc courant
            const minAllowedFin = current.debut + 0.5;
            if (current.fin < minAllowedFin) {
                current.fin = minAllowedFin;
                next.debut = minAllowedFin;
            }
        }

        // Si le recalibrage avant a poussé des bornes au-delà de la fin, faire une passe arrière
        for (let i = this.visualPeriods.length - 1; i > 0; i--) {
            const current = this.visualPeriods[i];
            const prev = this.visualPeriods[i-1];
            
            if (current.debut > current.fin - 0.5) {
                current.debut = current.fin - 0.5;
                prev.fin = current.debut;
            }
        }

        // Si l'intervalle total est trop petit pour respecter la contrainte de 30 min par période,
        // on redistribue uniformément sur [H_min, H_max]
        const totalDuration = H_max - H_min;
        const numPeriods = this.visualPeriods.length;
        const minRequiredTotal = numPeriods * 0.5;

        if (totalDuration < minRequiredTotal) {
            const step = totalDuration / numPeriods;
            for (let i = 0; i < numPeriods; i++) {
                this.visualPeriods[i].debut = H_min + i * step;
                this.visualPeriods[i].fin = H_min + (i + 1) * step;
            }
        }

        // Mettre à jour l'ordre de 1 à N
        this.visualPeriods.forEach((p, idx) => p.ordre = idx + 1);

        // Auto-nommer chaque période en fonction de son jour et de ses heures (exclusivité sans l'année)
        const d = new Date(this.visualDaySelected + 'T00:00:00');
        const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const dayPrefix = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
        const dayPrefixNoYear = dayPrefix.split(' 202')[0];

        const formatHourMin = (dec) => {
            const h = Math.floor(dec);
            const m = Math.round((dec - h) * 60);
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        };

        this.visualPeriods.forEach(per => {
            per.nom = `${dayPrefixNoYear} - ${formatHourMin(per.debut)} / ${formatHourMin(per.fin)}`;
        });

        // 2. Assigner chaque créneau (shift) à sa période avec la règle de la durée maximale de chevauchement
        this.visualLines.forEach(line => {
            line.shifts.forEach(shift => {
                shift.error = null;
                shift.periode_id = null;

                let maxOverlap = 0;
                let bestPeriodId = null;

                this.visualPeriods.forEach(per => {
                    const overlap = Math.max(0, Math.min(shift.fin, per.fin) - Math.max(shift.debut, per.debut));
                    if (overlap > maxOverlap) {
                        maxOverlap = overlap;
                        bestPeriodId = per.id;
                    }
                });

                if (bestPeriodId) {
                    shift.periode_id = bestPeriodId;
                } else {
                    // Fallback sur la période la plus proche du milieu du shift si pas d'intersection
                    if (this.visualPeriods.length > 0) {
                        const mid = (shift.debut + shift.fin) / 2;
                        let minDistance = Infinity;
                        let closestPeriodId = this.visualPeriods[0].id;
                        
                        this.visualPeriods.forEach(per => {
                            const perMid = (per.debut + per.fin) / 2;
                            const dist = Math.abs(mid - perMid);
                            if (dist < minDistance) {
                                minDistance = dist;
                                closestPeriodId = per.id;
                            }
                        });
                        shift.periode_id = closestPeriodId;
                    }
                }
            });
        });

        // 3. Détecter les conflits de chevauchement pour des créneaux de même titre
        const formatDecimalHour = (dec) => {
            const h = Math.floor(dec);
            const m = Math.round((dec - h) * 60);
            return `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
        };

        for (let i = 0; i < allShifts.length; i++) {
            const s1 = allShifts[i];
            for (let j = i + 1; j < allShifts.length; j++) {
                const s2 = allShifts[j];

                if (s1.lineTitle === s2.lineTitle) {
                    if (s1.shift.debut < s2.shift.fin - 0.01 && s1.shift.fin > s2.shift.debut + 0.01) {
                        s1.shift.error = 'Chevauchement';
                        s2.shift.error = 'Chevauchement';

                        const time1 = `${formatDecimalHour(s1.shift.debut)}–${formatDecimalHour(s1.shift.fin)}`;
                        const time2 = `${formatDecimalHour(s2.shift.debut)}–${formatDecimalHour(s2.shift.fin)}`;

                        let conflictMsg = `Le créneau ${time1} de "${s1.lineTitleRaw}"`;
                        if (s1.lineDescription) conflictMsg += ` (${s1.lineDescription})`;
                        conflictMsg += ` chevauche le créneau ${time2} de "${s2.lineTitleRaw}"`;
                        if (s2.lineDescription) conflictMsg += ` (${s2.lineDescription})`;

                        if (!this.periodConflicts.includes(conflictMsg)) {
                            this.periodConflicts.push(conflictMsg);
                        }
                    }
                }
            }
        }
    },

    togglePeriodFilter(perId) {
        if (this.selectedPeriodFilterId === perId) {
            this.selectedPeriodFilterId = null;
        } else {
            this.selectedPeriodFilterId = perId;
        }
    },

    splitVisualPeriod() {
        if (this.visualPeriods.length === 0) {
            this.validateAndAutoAssignPeriods();
            return;
        }

        // Trouver la période la plus longue
        let maxDuration = 0;
        let longestPeriodIdx = 0;
        this.visualPeriods.forEach((per, idx) => {
            const dur = per.fin - per.debut;
            if (dur > maxDuration) {
                maxDuration = dur;
                longestPeriodIdx = idx;
            }
        });

        const targetPeriod = this.visualPeriods[longestPeriodIdx];
        if (maxDuration < 1.0) {
            this.showToast("La période la plus longue est trop courte pour être scindée (durée minimale d'une heure requise).", "warning");
            return;
        }

        // Calculer le milieu snappé à 0.25h
        const rawMid = (targetPeriod.debut + targetPeriod.fin) / 2;
        const mid = Math.round(rawMid / 0.25) * 0.25;

        // S'assurer que les deux nouvelles périodes durent au moins 0.5h
        if (mid - targetPeriod.debut < 0.5 || targetPeriod.fin - mid < 0.5) {
            this.showToast("Impossible de scinder à cet endroit : les périodes doivent durer au moins 30 minutes.", "warning");
            return;
        }

        // Créer la nouvelle période
        const tempPerId = crypto.randomUUID();
        const newPeriod = {
            id: tempPerId,
            nom: '',
            ordre: targetPeriod.ordre + 1,
            montant_credit: targetPeriod.montant_credit || 10.00,
            debut: mid,
            fin: targetPeriod.fin,
            isNew: true
        };

        // Mettre à jour la fin de la période scindée
        targetPeriod.fin = mid;

        // Insérer la nouvelle période juste après celle scindée
        this.visualPeriods.splice(longestPeriodIdx + 1, 0, newPeriod);

        // Recalculer l'ordre
        this.visualPeriods.forEach((p, idx) => p.ordre = idx + 1);

        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    removeVisualPeriod() {
        if (this.visualPeriods.length <= 1) {
            this.showToast("Impossible de supprimer la dernière période restante. Il doit y en avoir au moins une.", "warning");
            return;
        }

        let idxToDelete = this.visualPeriods.length - 1;
        if (this.selectedPeriodFilterId !== null) {
            const idx = this.visualPeriods.findIndex(p => p.id === this.selectedPeriodFilterId);
            if (idx !== -1) {
                idxToDelete = idx;
            }
        }

        const per = this.visualPeriods[idxToDelete];
        if (!per) return;

        const timeStr = per.nom.split(' - ')[1] || per.nom;
        if (!confirm(`Voulez-vous supprimer la période "${timeStr}" ?\nLes créneaux associés seront automatiquement réassignés aux autres périodes les plus adaptées.`)) {
            return;
        }

        if (per.id && !String(per.id).startsWith('temp-per-')) {
            this.visualDeletedPeriodIds.push(per.id);
        }
        this.visualPeriods.splice(idxToDelete, 1);
        
        // Si on a supprimé la période qui servait de filtre, réinitialiser le filtre
        if (this.selectedPeriodFilterId === per.id) {
            this.selectedPeriodFilterId = null;
        }

        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },


    startPeriodDrag(event, index) {
        event.preventDefault();
        const per = this.visualPeriods[index];
        const nextPer = this.visualPeriods[index + 1];
        if (!per || !nextPer) return;

        const container = event.target.closest('.relative');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        
        this.periodDragState = {
            index,
            initialFin: per.fin,
            startX: event.clientX || (event.touches ? event.touches[0].clientX : 0),
            containerWidth: rect.width || 800,
            minFin: per.debut + 0.5,
            maxFin: nextPer.fin - 0.5
        };

        const handleMove = (e) => this.handlePeriodDrag(e);
        const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleUp);
            this.stopPeriodDrag();
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleUp);
    },

    handlePeriodDrag(event) {
        if (!this.periodDragState) return;
        if (event.cancelable) event.preventDefault();

        const clientX = event.clientX || (event.touches ? event.touches[0].clientX : 0);
        const dx = clientX - this.periodDragState.startX;
        
        const totalHours = this.hoursRange.end - this.hoursRange.start;
        const deltaHours = (dx / this.periodDragState.containerWidth) * totalHours;
        const deltaHoursSnapped = Math.round(deltaHours / 0.25) * 0.25;

        let newFin = this.periodDragState.initialFin + deltaHoursSnapped;
        newFin = Math.max(this.periodDragState.minFin, Math.min(this.periodDragState.maxFin, newFin));

        const per = this.visualPeriods[this.periodDragState.index];
        const nextPer = this.visualPeriods[this.periodDragState.index + 1];
        
        per.fin = newFin;
        nextPer.debut = newFin;
    },

    stopPeriodDrag() {
        this.periodDragState = null;
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    openPeriodCreditModal(idx) {
        const per = this.visualPeriods[idx];
        if (!per) return;
        this.editPeriodCreditData = {
            idx,
            nom: per.nom,
            montant_credit: per.montant_credit || 0
        };
        this.showPeriodCreditModal = true;
    },

    savePeriodCredit() {
        const idx = this.editPeriodCreditData.idx;
        if (idx !== -1 && this.visualPeriods[idx]) {
            this.visualPeriods[idx].montant_credit = parseFloat(this.editPeriodCreditData.montant_credit || 0);
            this.showPeriodCreditModal = false;
            this.triggerAutoSave();
        }
    },



    triggerAutoSave() {
        this.autoSaveStatus = 'saving';
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.autoSaveTimeout = setTimeout(async () => {
            try {
                await this.saveVisualCreator(true);
                this.autoSaveStatus = 'synced';
            } catch (err) {
                console.error("Erreur de sauvegarde automatique:", err);
                this.autoSaveStatus = 'error';
            }
        }, 1000);
    },

    async saveVisualCreator(isSilent = false) {
        if (this.isSavingVisual) {
            console.log("Sauvegarde déjà en cours, report de l'enregistrement...");
            this.hasPendingChanges = true;
            return;
        }

        this.validateAndAutoAssignPeriods();

        if (this.periodConflicts.length > 0) {
            if (!isSilent) {
                this.showToast("❌ Enregistrement impossible : veuillez corriger les chevauchements de créneaux détectés.", "error");
            }
            throw new Error("Chevauchement de créneaux de poste détecté.");
        }

        this.isSavingVisual = true;
        if (!isSilent) {
            this.loading = true;
        }

        try {
            const deletePromises = [];
            
            // Conserver les IDs supprimés dans un Set avant de vider le tableau lors de la suppression physique
            const deletedPeriodIdsSet = new Set(this.visualDeletedPeriodIds);

            if (this.visualDeletedPosteIds.length > 0) {
                deletePromises.push(ApiService.delete('postes', { id: this.visualDeletedPosteIds }));
            }
            if (this.visualDeletedEventIds.length > 0) {
                try {
                    deletePromises.push(ApiService.delete('programme', { id: this.visualDeletedEventIds }));
                } catch(e){}
            }

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                this.visualDeletedPosteIds = [];
                this.visualDeletedEventIds = [];
            }

            // Gérer la suppression des périodes de manière robuste et sécurisée
            if (this.visualDeletedPeriodIds.length > 0) {
                // Détacher les postes pour chaque période individuellement (compatible avec updateMany)
                for (const periodId of this.visualDeletedPeriodIds) {
                    const { error: detachError } = await ApiService.updateMany('postes', { periode_id: null }, { periode_id: periodId });
                    if (detachError) {
                        console.error(`[Detach] Erreur pour la période ${periodId} :`, detachError);
                    }
                }
                
                // Supprimer physiquement les périodes de la table 'periodes'
                const { error: deletePerError } = await ApiService.delete('periodes', { id: this.visualDeletedPeriodIds });
                if (deletePerError) {
                    throw deletePerError;
                }
                this.visualDeletedPeriodIds = [];
            }

            // 1. Rassembler toutes les périodes (existantes d'autres jours et courantes du créateur visuel)
            const currentPeriodIds = new Set(this.visualPeriods.map(p => p.id));
            const otherDayPeriods = this.periodes.filter(p => !currentPeriodIds.has(p.id) && !deletedPeriodIdsSet.has(p.id));
            
            const allPeriodsToSave = [
                ...otherDayPeriods,
                ...this.visualPeriods
            ];

            // 2. Fonction robuste pour calculer le poids chronologique d'une période
            const getPeriodeWeight = (per) => {
                if (currentPeriodIds.has(per.id)) {
                    const vp = this.visualPeriods.find(p => p.id === per.id);
                    const dayTime = new Date(this.visualDaySelected + 'T00:00:00').getTime();
                    const hourOffset = (vp.debut || 0) * 3600000;
                    return dayTime + hourOffset;
                }

                const perPostes = this.postes.filter(p => p.periode_id === per.id && p.periode_debut);
                if (perPostes.length > 0) {
                    const starts = perPostes.map(p => new Date(p.periode_debut).getTime());
                    return Math.min(...starts);
                }

                if (per.nom) {
                    const cleanNom = per.nom.toLowerCase();
                    const moisMap = {
                        'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
                        'juillet': 6, 'aout': 7, 'août': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
                    };

                    const match = cleanNom.match(/(\d{1,2})\s+([a-zéû]+)/);
                    if (match) {
                        const dayNum = parseInt(match[1]);
                        const moisStr = match[2];
                        if (moisMap[moisStr] !== undefined) {
                            const yearMatch = cleanNom.match(/20\d{2}/);
                            const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
                            const parsedDate = new Date(year, moisMap[moisStr], dayNum);
                            
                            let hour = 8;
                            const timeMatch = cleanNom.match(/(\d{1,2})[:h](\d{2})/);
                            if (timeMatch) {
                                hour = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60;
                            }
                            return parsedDate.getTime() + hour * 3600000;
                        }
                    }
                }

                return 9999999999999 + (per.ordre || 0);
            };

            // 3. Trier toutes les périodes par poids chronologique
            allPeriodsToSave.sort((a, b) => getPeriodeWeight(a) - getPeriodeWeight(b));

            // 4. Attribuer les ordres cibles de 1 à N
            allPeriodsToSave.forEach((per, index) => {
                per.ordreCible = index + 1;
            });

            // 5. Étape de libération des ordres pour les périodes existantes afin d'éviter tout conflit de clé unique
            const baseOffset = 10000 + Math.floor(Math.random() * 10000) * 100;
            const tempPeriodsPayload = allPeriodsToSave.map(per => ({
                id: per.id,
                nom: per.nom,
                ordre: baseOffset + per.ordreCible,
                montant_credit: parseFloat(per.montant_credit || 0.00)
            }));
            
            if (tempPeriodsPayload.length > 0) {
                const { error } = await ApiService.upsertMany('periodes', tempPeriodsPayload);
                if (error) throw error;
            }

            // 6. Sauvegarder et appliquer les ordres réels finaux (Tout en un seul upsert groupé !)
            const periodsToUpsert = allPeriodsToSave.map(per => ({
                id: per.id,
                nom: per.nom,
                ordre: parseInt(per.ordreCible),
                montant_credit: parseFloat(per.montant_credit || 0.00)
            }));

            if (periodsToUpsert.length > 0) {
                const { error } = await ApiService.upsertMany('periodes', periodsToUpsert);
                if (error) throw error;
            }

            // Retirer le flag isNew de toutes les périodes
            this.visualPeriods.forEach(p => delete p.isNew);

            // 0. Enregistrer d'abord le jour dans la table jours
            const { error: upsertJourError } = await ApiService.upsert('jours', { date_ref: this.visualDaySelected });
            if (upsertJourError) throw upsertJourError;

            // 7. Sauvegarder tous les créneaux (postes) en une seule fois !
            const formatDecimalToISO = (dec) => {
                const h = Math.floor(dec);
                const m = Math.round((dec - h) * 60);
                const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
                return new Date(`${this.visualDaySelected}T${timeStr}`).toISOString();
            };

            // 1. Supprimer les types de postes marqués pour suppression (avec cascade sur postes)
            const deletedTypeTitres = this.visualDeletedTypePosteTitres || [];
            if (deletedTypeTitres.length > 0) {
                // Supprimer un par un car on filtre sur deux colonnes (date_ref + titre)
                for (const { date_ref, titre } of deletedTypeTitres) {
                    // Ne supprimer que si ce titre n'existe plus dans les lignes actuelles
                    const stillExists = this.visualLines.some(l => l.titre.trim() === titre);
                    if (!stillExists) {
                        await ApiService.delete('type_postes', { date_ref, titre });
                    }
                }
                this.visualDeletedTypePosteTitres = [];
            }

            // 2. Sauvegarder les types de postes avec leur ordre recalculé
            const typePostesPayload = this.visualLines.map((line, lineIndex) => ({
                date_ref: this.visualDaySelected,
                titre: line.titre.trim(),
                description: line.description.trim() || null,
                ordre: lineIndex
            }));

            let typePostesMap = {};
            if (typePostesPayload.length > 0) {
                const { data: typePostesSaved, error: upsertTypePostesError } = await ApiService.upsertMany('type_postes', typePostesPayload, { onConflict: 'date_ref,titre' });
                if (upsertTypePostesError) throw upsertTypePostesError;
                
                (typePostesSaved || []).forEach(tp => {
                    typePostesMap[tp.titre.trim()] = tp.id;
                });
            }

            const postesToUpsert = [];
            this.visualLines.forEach((line) => {
                const typePosteId = typePostesMap[line.titre.trim()];
                if (!typePosteId) {
                    throw new Error(`Type de poste non trouvé pour : ${line.titre}`);
                }
                for (const shift of line.shifts) {
                    postesToUpsert.push({
                        id: shift.id,
                        type_poste_id: typePosteId,
                        periode_debut: formatDecimalToISO(shift.debut),
                        periode_fin: formatDecimalToISO(shift.fin),
                        nb_min: parseInt(shift.nb_min),
                        nb_max: parseInt(shift.nb_max),
                        referent_id: shift.referent_id || null,
                        periode_id: shift.periode_id
                    });
                }
            });

            if (postesToUpsert.length > 0) {
                const { error: upsertPostesError } = await ApiService.upsertMany('postes', postesToUpsert);
                if (upsertPostesError) throw upsertPostesError;
            }

            // Retirer le flag isNew de tous les créneaux sauvegardés
            this.visualLines.forEach(line => {
                line.shifts.forEach(shift => delete shift.isNew);
            });

            // 8. Sauvegarder les événements de programme en une seule fois !
            const programmePayload = this.visualProgramEvents.map(ev => {
                const h = Math.floor(ev.hStart);
                const min = Math.round((ev.hStart - h) * 60);
                const heureStr = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`;
                return {
                    id: ev.id,
                    date_ref: this.visualDaySelected,
                    heure: heureStr,
                    description: ev.description.trim()
                };
            });

            try {
                await ApiService.delete('programme', { date_ref: this.visualDaySelected });
            } catch (err) {}

            if (programmePayload.length > 0) {
                const { error: insertProgError } = await ApiService.upsertMany('programme', programmePayload);
                if (insertProgError) throw insertProgError;
            }

            // Retirer le flag isNew de tous les événements programme sauvegardés
            this.visualProgramEvents.forEach(ev => delete ev.isNew);

            if (!isSilent) {
                this.showToast("💾 Configuration du planning enregistrée avec succès !", "success");
            }
            
            await this.loadData();
            
            const timelineAppEl = document.querySelector('[x-data="adminTimelineApp()"]');
            if (timelineAppEl && timelineAppEl.__x && timelineAppEl.__x.$data) {
                const timelineData = timelineAppEl.__x.$data;
                if (typeof timelineData.loadProgramme === 'function') {
                    await timelineData.loadProgramme();
                }
                if (typeof timelineData.loadPostes === 'function') {
                    await timelineData.loadPostes();
                }
            }
            
            if (!isSilent) {
                await this.selectVisualDay(this.visualDaySelected);
            }

        } catch (error) {
            console.error("Erreur enregistrement planning interactif:", error);
            if (!isSilent) {
                this.showToast(`❌ Erreur d'enregistrement : ${error.message}`, "error");
            } else {
                this.showToast(`❌ Erreur de sauvegarde automatique : ${error.message}`, "error");
            }
            throw error;
        } finally {
            this.isSavingVisual = false;
            if (!isSilent) {
                this.loading = false;
            }
            if (this.hasPendingChanges) {
                this.hasPendingChanges = false;
                this.triggerAutoSave();
            }
        }
    },

    saveLinesOrder() {
        if (!this.visualDaySelected) return;
        // Mettre à jour l'ordre de chaque ligne dans l'état local pour l'auto-save
        this.visualLines.forEach((line, index) => {
            line.lineIndex = index;
            line.shifts.forEach(shift => {
                shift.ordre = index;
            });
        });
    },

    armDrawShift(lineIdx) {
        this.hideShiftTooltip();
        this.isDrawingShift = true;
        this.drawingLineIndex = lineIdx;
        this.showToast("👉 Cliquez-glissez sur la ligne en pointillés orange pour tracer votre créneau.", "info");
    },

    cancelDrawShift() {
        this.isDrawingShift = false;
        this.drawingLineIndex = -1;
        this.drawingState = null;
    },

    startDrawingShift(event, lineIdx) {
        if (!this.isDrawingShift || this.drawingLineIndex !== lineIdx) return;
        event.preventDefault();
        
        const container = event.currentTarget;
        const rect = container.getBoundingClientRect();
        const clientX = event.clientX || (event.touches ? event.touches[0].clientX : 0);
        const clickX = clientX - rect.left;
        const pct = clickX / rect.width;
        
        const totalHours = this.hoursRange.end - this.hoursRange.start;
        const startHour = this.hoursRange.start + pct * totalHours;
        const startHourSnapped = Math.max(this.hoursRange.start, Math.min(this.hoursRange.end, Math.round(startHour / 0.25) * 0.25));
        
        this.drawingState = {
            lineIdx,
            startHour: startHourSnapped,
            currentHour: startHourSnapped,
            containerWidth: rect.width,
            containerLeft: rect.left
        };
        
        const handleMove = (e) => this.handleDrawingMove(e);
        const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleUp);
            this.stopDrawingShift();
        };
        
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleUp);
    },

    handleDrawingMove(event) {
        if (!this.drawingState) return;
        if (event.cancelable) event.preventDefault();
        
        const clientX = event.clientX || (event.touches ? event.touches[0].clientX : 0);
        const clickX = clientX - this.drawingState.containerLeft;
        const pct = clickX / this.drawingState.containerWidth;
        
        const totalHours = this.hoursRange.end - this.hoursRange.start;
        const currentHour = this.hoursRange.start + pct * totalHours;
        const currentHourSnapped = Math.max(this.hoursRange.start, Math.min(this.hoursRange.end, Math.round(currentHour / 0.25) * 0.25));
        
        this.drawingState.currentHour = currentHourSnapped;
    },

    stopDrawingShift() {
        if (!this.drawingState) return;
        
        let debut = Math.min(this.drawingState.startHour, this.drawingState.currentHour);
        let fin = Math.max(this.drawingState.startHour, this.drawingState.currentHour);
        
        // Si durée trop courte ou nulle, par défaut 1h
        if (fin - debut < 0.25) {
            if (debut + 1 <= this.hoursRange.end) {
                fin = debut + 1;
            } else {
                debut = fin - 1;
            }
        }
        
        const lineIdx = this.drawingState.lineIdx;
        this.drawingState = null;
        this.isDrawingShift = false;
        this.drawingLineIndex = -1;
        
        this.openAddShiftModalWithTimes(lineIdx, debut, fin);
    },

    openAddShiftModalWithTimes(lineIndex, debut, fin) {
        this.hideShiftTooltip();
        const line = this.visualLines[lineIndex];
        if (!line) return;
        
        this.addShiftData = {
            lineIndex,
            titre: line.titre,
            description: line.description,
            debut,
            fin,
            nb_min: 1,
            nb_max: 5,
            referent_id: ''
        };
        this.showAddShiftModal = true;
    },

    openAddShiftModal(lineIndex = -1) {
        this.hideShiftTooltip();
        if (lineIndex !== -1) {
            const line = this.visualLines[lineIndex];
            this.addShiftData = {
                lineIndex,
                titre: line.titre,
                description: line.description,
                debut: 8,
                fin: 12,
                nb_min: 1,
                nb_max: 5,
                referent_id: ''
            };
        } else {
            this.addShiftData = {
                lineIndex: -1,
                titre: '',
                description: '',
                debut: 8,
                fin: 12,
                nb_min: 1,
                nb_max: 5,
                referent_id: ''
            };
        }
        this.showAddShiftModal = true;
    },

    confirmAddShift() {
        if (!this.addShiftData.titre.trim()) {
            this.showToast("Le titre du poste est obligatoire", "error");
            return;
        }
        if (this.addShiftData.debut >= this.addShiftData.fin) {
            this.showToast("L'heure de fin doit être supérieure à l'heure de début", "error");
            return;
        }

        const debut = parseFloat(this.addShiftData.debut);
        const fin = parseFloat(this.addShiftData.fin);
        const nb_min = parseInt(this.addShiftData.nb_min);
        const nb_max = parseInt(this.addShiftData.nb_max);
        const referent_id = this.addShiftData.referent_id;

        const tempId = crypto.randomUUID();
        const newShift = {
            id: tempId,
            isNew: true,
            debut,
            fin,
            nb_min,
            nb_max,
            referent_id,
            inscrits_actuels: 0,
            periode_id: null,
            error: null
        };

        if (this.addShiftData.lineIndex !== -1) {
            const line = this.visualLines[this.addShiftData.lineIndex];
            
            const hasOverlap = line.shifts.some(s => (debut < s.fin && fin > s.debut));
            if (hasOverlap) {
                this.showToast("Ce créneau chevauche un créneau existant sur la même ligne", "error");
                return;
            }

            line.shifts.push(newShift);
            line.shifts.sort((a, b) => a.debut - b.debut);
        } else {
            const index = this.visualLines.length;
            this.visualLines.push({
                titre: this.addShiftData.titre.trim(),
                description: this.addShiftData.description.trim(),
                shifts: [newShift],
                lineIndex: index
            });
            this.saveLinesOrder();
        }

        this.showAddShiftModal = false;
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    openEditShiftModal(lineIndex, shiftIndex) {
        this.hideShiftTooltip();
        const line = this.visualLines[lineIndex];
        const shift = line.shifts[shiftIndex];
        if (!line || !shift) return;

        this.editShiftData = {
            lineIndex,
            shiftIndex,
            id: shift.id,
            titre: line.titre,
            description: line.description,
            debut: shift.debut,
            fin: shift.fin,
            nb_min: shift.nb_min,
            nb_max: shift.nb_max,
            referent_id: shift.referent_id || ''
        };
        this.showEditShiftModal = true;
    },

    saveEditShift() {
        if (!this.editShiftData.titre.trim()) {
            this.showToast("Le titre du poste est obligatoire", "error");
            return;
        }
        if (this.editShiftData.debut >= this.editShiftData.fin) {
            this.showToast("L'heure de fin doit être supérieure à l'heure de début", "error");
            return;
        }

        const line = this.visualLines[this.editShiftData.lineIndex];
        const shift = line.shifts[this.editShiftData.shiftIndex];
        if (!line || !shift) return;

        const debut = parseFloat(this.editShiftData.debut);
        const fin = parseFloat(this.editShiftData.fin);

        const hasOverlap = line.shifts.some((s, idx) => {
            if (idx === this.editShiftData.shiftIndex) return false;
            return (debut < s.fin && fin > s.debut);
        });

        if (hasOverlap) {
            this.showToast("Ce créneau chevauche un créneau existant sur la même ligne", "error");
            return;
        }

        const titreChange = line.titre !== this.editShiftData.titre.trim();
        const descChange = line.description !== this.editShiftData.description.trim();
        
        line.titre = this.editShiftData.titre.trim();
        line.description = this.editShiftData.description.trim();

        shift.debut = debut;
        shift.fin = fin;
        shift.nb_min = parseInt(this.editShiftData.nb_min);
        shift.nb_max = parseInt(this.editShiftData.nb_max);
        shift.referent_id = this.editShiftData.referent_id || null;

        line.shifts.sort((a, b) => a.debut - b.debut);

        if (titreChange || descChange) {
            this.saveLinesOrder();
        }

        this.showEditShiftModal = false;
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    deleteShiftFromModal() {
        if (this.editShiftData.lineIndex === -1 || this.editShiftData.shiftIndex === -1) return;
        if (!confirm("Voulez-vous supprimer ce créneau ?")) return;

        const line = this.visualLines[this.editShiftData.lineIndex];
        const shift = line.shifts[this.editShiftData.shiftIndex];
        
        if (shift.id && !shift.isNew) {
            this.visualDeletedPosteIds.push(shift.id);
        }

        line.shifts.splice(this.editShiftData.shiftIndex, 1);
        
        this.showEditShiftModal = false;
        this.validateAndAutoAssignPeriods();
        this.triggerAutoSave();
    },

    showShiftTooltip(event, line, shift) {
        const rect = event.currentTarget.getBoundingClientRect();
        
        let referentNom = 'Aucun';
        if (shift.referent_id) {
            const ref = this.getReferents().find(r => r.id === shift.referent_id);
            if (ref) {
                referentNom = `${ref.prenom} ${ref.nom}`;
            }
        }

        this.hoveredShift = {
            shift,
            line,
            referentNom,
            inscrits_noms: shift.inscrits_noms || [],
            x: event.clientX + 15,
            y: event.clientY + 15
        };
    },

    updateShiftTooltip(event) {
        if (this.hoveredShift) {
            this.hoveredShift.x = event.clientX + 15;
            this.hoveredShift.y = event.clientY + 15;
        }
    },

    hideShiftTooltip() {
        this.hoveredShift = null;
    },

    startLineDragTimer(event, lineIndex) {
        if (event.target.closest('button') || event.target.closest('a') || event.target.closest('input')) {
            return;
        }
        
        event.preventDefault();
        const clientY = event.clientY || (event.touches ? event.touches[0].clientY : 0);
        
        this.lineDragTimer = setTimeout(() => {
            this.startLineDrag(event, lineIndex, clientY);
        }, 400);
        
        const clearTimer = () => {
            if (this.lineDragTimer) {
                clearTimeout(this.lineDragTimer);
                this.lineDragTimer = null;
            }
            document.removeEventListener('mouseup', clearTimer);
            document.removeEventListener('touchend', clearTimer);
        };
        document.addEventListener('mouseup', clearTimer);
        document.addEventListener('touchend', clearTimer);
    },

    startLineDrag(event, lineIndex, startY) {
        this.lineDragTimer = null;
        this.lineDragState = {
            lineIndex,
            startY,
            currentY: startY
        };
        
        const handleMove = (e) => {
            if (!this.lineDragState) return;
            const currentY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
            this.handleLineDrag(currentY);
        };
        
        const handleUp = () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleUp);
            this.stopLineDrag();
        };
        
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleUp);
    },

    handleLineDrag(currentY) {
        if (!this.lineDragState) return;
        
        const diffY = currentY - this.lineDragState.startY;
        const lineIdx = this.lineDragState.lineIndex;
        
        const threshold = 35;
        if (diffY > threshold && lineIdx < this.visualLines.length - 1) {
            const temp = this.visualLines[lineIdx];
            this.visualLines[lineIdx] = this.visualLines[lineIdx + 1];
            this.visualLines[lineIdx + 1] = temp;
            
            this.visualLines[lineIdx].lineIndex = lineIdx;
            this.visualLines[lineIdx + 1].lineIndex = lineIdx + 1;
            
            this.lineDragState.lineIndex = lineIdx + 1;
            this.lineDragState.startY = currentY;
            this.saveLinesOrder();
        } else if (diffY < -threshold && lineIdx > 0) {
            const temp = this.visualLines[lineIdx];
            this.visualLines[lineIdx] = this.visualLines[lineIdx - 1];
            this.visualLines[lineIdx - 1] = temp;
            
            this.visualLines[lineIdx].lineIndex = lineIdx;
            this.visualLines[lineIdx - 1].lineIndex = lineIdx - 1;
            
            this.lineDragState.lineIndex = lineIdx - 1;
            this.lineDragState.startY = currentY;
            this.saveLinesOrder();
        }
    },

    stopLineDrag() {
        this.lineDragState = null;
        this.saveLinesOrder();
        this.triggerAutoSave();
    },

    formatDecimalHour(dec) {
        const h = Math.floor(dec);
        const m = Math.round((dec - h) * 60);
        return `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
    },

    formatDay(dayKey) {
        if (!dayKey) return '';
        const [y, m, d] = dayKey.split('-');
        const date = new Date(Number(y), Number(m) - 1, Number(d));
        const formatted = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    },

    async saveForcedJourneeTarif() {
        const tarif = parseFloat(this.config.tarif_cagnotte_journee);
        if (isNaN(tarif) || tarif < 0) {
            this.showToast('⚠️ Veuillez saisir un tarif journalier valide supérieur ou égal à 0.', 'warning');
            return;
        }

        this.loading = true;
        try {
            const { error } = await ApiService.upsert('config', {
                key: 'tarif_cagnotte_journee',
                value: tarif
            });
            if (error) throw error;
            this.showToast('✅ Tarif journée mis à jour avec succès !', 'success');
            await this.loadBenevolesAndStats(); // Re-calculer les soldes avec le nouveau tarif
        } catch (err) {
            console.error(err);
            this.showToast('❌ Erreur lors de la sauvegarde du tarif : ' + err.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    selectBenevoleForCagnotte(benevole) {
        this.selectedForcedBenevole = benevole;
        this.forcedForm.cagnotte_forcee = benevole.cagnotte_forcee || false;
        this.forcedForm.cagnotte_forcee_type = benevole.cagnotte_forcee_type || 'journee';
        this.forcedForm.cagnotte_forcee_jours = benevole.cagnotte_forcee_jours ? [...benevole.cagnotte_forcee_jours] : [];
        this.forcedForm.cagnotte_forcee_periodes_ids = benevole.cagnotte_forcee_periodes_ids ? [...benevole.cagnotte_forcee_periodes_ids] : [];
    },

    async saveCagnotteForcee() {
        if (!this.selectedForcedBenevole) return;

        this.loading = true;
        try {
            const benevoleId = this.selectedForcedBenevole.id;
            
            // 1. Préparation et exécution de l'update de benevoles
            const isForced = this.forcedForm.cagnotte_forcee;
            const type = isForced ? this.forcedForm.cagnotte_forcee_type : null;
            const jours = (isForced && type === 'journee') ? this.forcedForm.cagnotte_forcee_jours : [];

            const updatePayload = {
                cagnotte_forcee: isForced,
                cagnotte_forcee_type: type,
                cagnotte_forcee_jours: jours
            };

            const { error: updateError } = await ApiService.update('benevoles', updatePayload, { id: benevoleId });
            if (updateError) throw updateError;

            // 2. Nettoyer les anciennes périodes forcées de la table de liaison
            const { error: deleteError } = await ApiService.delete('benevole_cagnotte_periodes', { benevole_id: benevoleId });
            if (deleteError) throw deleteError;

            // 3. Insérer les nouvelles périodes forcées si requis
            if (isForced && type === 'periode' && this.forcedForm.cagnotte_forcee_periodes_ids.length > 0) {
                const inserts = this.forcedForm.cagnotte_forcee_periodes_ids.map(pid => ({
                    benevole_id: benevoleId,
                    periode_id: pid
                }));
                const { error: insertError } = await ApiService.insert('benevole_cagnotte_periodes', inserts);
                if (insertError) throw insertError;
            }

            this.showToast('✅ Configuration de la cagnotte enregistrée !', 'success');

            // 4. Recharger toutes les statistiques et bénévoles
            await this.loadBenevolesAndStats();

            // 5. Mettre à jour l'objet sélectionné en local pour refléter instantanément les changements à l'écran
            const updatedBenevole = this.benevoles.find(b => b.id === benevoleId);
            if (updatedBenevole) {
                this.selectBenevoleForCagnotte(updatedBenevole);
            } else {
                this.selectedForcedBenevole = null;
            }

        } catch (err) {
            console.error(err);
            this.showToast('❌ Erreur lors de l\'enregistrement : ' + err.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    async revertCagnotteForcee(benevole) {
        if (!benevole) return;
        if (!confirm(`Voulez-vous vraiment annuler le forçage de la cagnotte pour ${benevole.prenom} ${benevole.nom} ?`)) return;

        this.loading = true;
        try {
            const benevoleId = benevole.id;
            
            // 1. Désactiver le forçage sur le bénévole
            const updatePayload = {
                cagnotte_forcee: false,
                cagnotte_forcee_type: null,
                cagnotte_forcee_jours: []
            };

            const { error: updateError } = await ApiService.update('benevoles', updatePayload, { id: benevoleId });
            if (updateError) throw updateError;

            // 2. Nettoyer les périodes forcées associées
            const { error: deleteError } = await ApiService.delete('benevole_cagnotte_periodes', { benevole_id: benevoleId });
            if (deleteError) throw deleteError;

            this.showToast('✅ Forçage de la cagnotte annulé avec succès !', 'success');

            // 3. Si ce bénévole était sélectionné en haut pour édition, réinitialiser la sélection
            if (this.selectedForcedBenevole?.id === benevoleId) {
                this.selectedForcedBenevole = null;
            }

            // 4. Recharger toutes les données et recalculer les budgets
            await this.loadBenevolesAndStats();

        } catch (err) {
            console.error(err);
            this.showToast("❌ Erreur lors de l'annulation : " + err.message, 'error');
        } finally {
            this.loading = false;
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
