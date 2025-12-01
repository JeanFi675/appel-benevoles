import Alpine from 'alpinejs';
import { supabase, getMagicLinkRedirectUrl } from './config.js';
import { formatDate, formatTime } from './utils.js';

// Expose helpers to window for Alpine if needed, or just use them in the component
// Alpine components can access imported functions if we define them in the scope

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: null,
        profiles: [], // Array of profiles
        activeProfileId: null, // For registration selection
        postes: [],
        userInscriptions: [],
        loading: false,
        loginEmail: '',
        toasts: [],

        profileForm: {
            id: null, // Add ID to form to track if new or existing
            prenom: '',
            nom: '',
            telephone: '',
            taille_tshirt: ''
        },

        // State for UI
        showProfileSection: false, // Replaces showProfileEdit for the main section visibility
        isEditingProfile: false, // True if showing the form
        showMyInscriptions: false,
        showOnlyAvailable: false,

        toggleProfileSection() {
            this.showProfileSection = !this.showProfileSection;
            this.isEditingProfile = false; // Reset to list view

            if (!this.showProfileSection) {
                this.loadProfiles(); // Reload when closing
            }
        },

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

        cancelEdit() {
            this.isEditingProfile = false;
            this.profileForm = { id: null, prenom: '', nom: '', telephone: '', taille_tshirt: '' };
        },

        async init() {
            // Vérifier la session
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                this.user = session.user;
                await this.loadProfiles();
                await this.loadPostes();
                await this.loadUserInscriptions();
            }

            // Écouter les changements d'auth
            supabase.auth.onAuthStateChange(async (event, session) => {
                this.user = session?.user || null;

                if (event === 'SIGNED_IN') {
                    // Nettoyer l'URL APRÈS que Supabase ait traité le token
                    if (window.location.hash.includes('access_token')) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }

                    await this.loadProfiles();
                    await this.loadPostes();
                    await this.loadUserInscriptions();
                }
            });
        },

        // Registration Modal
        selectedPosteForRegistration: null,

        openRegistrationModal(poste) {
            this.selectedPosteForRegistration = poste;
        },

        closeRegistrationModal() {
            this.selectedPosteForRegistration = null;
        },

        async sendMagicLink() {
            if (!this.loginEmail) return;

            this.loading = true;
            try {
                const { error } = await supabase.auth.signInWithOtp({
                    email: this.loginEmail,
                    options: {
                        emailRedirectTo: window.location.href
                    }
                });

                if (error) throw error;

                this.showToast('📧 Vérifiez votre boîte mail !', 'success');
                this.loginEmail = '';
            } catch (error) {
                this.showToast('❌ Erreur : ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        async logout() {
            await supabase.auth.signOut();
            this.user = null;
            this.profiles = [];
            this.postes = [];
            this.userInscriptions = [];
        },

        async loadProfiles() {
            if (!this.user) return;

            try {
                const { data, error } = await supabase
                    .from('benevoles')
                    .select('*')
                    .eq('user_id', this.user.id)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                this.profiles = data || [];
            } catch (error) {
                console.error('Erreur chargement profils:', error);
            }
        },

        async saveProfile() {
            if (!this.user) return;

            this.loading = true;
            try {
                const profileData = {
                    user_id: this.user.id,
                    email: this.user.email, // Keep email for reference, though user_id is the link
                    prenom: this.profileForm.prenom,
                    nom: this.profileForm.nom,
                    telephone: this.profileForm.telephone,
                    taille_tshirt: this.profileForm.taille_tshirt
                };

                // If updating existing
                if (this.profileForm.id) {
                    profileData.id = this.profileForm.id;
                }

                const { data, error } = await supabase
                    .from('benevoles')
                    .upsert(profileData) // Upsert works if ID is present
                    .select()
                    .single();

                if (error) throw error;

                this.showToast('✅ Profil enregistré !', 'success');
                this.isEditingProfile = false; // Return to list view

                await this.loadProfiles();
                await this.loadPostes(); // Refresh to update names/counts if needed
            } catch (error) {
                this.showToast('❌ Erreur : ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        async loadPostes() {
            try {
                const { data, error } = await supabase
                    .from('public_planning')
                    .select('*')
                    .order('periode_debut');

                if (error) throw error;

                this.postes = data || [];
            } catch (error) {
                this.showToast('❌ Erreur chargement postes : ' + error.message, 'error');
            }
        },

        async loadUserInscriptions() {
            if (!this.user) return;

            try {
                const { data, error } = await supabase
                    .from('inscriptions')
                    .select('*, postes(*)')
                    .eq('benevole_id', this.user.id);

                if (error) throw error;

                this.userInscriptions = data || [];
            } catch (error) {
                console.error('Erreur chargement inscriptions:', error);
            }
        },

        async register(posteId, benevoleId) {
            if (!this.user || !benevoleId) return;

            this.loading = true;
            try {
                const { error } = await supabase
                    .from('inscriptions')
                    .insert({
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

        async unregister(posteId, benevoleId) {
            if (!this.user || !benevoleId) return;

            // Confirmation simple pour commencer
            if (!confirm("Êtes-vous sûr de vouloir désinscrire ce bénévole ?")) return;

            this.loading = true;
            try {
                const { error } = await supabase
                    .from('inscriptions')
                    .delete()
                    .eq('poste_id', posteId)
                    .eq('benevole_id', benevoleId);

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

        isUserRegistered(posteId) {
            // Returns true if ANY profile is registered
            return this.userInscriptions.some(i => i.poste_id == posteId);
        },

        getRegisteredProfiles(posteId) {
            // Returns array of profile IDs registered for this poste
            return this.userInscriptions
                .filter(i => i.poste_id == posteId)
                .map(i => i.benevole_id);
        },

        isProfileRegistered(posteId, profileId) {
            return this.userInscriptions.some(i => i.poste_id == posteId && i.benevole_id == profileId);
        },

        hasTimeConflict(poste, profileId = null) {
            const posteDebut = new Date(poste.periode_debut);
            const posteFin = new Date(poste.periode_fin);

            return this.userInscriptions.some(inscription => {
                // Si on vérifie pour un profil spécifique, on ignore les autres
                if (profileId && inscription.benevole_id !== profileId) return false;

                // On ne compare pas avec le poste lui-même
                if (inscription.poste_id == poste.poste_id) return false;

                const inscriptionDebut = new Date(inscription.postes.periode_debut);
                const inscriptionFin = new Date(inscription.postes.periode_fin);

                return (posteDebut < inscriptionFin) && (posteFin > inscriptionDebut);
            });
        },

        get filteredPostes() {
            return this.postes.filter(poste => {
                // Filtre 1: Postes disponibles uniquement
                if (this.showOnlyAvailable) {
                    const isFull = poste.inscrits_actuels >= poste.nb_max;
                    const isRegistered = this.isUserRegistered(poste.poste_id);
                    // On affiche si pas complet OU si je suis inscrit (pour pouvoir me désinscrire)
                    if (isFull && !isRegistered) return false;
                }

                // Filtre 2: Mes inscriptions uniquement
                if (this.showMyInscriptions) {
                    if (!this.isUserRegistered(poste.poste_id)) return false;
                }

                return true;
            });
        },

        get groupedPostes() {
            // 1. Group by periode
            const groups = {};
            this.filteredPostes.forEach(poste => {
                if (!groups[poste.periode]) {
                    groups[poste.periode] = [];
                }
                groups[poste.periode].push(poste);
            });

            // 2. Convert to array and sort by periode_ordre of the first element
            return Object.keys(groups).map(periode => {
                const postes = groups[periode];
                // On suppose que tous les postes d'une période ont le même periode_ordre
                const ordre = postes.length > 0 ? (postes[0].periode_ordre || 0) : 0;
                return {
                    name: periode,
                    postes: postes,
                    order: ordre
                };
            }).sort((a, b) => a.order - b.order);
        },

        formatDate,
        formatTime,

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
