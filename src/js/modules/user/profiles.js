import { ApiService } from '../../services/api.js';

/**
 * Module for managing volunteer profiles.
 * @namespace ProfilesModule
 */
export const ProfilesModule = {
    profiles: [],
    showProfileSection: false,
    isEditingProfile: false,
    loading: false, // Initialize loading state
    profileForm: {
        id: null,
        prenom: '',
        nom: '',
        telephone: '',
        taille_tshirt: ''
    },

    /**
     * Toggles the visibility of the profile management section.
     */
    toggleProfileSection() {
        this.showProfileSection = !this.showProfileSection;
        this.isEditingProfile = false;

        if (!this.showProfileSection) {
            this.loadProfiles();
        }
    },

    /**
     * Prepares the form for editing an existing profile.
     * @param {string} profileId - The ID of the profile to edit.
     */
    editProfile(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (profile) {
            this.profileForm = {
                id: profile.id,
                prenom: profile.prenom || '',
                nom: profile.nom || '',
                telephone: profile.telephone || '',
                taille_tshirt: profile.taille_tshirt || ''
            };
            this.isEditingProfile = true;
        }
    },

    /**
     * Prepares the form for creating a new profile.
     */
    createProfile() {
        this.showProfileSection = true;
        this.profileForm = {
            id: null,
            prenom: '',
            nom: '',
            telephone: '',
            taille_tshirt: ''
        };
        this.isEditingProfile = true;
    },

    /**
     * Cancels the edit operation and resets the form.
     */
    cancelEdit() {
        this.isEditingProfile = false;
        this.profileForm = { id: null, prenom: '', nom: '', telephone: '', taille_tshirt: '' };
    },

    /**
     * Loads profiles for the current user.
     */
    async loadProfiles() {
        if (!this.user) return;

        try {
            const { data, error } = await ApiService.fetch('benevoles', {
                eq: { user_id: this.user.id },
                order: { column: 'created_at', ascending: true }
            });

            if (error) throw error;
            this.profiles = data || [];

            // Auto-open form if no profiles exist
            if (this.profiles.length === 0) {
                this.createProfile();
            }
        } catch (error) {
            console.error('Erreur chargement profils:', error);
        }
    },

    /**
     * Saves (creates or updates) a profile.
     */
    async saveProfile() {
        if (!this.user) return;

        // Manual validation to ensure loading doesn't get stuck if HTML validation fails/bypassed
        if (!this.profileForm.prenom || !this.profileForm.nom || !this.profileForm.telephone || !this.profileForm.taille_tshirt) {
            this.showToast('❌ Veuillez remplir tous les champs obligatoires (*)', 'error');
            return;
        }

        this.loading = true;
        try {
            const profileData = {
                user_id: this.user.id,
                email: this.user.email,
                prenom: this.profileForm.prenom,
                nom: this.profileForm.nom,
                telephone: this.profileForm.telephone,
                taille_tshirt: this.profileForm.taille_tshirt
            };

            if (this.profileForm.id) {
                profileData.id = this.profileForm.id;
            }

            const { error } = await ApiService.upsert('benevoles', profileData);

            if (error) throw error;

            this.showToast('✅ Profil enregistré !', 'success');
            this.loading = false;

            await this.loadProfiles();

            // Ask to add another volunteer
            if (await this.askConfirm("Voulez-vous ajouter un autre bénévole ?", "Succès !")) {
                this.createProfile();
            } else {
                // Refresh postes to update names/counts if needed
                if (this.loadPostes) await this.loadPostes();
                this.isEditingProfile = false;
                this.showProfileSection = false; // Close the section to show posts
            }
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    },

    /**
     * Deletes a profile.
     * @param {string} profileId - The ID of the profile to delete.
     */
    async deleteProfile(profileId) {
        if (!await this.askConfirm("Êtes-vous sûr de vouloir supprimer ce profil ? Cette action est irréversible.", "Suppression")) return;

        this.loading = true;
        try {
            const { error } = await ApiService.delete('benevoles', { id: profileId });

            if (error) throw error;

            this.showToast('✅ Profil supprimé', 'success');
            await this.loadProfiles();

            // Refresh postes to update counts
            if (this.loadPostes) await this.loadPostes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    }
};
