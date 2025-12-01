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

        showOnlyAvailable: false,
        showMyInscriptions: false,
        showProfileEdit: false,

        toggleProfile() {
            this.showProfileEdit = !this.showProfileEdit;

            // Si on ouvre le mode édition et qu'on a un profil, on pré-remplit le formulaire
            if (this.showProfileEdit && this.profile) {
                this.profileForm = {
                    prenom: this.profile.prenom || '',
                    nom: this.profile.nom || '',
                    telephone: this.profile.telephone || '',
                    taille_tshirt: this.profile.taille_tshirt || ''
                };
            }

            // Si on ferme le profil, on recharge les données pour être sûr
            if (!this.showProfileEdit) {
                this.loadProfile();
            }
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
                this.showProfileEdit = false;

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

            // Confirmation simple pour commencer
            if (!confirm("Êtes-vous sûr de vouloir vous désinscrire de ce poste ?")) return;

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
            const isReg = this.userInscriptions.some(i => i.poste_id == posteId);
            if (isReg) console.log('User registered for:', posteId);
            return isReg;
        },

        hasTimeConflict(poste) {
            // Si on est déjà inscrit à ce poste, ce n'est pas un "conflit" à afficher
            if (this.isUserRegistered(poste.poste_id)) return false;

            const posteDebut = new Date(poste.periode_debut);
            const posteFin = new Date(poste.periode_fin);

            return this.userInscriptions.some(inscription => {
                // On ne compare pas avec le poste lui-même (même si le check isUserRegistered au dessus le couvre déjà, double sécurité)
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
