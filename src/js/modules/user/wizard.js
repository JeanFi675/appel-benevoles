import { ApiService } from '../../services/api.js';

/**
 * Module for the Registration Wizard.
 * @namespace WizardModule
 */
export const WizardModule = {
    wizardOpen: false,
    wizardStep: 1,
    wizardSelectedProfileId: '',
    wizardPeriodIndex: 0,
    wizardSelections: [], // Array of objects: { key, posteId, profileId, ... }
    wizardRemovals: [], // Array of keys: strings "posteId-profileId"
    showWizardProfileForm: false,
    showPostCreationModal: false,
    modalTitle: '',
    wizardProfileForm: {
        prenom: '',
        nom: '',
        telephone: '',
        taille_tshirt: ''
    },

    // Computeds converted to Methods for Alpine Mixin compatibility
    getWizardPeriods() {
        if (!this.postes || this.postes.length === 0) return [];
        const periods = [...new Set(this.postes.map(p => p.periode))];
        return periods.sort((a, b) => {
            const pA = this.postes.find(p => p.periode === a);
            const pB = this.postes.find(p => p.periode === b);
            return (pA?.periode_ordre || 0) - (pB?.periode_ordre || 0);
        });
    },

    getCurrentWizardPeriodName() {
        const periods = this.getWizardPeriods();
        if (!periods.length) return '';
        return periods[this.wizardPeriodIndex] || '';
    },

    getWizardGroups() {
        const period = this.getCurrentWizardPeriodName();
        if (!period) return [];

        const methodPosts = this.postes.filter(p => p.periode === period);

        const subgroups = [
            { id: 'critical', title: '⚠️ Postes Prioritaires (Manque de bénévoles)', expanded: true, postes: [] },
            { id: 'open', title: '✅ Inscriptions Ouvertes', expanded: true, postes: [] },
            { id: 'full', title: '🔒 Postes Complets', expanded: false, postes: [] }
        ];

        methodPosts.forEach(poste => {
            const min = poste.nb_min || 0;
            const max = poste.nb_max || 0;
            const current = poste.inscrits_actuels || 0;

            if (current < min) subgroups[0].postes.push(poste);
            else if (current >= max) subgroups[2].postes.push(poste);
            else subgroups[1].postes.push(poste);
        });

        subgroups.forEach(group => group.postes.sort((a, b) => new Date(a.periode_debut) - new Date(b.periode_debut)));
        return subgroups.filter(g => g.postes.length > 0);
    },

    openWizard() {
        if (!this.user) return;
        this.wizardOpen = true;
        this.wizardStep = 1;
        this.wizardPeriodIndex = 0;
        this.showPostCreationModal = false;
        if (this.profiles && this.profiles.length === 1) {
            this.wizardSelectedProfileId = this.profiles[0].id;
        }
    },

    /**
     * Opens the wizard and pre-selects a poste (Action from Dashboard).
     * @param {string} posteId 
     * @param {string} [profileId] 
     * @param {'register'|'unregister'} [action='register'] 
     */
    async openWizardWithContext(posteId, profileId, action = 'register') {
        this.openWizard();

        // Move to Step 2 (Choice) directly if profiles exist
        if (this.profiles && this.profiles.length > 0) {
            this.wizardStep = 2;
        }

        // Find the period index for this poste to show the right slide
        const targetPoste = this.postes.find(p => p.poste_id === posteId);
        if (targetPoste) {
            const periods = this.getWizardPeriods();
            const pIndex = periods.indexOf(targetPoste.periode);
            if (pIndex !== -1) this.wizardPeriodIndex = pIndex;

            // Perform the action (Optimistic Add/Remove to Basket)
            // We need a profile ID. If not provided, and user has 1 profile, use it.
            // If user has multiple profiles, we can't auto-add without clarification, 
            // BUT for UX we might want to just open the wizard at the right place.

            let effectiveProfileId = profileId;
            if (!effectiveProfileId && this.profiles.length === 1) {
                effectiveProfileId = this.profiles[0].id;
            }

            if (effectiveProfileId) {
                if (action === 'register') {
                    await this.wizardRegister(posteId, effectiveProfileId);
                } else if (action === 'unregister') {
                    this.wizardUnregister(posteId, effectiveProfileId);
                }
            } else {
                // If multiple profiles and no forced profile, we can't auto-register blindly.
                // But we navigated to the correct period, so the user can just click.
                if (action === 'register') {
                    this.showToast('Veuillez sélectionner le bénévole pour ce poste.', 'info');
                }
            }
        }
    },


    closeWizard() {
        if (this.wizardSelections.length > 0 || this.wizardRemovals.length > 0) {
            if (!confirm("Attention, vos choix dans l'assistant seront perdus. Continuer ?")) {
                return;
            }

            // Revert Optimistic Updates manually to ensure immediate UI consistency
            // 1. Revert Removals (Add back)
            this.wizardRemovals.forEach(key => {
                const [posteId] = key.split('::');
                const poste = this.postes.find(p => p.poste_id == posteId);
                if (poste) poste.inscrits_actuels++;
            });

            // 2. Revert Selections (Remove added)
            // Note: We only decrement if it was a NEW selection (key in wizardSelections)
            this.wizardSelections.forEach(sel => {
                const poste = this.postes.find(p => p.poste_id == sel.posteId);
                if (poste) poste.inscrits_actuels--;
            });
        }

        this.resetWizard();
        this.wizardOpen = false;
        // Still reload to be safe, but UI is fixed instantly
        this.loadPostes();
    },

    resetWizard() {
        this.wizardSelections = [];
        this.wizardRemovals = [];
        this.wizardStep = 1;
        this.wizardSelectedProfileId = '';
        this.wizardPeriodIndex = 0;
        this.showPostCreationModal = false;
    },

    toggleWizardProfile(profileId) {
        this.wizardSelectedProfileId = profileId;
    },

    validateStep1() {
        if (!this.wizardSelectedProfileId) {
            this.showToast('Veuillez sélectionner un profil.', 'error');
            return false;
        }
        return true;
    },

    prevPeriod() {
        if (this.wizardPeriodIndex > 0) this.wizardPeriodIndex--;
    },

    nextPeriod() {
        if (this.wizardPeriodIndex < this.getWizardPeriods().length - 1) this.wizardPeriodIndex++;
    },

    // --- Profile Creation (Wizard) ---

    async createProfileAndContinue() {
        if (!this.user) return;
        const f = this.wizardProfileForm;
        if (!f.prenom || !f.nom || !f.telephone || !f.taille_tshirt) {
            this.showToast('❌ Veuillez remplir tous les champs', 'error');
            return;
        }

        this.loading = true;
        const safetyTimeout = setTimeout(() => {
            if (this.loading) {
                this.loading = false;
                this.showToast('❌ Le serveur met du temps à répondre. Veuillez réessayer.', 'error');
            }
        }, 8000);

        try {
            const { data, error } = await ApiService.upsert('benevoles', {
                user_id: this.user.id,
                email: this.user.email,
                prenom: f.prenom,
                nom: f.nom,
                telephone: f.telephone,
                taille_tshirt: f.taille_tshirt
            }, { select: '*' });

            if (error) throw error;
            this.showToast('✅ Profil créé !', 'success');
            await this.loadProfiles();

            const newId = data && data.length > 0 ? data[0].id : null;
            if (newId) this.wizardSelectedProfileId = newId;

            this.showPostCreationModal = true;
            this.showWizardProfileForm = false;
            clearTimeout(safetyTimeout);
        } catch (error) {
            clearTimeout(safetyTimeout);
            this.showToast('❌ Erreur : ' + error.message, 'error');
            this.loading = false;
        } finally {
            if (!this.showPostCreationModal) this.loading = false;
        }
    },

    handlePostProfileCreation(choice) {
        this.loading = false;
        this.showPostCreationModal = false;
        if (choice === 'add') {
            this.wizardProfileForm = { prenom: '', nom: '', telephone: '', taille_tshirt: '' };
            this.showWizardProfileForm = true;
        } else {
            this.wizardStep = 2;
        }
    },

    // --- Basket Logic (REFACTORED TO ARRAYS) ---

    async wizardRegister(posteId, profileId) {
        try {
            const key = `${posteId}::${profileId}`;

            // Check if already selected locally
            if (this.wizardSelections.some(s => s.key === key)) return;

            const targetPoste = this.postes.find(p => p.poste_id === posteId);
            if (!targetPoste) return;

            if (targetPoste.inscrits_actuels >= targetPoste.nb_max) {
                this.showToast('Ce poste est complet.', 'error');
                return;
            }

            // --- Priority Check Logic (Condensed) ---
            if (targetPoste.inscrits_actuels >= targetPoste.nb_min) {
                const targetStart = new Date(targetPoste.periode_debut).getTime();
                const targetEnd = new Date(targetPoste.periode_fin).getTime();
                const hasUnderfilledPostes = this.postes.some(other => {
                    if (other.poste_id === targetPoste.poste_id) return false;
                    const otherStart = new Date(other.periode_debut).getTime();
                    const otherEnd = new Date(other.periode_fin).getTime();
                    const sameSlot = (Math.abs(otherStart - targetStart) < 60000) && (Math.abs(otherEnd - targetEnd) < 60000);
                    return sameSlot && other.inscrits_actuels < other.nb_min;
                });

                if (hasUnderfilledPostes && typeof this.askConfirm === 'function') {
                    const confirmed = await this.askConfirm(
                        "Le nombre minimum de bénévoles pour ce poste est déjà atteint, alors que d'autres postes sur ce créneau horaire ont encore besoin de monde. Êtes-vous sûr de vouloir maintenir ce choix ?",
                        "Attention : Besoins prioritaires"
                    );
                    if (!confirmed) return;
                }
            }

            // Remove from removals if present (undo delete)
            if (this.wizardRemovals.includes(key)) {
                this.wizardRemovals = this.wizardRemovals.filter(k => k !== key);
            } else {
                // Add to selections
                this.wizardSelections.push({
                    key,
                    posteId,
                    profileId,
                    posteTitle: targetPoste.titre,
                    debut: targetPoste.periode_debut,
                    fin: targetPoste.periode_fin,
                    profileName: this.profiles.find(p => p.id === profileId)?.prenom
                });
            }

            targetPoste.inscrits_actuels++;
            console.log('✅ Registered (Wizard Array)', key);

        } catch (error) {
            console.error(error);
            alert('Erreur: ' + error.message);
        }
    },

    wizardUnregister(posteId, profileId) {
        const key = `${posteId}::${profileId}`;

        // 1. Check if it's a new local selection -> Remove it
        const selectionIndex = this.wizardSelections.findIndex(s => s.key === key);
        if (selectionIndex !== -1) {
            this.wizardSelections.splice(selectionIndex, 1); // Mutate array triggers reactivity
            const targetPoste = this.postes.find(p => p.poste_id === posteId);
            if (targetPoste) targetPoste.inscrits_actuels--;
            return;
        }

        // 2. If it's in DB -> Add to removals
        if (!this.wizardRemovals.includes(key)) {
            this.wizardRemovals.push(key);
            const targetPoste = this.postes.find(p => p.poste_id === posteId);
            if (targetPoste) targetPoste.inscrits_actuels--;
        }
    },

    getRemovalDetailsList() {
        return this.wizardRemovals.map(key => {
            const [posteId, profileId] = key.split('::');
            // Use loose equality (==) because split returns strings, but IDs might be integers
            const poste = this.postes.find(p => p.poste_id == posteId);
            const profile = this.profiles.find(p => p.id == profileId);
            return {
                key,
                posteId,
                profileId,
                posteTitle: poste ? poste.titre : 'inconnu',
                profileName: profile ? profile.prenom : 'inconnu',
                debut: poste ? poste.periode_debut : null,
                fin: poste ? poste.periode_fin : null
            };
        });
    },

    async submitWizard() {
        console.log('🚀 submitWizard START');
        if (this.wizardSelections.length === 0 && this.wizardRemovals.length === 0) {
            this.showToast('Aucune modification à enregistrer.', 'info');
            return;
        }

        this.loading = true;

        // Safety timeout to force release
        const safetyTimeout = setTimeout(() => {
            if (this.loading) {
                console.error('⏰ Safety Timeout Triggered');
                this.loading = false;
                this.showToast('❌ Le serveur ne répond pas (Timeout).', 'error');
            }
        }, 10000);

        try {
            console.log('💾 Submitting Wizard (Arrays)...', {
                add: this.wizardSelections.length,
                remove: this.wizardRemovals.length
            });

            // Refresh session handled globally in store.js


            const promises = [];

            // Helper to reject promise on API error / Timeout
            const handleApiCall = async (promise, context) => {
                let timer;
                const timeoutPromise = new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Request timed out (20s)')), 20000);
                });

                try {
                    console.log(`📡 Sending ${context}...`);
                    const res = await Promise.race([promise, timeoutPromise]);
                    clearTimeout(timer);

                    if (res && res.error) {
                        console.error('❌ API Error in ' + context, res.error);
                        throw new Error(res.error.message || JSON.stringify(res.error));
                    }
                    console.log(`✅ Success ${context}`);
                    return res;
                } catch (e) {
                    clearTimeout(timer);
                    console.error('❌ Exception in ' + context, e);
                    throw e;
                }
            };

            // 1. REMOVALS
            this.wizardRemovals.forEach(key => {
                const [posteId, profileId] = key.split('::');
                console.log('🗑️ Queueing DELETE:', { posteId, profileId });
                promises.push(handleApiCall(
                    ApiService.delete('inscriptions', { poste_id: posteId, benevole_id: profileId }),
                    `DELETE ${posteId}::${profileId}`
                ));
            });

            // 2. ADDITIONS
            this.wizardSelections.forEach(sel => {
                console.log('💾 Queueing UPSERT:', { id: sel.posteId, profile: sel.profileId });
                promises.push(handleApiCall(
                    ApiService.upsert('inscriptions', { poste_id: sel.posteId, benevole_id: sel.profileId }),
                    `UPSERT ${sel.posteId}::${sel.profileId}`
                ));
            });

            console.log('⏳ Awaiting promises...', promises.length);
            await Promise.all(promises);
            console.log('✅ All promises resolved');

            this.showToast('🎉 Inscriptions mises à jour !', 'success');

            console.log('🔄 Reloading data...');
            await this.loadInitialData(); // Ensure this exists and works
            console.log('✅ Data reloaded');

            this.resetWizard(); // Clears arrays
            this.closeWizard();
            clearTimeout(safetyTimeout);
        } catch (error) {
            console.error('💥 Submit Error Caught:', error);
            clearTimeout(safetyTimeout);
            this.showToast('Erreur: ' + (error.message || error), 'error');
        } finally {
            console.log('🏁 submitWizard FINALLY');
            this.loading = false;
        }
    },

    /**
     * Hook to run after initial data load to auto-open wizard.
     */
    checkWizardAutoOpen() {
        if (!this.userInscriptions || this.userInscriptions.length === 0) {
            // Check if user has at least one profile?
            // If No profile -> Wizard Step 1 shows "Create Profile".
            // If Profiles but no inscriptions -> Wizard Step 1 shows selection.
            this.openWizard();
            console.log('🪄 Wizard auto-opened (No inscriptions)');
        }
    }
};
