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
    wizardSelections: new Map(), // Key: "posteId-profileId", Value: { posteId, profileId, ... }
    wizardRemovals: new Set(), // Set of "posteId-profileId" to be removed from DB
    showWizardProfileForm: false, // UI Toggle for inline form
    showPostCreationModal: false, // UI Toggle for "Nodal" after creation
    wizardProfileForm: {
        prenom: '',
        nom: '',
        telephone: '',
        taille_tshirt: ''
    },

    // Computeds converted to Methods for Alpine Mixin compatibility
    getWizardPeriods() {
        console.log('🔮 WizardPeriods check - Postes:', this.postes?.length);
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

    // Converted to method that returns GROUPS for the current period
    getWizardGroups() {
        // 1. Get raw posts for current period
        const period = this.getCurrentWizardPeriodName();
        if (!period) return [];

        const methodPosts = this.postes.filter(p => p.periode === period);

        // 2. Define Groups
        const subgroups = [
            {
                id: 'critical',
                title: '⚠️ Postes Prioritaires (Manque de bénévoles)',
                expanded: true,
                postes: []
            },
            {
                id: 'open',
                title: '✅ Inscriptions Ouvertes',
                expanded: true,
                postes: []
            },
            {
                id: 'full',
                title: '🔒 Postes Complets',
                expanded: false, // Default closed
                postes: []
            }
        ];

        // 3. Distribute posts
        methodPosts.forEach(poste => {
            const min = poste.nb_min || 0;
            const max = poste.nb_max || 0;
            const current = poste.inscrits_actuels || 0;

            if (current < min) {
                subgroups[0].postes.push(poste);
            } else if (current >= max) {
                subgroups[2].postes.push(poste);
            } else {
                subgroups[1].postes.push(poste);
            }
        });

        // 4. Sort posts within groups (by time)
        subgroups.forEach(group => {
            group.postes.sort((a, b) => new Date(a.periode_debut) - new Date(b.periode_debut));
        });

        // 5. Filter empty groups
        return subgroups.filter(g => g.postes.length > 0);
    },

    /**
     * Opens the wizard. 
     * Resets state if necessary.
     */
    openWizard() {
        this.wizardOpen = true;
        this.wizardStep = 1;
        this.wizardPeriodIndex = 0;
        // Pre-select profile if only one
        if (this.profiles.length === 1) {
            this.wizardSelectedProfileId = this.profiles[0].id;
        }
    },

    closeWizard() {
        // If selections exist, maybe warn? For now just close but keep state? 
        // Better reset to avoid confusion next time opens.
        if (this.wizardSelections.size > 0) {
            if (!confirm("Attention, vos choix dans l'assistant seront perdus. Continuer ?")) {
                return;
            }
        }
        this.resetWizard();
        this.wizardOpen = false;
        // Reload data to ensure clean state (in case we mutated things visually)
        this.loadPostes();
    },

    resetWizard() {
        this.wizardSelections.clear();
        this.wizardStep = 1;
        this.wizardSelectedProfileId = '';
        this.wizardPeriodIndex = 0;
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
        if (this.wizardPeriodIndex > 0) {
            this.wizardPeriodIndex--;
        }
    },

    nextPeriod() {
        if (this.wizardPeriodIndex < this.getWizardPeriods().length - 1) {
            this.wizardPeriodIndex++;
        }
    },

    // --- Profile Creation (Wizard) ---

    async createProfileAndContinue() {
        if (!this.user) return;

        // Validation
        const f = this.wizardProfileForm;
        if (!f.prenom || !f.nom || !f.telephone || !f.taille_tshirt) {
            this.showToast('❌ Veuillez remplir tous les champs', 'error');
            return;
        }

        this.loading = true;

        // Safety timeout in case of hang
        const safetyTimeout = setTimeout(() => {
            if (this.loading) {
                console.warn('⚠️ Safety timeout triggered in createProfileAndContinue');
                this.loading = false;
                this.showToast('❌ Le serveur met du temps à répondre. Veuillez réessayer.', 'error');
            }
        }, 8000);

        try {
            console.log('📝 Creating profile...', f);
            const { data, error } = await ApiService.upsert('benevoles', {
                user_id: this.user.id,
                email: this.user.email,
                prenom: f.prenom,
                nom: f.nom,
                telephone: f.telephone,
                taille_tshirt: f.taille_tshirt
            }, { select: '*' });

            if (error) throw error;
            console.log('✅ Profile created, data:', data);

            this.showToast('✅ Profil créé !', 'success');

            // Refresh profiles list
            await this.loadProfiles();
            console.log('🔄 Profiles reloaded, count:', this.profiles?.length);

            // Should be the newly created one
            const newId = data && data.length > 0 ? data[0].id : null;
            if (newId) {
                this.wizardSelectedProfileId = newId;
            }

            // TRIGGER NODAL
            console.log('🔘 Triggering Nodal...');
            this.showPostCreationModal = true;
            this.showWizardProfileForm = false;

            clearTimeout(safetyTimeout); // Clear safety if successful

        } catch (error) {
            clearTimeout(safetyTimeout);
            console.error('❌ Creation failed:', error);
            this.showToast('❌ Erreur : ' + error.message, 'error');
            this.loading = false;
        } finally {
            // Only stop loading if we are NOT showing the Nodal (waiting for user choice)
            // AND if the safety timeout hasn't already killed it
            if (!this.showPostCreationModal) {
                this.loading = false;
            }
        }
    },

    handlePostProfileCreation(choice) {
        this.loading = false; // Ensure loading is off
        this.showPostCreationModal = false;

        if (choice === 'add') {
            // Reset form and show it again
            this.wizardProfileForm = { prenom: '', nom: '', telephone: '', taille_tshirt: '' };
            this.showWizardProfileForm = true;
            // Deselect previous to avoid confusion? or keep selected?
            // User wants to add another, so focus on form.
        } else {
            // Continue -> Go to Step 2
            this.wizardStep = 2;
        }
    },

    // --- Basket Logic ---

    /**
     * Adds a registration to the wizard basket.
     */
    async wizardRegister(posteId, profileId) {
        try {
            console.log('🪄 WizardRegister START:', posteId, profileId);

            // Check conflicts locally
            const targetPoste = this.postes.find(p => p.poste_id === posteId);
            if (!targetPoste) {
                console.error('❌ Target poste not found for ID:', posteId);
                return;
            }

            // Check basic constraints
            if (targetPoste.inscrits_actuels >= targetPoste.nb_max) {
                this.showToast('Ce poste est complet.', 'error');
                return;
            }

            // CONFIRMATION LOGIC FOR MINIMUM
            if (targetPoste.inscrits_actuels >= targetPoste.nb_min) {
                console.log('⚠️ Check Priority for:', targetPoste.titre);

                const targetStart = new Date(targetPoste.periode_debut).getTime();
                const targetEnd = new Date(targetPoste.periode_fin).getTime();

                const hasUnderfilledPostes = this.postes.some(other => {
                    if (other.poste_id === targetPoste.poste_id) return false;

                    const otherStart = new Date(other.periode_debut).getTime();
                    const otherEnd = new Date(other.periode_fin).getTime();

                    // Check for exact overlap (same slot)
                    const sameSlot = (Math.abs(otherStart - targetStart) < 60000) && (Math.abs(otherEnd - targetEnd) < 60000);

                    if (!sameSlot) return false;

                    const isUnderfilled = other.inscrits_actuels < other.nb_min;
                    if (isUnderfilled) {
                        console.log('   -> Found priority need:', other.titre, `(${other.inscrits_actuels}/${other.nb_min})`);
                    }
                    return isUnderfilled;
                });

                console.log('   -> Result:', hasUnderfilledPostes);

                if (hasUnderfilledPostes) {
                    console.log('   -> Triggering confirm...');

                    if (typeof this.askConfirm !== 'function') {
                        throw new Error('askConfirm is not a function');
                    }

                    const confirmed = await this.askConfirm(
                        "Le nombre minimum de bénévoles pour ce poste est déjà atteint, alors que d'autres postes sur ce créneau horaire ont encore besoin de monde. Êtes-vous sûr de vouloir maintenir ce choix ?",
                        "Attention : Besoins prioritaires"
                    );

                    if (!confirmed) {
                        console.log('   -> Cancelled by user.');
                        return;
                    }
                }
            }

            const key = `${posteId}-${profileId}`;
            this.wizardSelections.set(key, {
                posteId,
                profileId,
                posteTitle: targetPoste.titre,
                debut: targetPoste.periode_debut,
                fin: targetPoste.periode_fin,
                profileName: this.profiles.find(p => p.id === profileId)?.prenom
            });

            // OPTIMISTIC UI: Increment count locally (Visual only)
            targetPoste.inscrits_actuels++;
            console.log('✅ Registered successfully in wizard');

        } catch (error) {
            console.error('🚨 Error in wizardRegister:', error);
            alert('Erreur interne: ' + error.message); // FORCE ALERT for visibility
        }
    },

    /**
     * Removes a registration from the wizard basket or marks for removal from DB.
     */
    wizardUnregister(posteId, profileId) {
        const key = `${posteId}-${profileId}`;

        // 1. Check if it's a new local selection
        if (this.wizardSelections.has(key)) {
            this.wizardSelections.delete(key);

            // Revert optimistic count
            const targetPoste = this.postes.find(p => p.poste_id === posteId);
            if (targetPoste) targetPoste.inscrits_actuels--;

            return;
        }

        // 2. If it's in DB, mark for removal
        // (We assume isProfileRegistered checks were done, so it MUST be in DB if not in selections)
        this.wizardRemovals.add(key);

        // Optimistic update
        const targetPoste = this.postes.find(p => p.poste_id === posteId);
        if (targetPoste) targetPoste.inscrits_actuels--;
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

            // Special case: If user has 0 profiles, maybe we want to focus on creation?
            // The Wizard Step 1 handles "0 profiles" case.
        }
    }
};
