import Alpine from 'alpinejs';
import { supabase, getMagicLinkRedirectUrl } from './config.js';
import { formatDate, formatTime } from './utils.js';

// Expose helpers to window for Alpine if needed, or just use them in the component
// Alpine components can access imported functions if we define them in the scope

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: null,
        profile: null,
        postes: [],
        userInscriptions: [],
        loading: false,
        loginEmail: '',
        toasts: [],

        profileForm: {
            prenom: '',
            nom: '',
            telephone: '',
            taille_tshirt: ''
        },

        async init() {
            // Vérifier la session
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                this.user = session.user;
                await this.loadProfile();
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

                    await this.loadProfile();
                    await this.loadPostes();
                    await this.loadUserInscriptions();
                }
            });
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
            this.profile = null;
            this.postes = [];
            this.userInscriptions = [];
        },

        async loadProfile() {
            if (!this.user) return;

            try {
                const { data, error } = await supabase
                    .from('benevoles')
                    .select('*')
                    .eq('id', this.user.id)
                    .single();

                if (error && error.code !== 'PGRST116') throw error;

                this.profile = data;

                // Pré-remplir le formulaire si pas de profil
                if (!data) {
                    this.profileForm.prenom = '';
                    this.profileForm.nom = '';
                }
            } catch (error) {
                console.error('Erreur chargement profil:', error);
            }
        },

        async saveProfile() {
            if (!this.user) return;

            this.loading = true;
            try {
                const { data, error } = await supabase
                    .from('benevoles')
                    .upsert({
                        id: this.user.id,
                        email: this.user.email,
                        ...this.profileForm
                    })
                    .select()
                    .single();

                if (error) throw error;

                this.profile = data;
                this.showToast('✅ Profil enregistré !', 'success');

                await this.loadPostes();
                await this.loadUserInscriptions();
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

        async register(posteId) {
            if (!this.user) return;

            this.loading = true;
            try {
                const { error } = await supabase
                    .from('inscriptions')
                    .insert({
                        poste_id: posteId,
                        benevole_id: this.user.id
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

        async unregister(posteId) {
            if (!this.user) return;

            this.loading = true;
            try {
                const { error } = await supabase
                    .from('inscriptions')
                    .delete()
                    .eq('poste_id', posteId)
                    .eq('benevole_id', this.user.id);

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
            return this.userInscriptions.some(i => i.poste_id === posteId);
        },

        hasTimeConflict(poste) {
            const posteDebut = new Date(poste.periode_debut);
            const posteFin = new Date(poste.periode_fin);

            return this.userInscriptions.some(inscription => {
                const inscriptionDebut = new Date(inscription.postes.periode_debut);
                const inscriptionFin = new Date(inscription.postes.periode_fin);

                return (posteDebut < inscriptionFin) && (posteFin > inscriptionDebut);
            });
        },

        get groupedPostes() {
            const groups = {};

            // Sort postes by periode_ordre first
            const sortedPostes = [...this.postes].sort((a, b) => {
                return (a.periode_ordre || 0) - (b.periode_ordre || 0);
            });

            sortedPostes.forEach(poste => {
                if (!groups[poste.periode]) {
                    groups[poste.periode] = [];
                }
                groups[poste.periode].push(poste);
            });

            return groups;
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
