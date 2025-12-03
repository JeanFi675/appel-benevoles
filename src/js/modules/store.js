import Alpine from 'alpinejs';
import { AuthService } from '../services/auth.js';
import { ProfilesModule } from './user/profiles.js';
import { PlanningModule } from './user/planning.js';

/**
 * Initializes the central application store.
 * Combines Auth, Profiles, and Planning modules.
 */
export function initStore() {
    Alpine.data('app', () => ({
        // Global State
        user: null,
        loading: false,
        toasts: [],

        // Modal State
        confirmModal: {
            open: false,
            title: '',
            message: '',
            resolve: null
        },

        /**
         * Opens the confirmation modal and returns a promise.
         * @param {string} message - The message to display.
         * @param {string} [title='Confirmation'] - The title of the modal.
         * @returns {Promise<boolean>} True if confirmed, false otherwise.
         */
        askConfirm(message, title = 'Confirmation') {
            this.confirmModal.title = title;
            this.confirmModal.message = message;
            this.confirmModal.open = true;

            return new Promise((resolve) => {
                this.confirmModal.resolve = resolve;
            });
        },

        /**
         * Handles the user's choice in the confirmation modal.
         * @param {boolean} result - The user's choice.
         */
        handleConfirm(result) {
            this.confirmModal.open = false;
            if (this.confirmModal.resolve) {
                this.confirmModal.resolve(result);
                this.confirmModal.resolve = null;
            }
        },

        // Modules
        ...ProfilesModule,
        ...PlanningModule,

        /**
         * Initializes the application.
         * Checks session and loads initial data.
         */
        async init() {
            // Check session
            const { user } = await AuthService.getSession();
            if (user) {
                this.user = user;
                await this.loadInitialData();
            }

            // Listen for auth changes
            AuthService.onAuthStateChange(async (event, session) => {
                this.user = session?.user || null;

                if (event === 'SIGNED_IN') {
                    // Clean URL hash
                    if (window.location.hash.includes('access_token')) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                    await this.loadInitialData();
                } else if (event === 'SIGNED_OUT') {
                    this.resetData();
                }
            });
        },

        /**
         * Loads all necessary data for the authenticated user.
         */
        async loadInitialData() {
            if (!this.user) return;
            await Promise.all([
                this.loadProfiles(),
                this.loadPostes(),
                this.loadUserInscriptions()
            ]);
        },

        /**
         * Resets application data on logout.
         */
        resetData() {
            this.profiles = [];
            this.postes = [];
            this.userInscriptions = [];
        },

        // --- Auth Actions ---

        loginEmail: '',

        /**
         * Sends a magic link for login.
         */
        async sendMagicLink() {
            if (!this.loginEmail) return;

            this.loading = true;
            try {
                const { error } = await AuthService.signInWithOtp(this.loginEmail);
                if (error) throw error;

                this.showToast('📧 Vérifiez votre boîte mail !', 'success');
                this.loginEmail = '';
            } catch (error) {
                this.showToast('❌ Erreur : ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        /**
         * Logs out the user.
         */
        async logout() {
            if (!await this.askConfirm("Voulez-vous vraiment vous déconnecter ?", "Déconnexion")) return;

            try {
                const { error } = await AuthService.signOut();
                if (error) throw error;

                // Manually reset state to ensure UI updates immediately
                this.user = null;
                this.resetData();

                // Optional: Reload to ensure clean state
                window.location.reload();
            } catch (error) {
                console.error('Logout error:', error);
                this.showToast('Erreur lors de la déconnexion : ' + error.message, 'error');
            }
        },

        // --- UI Helpers ---

        /**
         * Displays a toast notification.
         * @param {string} message - The message to display.
         * @param {'success'|'error'} [type='success'] - The type of toast.
         */
        showToast(message, type = 'success') {
            const id = Date.now() + Math.random().toString(36).substr(2, 9);
            this.toasts.push({ id, message, type });

            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, 5000);
        }
    }));
}
