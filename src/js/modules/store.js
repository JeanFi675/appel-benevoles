import Alpine from 'alpinejs';
import { AuthService } from '../services/auth.js';
import { ApiService } from '../services/api.js';
import { ProfilesModule } from './user/profiles.js';
import { PlanningModule } from './user/planning.js';
import { WizardModule } from './user/wizard.js';
import { CagnotteModule } from './user/cagnotte.js';
import { TshirtModule } from './user/tshirt.js';

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
            /** @type {((value: boolean) => void) | null} */
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
        ...WizardModule,
        ...CagnotteModule,
        ...TshirtModule,

        /**
         * Initializes the application.
         * Checks session and loads initial data.
         */
        async init() {
            try {
                // 0. Handle URL Errors (e.g., expired Magic Link)
                const hash = window.location.hash;
                const search = window.location.search;

                // Helper to check for auth params in Hash or Search (PKCE)
                const isAuthRedirect =
                    hash.includes('access_token') ||
                    hash.includes('type=') ||
                    hash.includes('error=') ||
                    search.includes('code=');

                if (hash && hash.includes('error=')) {
                    const params = new URLSearchParams(hash.substring(1)); // Remove #
                    const errorDescription = params.get('error_description');
                    const errorCode = params.get('error_code');

                    if (errorDescription) {
                        // Translate common codes
                        let msg = errorDescription.replace(/\+/g, ' ');
                        if (errorCode === 'otp_expired') msg = 'Ce lien de connexion a expiré. Veuillez en demander un nouveau.';

                        // Wait a tick for Alpine to be ready
                        setTimeout(() => this.showToast('❌ ' + msg, 'error'), 500);

                        // Clean URL
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                }

                // Check session safely
                console.log('🔄 Init - Checking session...');

                // Detect Magic Link flow BEFORE getSession
                const isMagicLink =
                    window.location.hash.includes('access_token') ||
                    window.location.hash.includes('type=') ||
                    window.location.search.includes('code='); // PKCE support

                let { user: initialUser } = await AuthService.getSession();

                if (initialUser) {
                    if (isMagicLink) {
                        console.log('✨ Magic Link detected. Skipping strict check (Session is fresh).');
                        // No refresh needed, we assume the token from the link is valid
                    } else {
                        console.log('🕵️‍♂️ Existing session found, verifying validity (Strict Mode)...');
                        // STRICT CHECK: Attempt to refresh immediately
                        const { data, error } = await ApiService.refreshSession();

                        if (error || !data.session) {
                            console.warn('⛔ Session is invalid or expired:', error);
                            await this.logout(false); // Logout without confirmation
                            return;
                        }

                        console.log('✅ Session verified & Refreshed.');
                        initialUser = data.session.user; // Update user from refresh
                    }

                    this.user = initialUser;
                    await this.loadInitialData();
                }

                // Listen for auth changes
                AuthService.onAuthStateChange(async (event, session) => {
                    console.log('🔔 Auth Event:', event);

                    this.user = session?.user || null;

                    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                        // Clean URL hash
                        if (isAuthRedirect) {
                            console.log('🧹 Cleaning URL auth params...');
                            window.history.replaceState(null, '', window.location.pathname);
                        }
                        await this.loadInitialData();
                    } else if (event === 'SIGNED_OUT') {
                        this.resetData();
                    }
                });
            } catch (error) {
                console.error('🚨 Error during app initialization:', error);
                this.showToast('Erreur d\'initialisation: ' + error.message, 'error');
            } finally {
                this.initPlanningResponsive();
            }
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

            this.reconcileLocalCounts(); // Ensure counts are consistent
            this.checkWizardAutoOpen();
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
         * @param {boolean} [confirm=true] - Whether to ask for confirmation.
         */
        async logout(confirm = true) {
            if (confirm && !await this.askConfirm("Voulez-vous vraiment vous déconnecter ?", "Déconnexion")) return;

            // Optimistic update: Clear user state immediately
            this.user = null;
            this.resetData();

            try {
                // Attempt to sign out from Supabase
                await AuthService.signOut();
            } catch (error) {
                console.error('Logout error (ignored for UX):', error);
            } finally {
                // FORCE CLEANUP: Clear Supabase data from localStorage
                // Supabase uses keys like 'sb-<project-ref>-auth-token'
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('sb-') || key.includes('supabase')) {
                        console.log('🧹 Removing localStorage key:', key);
                        localStorage.removeItem(key);
                    }
                });

                // RELOAD CLEANLY: Redirect to base path to remove any query strings or hashes
                // This prevents "refresh logging you back in" if there was a lingering access_token/code in the URL
                window.location.href = window.location.pathname;
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
            // @ts-ignore
            this.toasts.push({ id, message, type });

            setTimeout(() => {
                // @ts-ignore
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, 5000);
        }
    }));
}
