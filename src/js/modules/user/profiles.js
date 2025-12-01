import { ApiService } from '../../services/api.js';

/**
 * Module for managing volunteer profiles.
 * @namespace ProfilesModule
 */
export const ProfilesModule = {
    profiles: [],
    showProfileSection: false,
    isEditingProfile: false,
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
        } catch (error) {
            console.error('Erreur chargement profils:', error);
        }
    },

    /**
     * Saves (creates or updates) a profile.
     */
    async saveProfile() {
        if (!this.user) return;

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
            this.isEditingProfile = false;

            await this.loadProfiles();
            // Refresh postes to update names/counts if needed
            if (this.loadPostes) await this.loadPostes();
        } catch (error) {
            this.showToast('❌ Erreur : ' + error.message, 'error');
        } finally {
            this.loading = false;
        }
    }
};
