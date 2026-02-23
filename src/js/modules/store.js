import Alpine from "alpinejs";
import { AuthService } from "../services/auth.js";
import { ApiService } from "../services/api.js";
import { ProfilesModule } from "./user/profiles.js";
import { PlanningModule } from "./user/planning.js";
import { WizardModule } from "./user/wizard.js";
import { CagnotteModule } from "./user/cagnotte.js";
import { TshirtModule } from "./user/tshirt.js";

/**
 * Initializes the central application store.
 * Combines Auth, Profiles, and Planning modules.
 */
export function initStore() {
  Alpine.data("app", () => ({
    // Global State
    user: null,
    loading: false,
    toasts: [],
    lastAuthSuccess: 0, // Timestamp of last successful login

    // Login View State
    loginEmail: "",
    loginPassword: "",
    loginView: "magic", // 'magic', 'password', 'sent'
    resetModalOpen: false,
    newPassword: "",

    // Modal State
    confirmModal: {
      open: false,
      title: "",
      message: "",
      /** @type {((value: boolean) => void) | null} */
      resolve: null,
    },

    // Polling State
    /** @type {any} */
    pollingInterval: null,

    /**
     * Opens the confirmation modal and returns a promise.
     * @param {string} message - The message to display.
     * @param {string} [title='Confirmation'] - The title of the modal.
     * @returns {Promise<boolean>} True if confirmed, false otherwise.
     */
    askConfirm(message, title = "Confirmation") {
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
          hash.includes("access_token") ||
          hash.includes("type=") ||
          hash.includes("error=") ||
          search.includes("code=");

        // Intercept Password Recovery link
        let isRecovery = false;
        // We explicitly appended ?type=recovery to the reset password redirect URI
        if (search.includes("type=recovery") || hash.includes("type=recovery")) {
           console.log("🔓 Explicit Type Recovery detected in URL");
           isRecovery = true;
           this.resetModalOpen = true; // Open the modal to ask for the new password
           // Do not clean URL immediately so the session can be parsed by Supabase
        }

        if (hash && hash.includes("error=")) {
          const params = new URLSearchParams(hash.substring(1)); // Remove #
          const errorDescription = params.get("error_description");
          const errorCode = params.get("error_code");

          if (errorDescription) {
            // Translate common codes
            let msg = errorDescription.replace(/\+/g, " ");
            if (errorCode === "otp_expired")
              msg =
                "Ce lien a expiré. Veuillez en demander un nouveau.";

            // Wait a tick for Alpine to be ready
            setTimeout(() => this.showToast("❌ " + msg, "error"), 500);

            // Clean URL
            window.history.replaceState(null, "", window.location.pathname);
          }
        }

        // Check session safely
        console.log("🔄 Init - Checking session...");

        // STANDARD FLOW: Just check persistence, don't force refresh (avoids Race Condition with Magic Link)
        let { user: initialUser } = await AuthService.getSession();

        if (initialUser) {
          console.log("✅ Found persisted session.");
          this.user = initialUser;
          await this.loadInitialData();
        }

        // Listen for auth changes
        AuthService.onAuthStateChange(async (event, session) => {
          console.log("🔔 Auth Event:", event);
          
          if (event === "PASSWORD_RECOVERY") {
              console.log("🔓 PASSWORD_RECOVERY event detected from Supabase");
              this.resetModalOpen = true;
          }

          this.user = session?.user || null;

          if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
            // Track successful auth time to prevent immediate "visibilitychange" checks (Race Condition fix)
            this.lastAuthSuccess = Date.now();

            // Clean URL hash
            if (isAuthRedirect) {
              console.log("🧹 Cleaning URL auth params...");
              
              // Only clean the URL if we are NOT in the middle of a password recovery
              // OR if it's explicitly marked as recovery from the start, we wait for the update
              if (!isRecovery && !this.resetModalOpen) {
                  window.history.replaceState(null, "", window.location.pathname);
              }

              // Only load data here if we are handling a redirect (Magic Link)
              // For normal visibility changes or refreshes, the visibility logic handles it
              await this.loadInitialData();
            } else {
              // For normal signed_in events (like after a refresh), we might not need to reload everything immediately
              // unless it's the initial session.
              if (event === "INITIAL_SESSION") {
                await this.loadInitialData();
              }
            }
          } else if (event === "SIGNED_OUT") {
            this.resetData();
          }
        });
      } catch (error) {
        console.error("🚨 Error during app initialization:", error);
        this.showToast("Erreur d'initialisation: " + error.message, "error");
      } finally {
        this.initPlanningResponsive();
        // Start polling for data updates
        this.startPolling();

        // Visibility API: Pause polling when tab is hidden
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) {
            this.stopPolling();
          } else {
            console.log("👀 Tab visible - Refreshing data...");

            // SECURITY: Refresh session AVANT de charger les données
            // Le SDK gère le refresh automatiquement via getSession() mais on veut s'assurer
            // que la session est valide avant de lancer les appels RPC graphiques.

            // FIX MOBILE: Don't check session immediately if we just logged in (Magic Link Redirect)
            // 15 seconds grace period
            if (
              this.lastAuthSuccess &&
              Date.now() - this.lastAuthSuccess < 15000
            ) {
              console.log(
                "️🛡️ Skipping visibility session check (Grace Period active)",
              );
              this.startPolling();
              return; // Skip the aggressive check
            }

            AuthService.getSession().then(({ session }) => {
              if (session) {
                this.loadInitialData(); // Safe refresh with valid token
                this.startPolling();
              } else {
                console.warn(
                  "⚠️ Session perdue pendant inactivité (ou race condition)",
                );
                // SOFT LOGOUT: Don't force logout immediately if it might be a network glitch
                // Only logout if we are SURE. Use a toast to warn user.
                if (navigator.onLine) {
                  this.logout(false);
                } else {
                  this.showToast("Connexion internet instable...", "error");
                }
              }
            });
          }
        });
      }
    },

    /**
     * Starts the data polling interval (every 60s).
     */
    async startPolling() {
      if (this.pollingInterval) return;
      console.log("⏰ Starting secure data polling (60s)...");

      // Use an async wrapper for the interval action
      this.pollingInterval = setInterval(async () => {
        if (!document.hidden && this.user) {
          // SECURITY: Ensure we have a valid session before fetching
          // getSession() automatically handles token refresh if needed.
          const { session } = await AuthService.getSession();

          if (session) {
            // Token is valid/refreshed, proceed to fetch
            this.loadInitialData(true);
          } else {
            console.warn(
              "⚠️ Polling skipped: No active session. Stopping polling.",
            );
            this.stopPolling();
            this.logout(false); // Force logout if session is dead
          }
        }
      }, 60000);
    },

    /**
     * Stops the data polling.
     */
    stopPolling() {
      if (this.pollingInterval) {
        console.log("🛑 Stopping data polling...");
        clearInterval(/** @type {any} */ (this.pollingInterval));
        this.pollingInterval = null;
      }
    },

    /**
     * Loads all necessary data for the authenticated user.
     * @param {boolean} silent - If true, suppresses loading indicators or toasts if implemented.
     */
    async loadInitialData(silent = false) {
      if (!this.user) return;
      await Promise.all([
        this.loadProfiles(),
        this.loadPostes(),
        this.loadUserInscriptions(),
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

    /**
     * Sends a magic link for login.
     */
    async sendMagicLink() {
      if (!this.loginEmail) return;

      this.loading = true;
      try {
        const { error } = await AuthService.signInWithOtp(this.loginEmail);
        if (error) throw error;

        this.showToast("📧 Vérifiez votre boîte mail !", "success");
      } catch (error) {
        this.showToast("❌ Erreur : " + error.message, "error");
      } finally {
        this.loading = false;
      }
    },

    /**
     * Signs in with password.
     */
    async loginWithPassword() {
        if (!this.loginEmail || !this.loginPassword) return;

        this.loading = true;
        try {
            const { error } = await AuthService.signInWithPassword(this.loginEmail, this.loginPassword);
            if (error) throw error;
            
            this.showToast("✅ Connecté avec succès", "success");
            this.loginPassword = "";
        } catch (error) {
            let msg = error.message;
            if (error.message.includes("Invalid login credentials")) {
                msg = "Email ou mot de passe incorrect.";
            }
            this.showToast("❌ Erreur : " + msg, "error");
        } finally {
            this.loading = false;
        }
    },

    /**
     * Requests a password reset email.
     */
    async requestPasswordReset() {
        if (!this.loginEmail) {
            this.showToast("⚠️ Veuillez entrer votre email d'abord", "error");
            return;
        }

        this.loading = true;
        try {
            const { error } = await AuthService.resetPasswordForEmail(this.loginEmail);
            if (error) throw error;

            this.showToast("📧 Email de réinitialisation envoyé !", "success");
            this.loginView = "magic"; // Reset view
        } catch (error) {
            this.showToast("❌ Erreur : " + error.message, "error");
        } finally {
            this.loading = false;
        }
    },

    /**
     * Updates the user's password after clicking the reset link.
     */
    async updatePassword() {
        if (!this.newPassword || this.newPassword.length < 6) {
            this.showToast("⚠️ Le mot de passe doit faire au moins 6 caractères", "error");
            return;
        }

        this.loading = true;
        try {
            const { error } = await AuthService.updateUserPassword(this.newPassword);
            if (error) throw error;

            this.showToast("✅ Mot de passe mis à jour avec succès !", "success");
            this.resetModalOpen = false;
            this.newPassword = "";
             // Clean URL now that we are done
            window.history.replaceState(null, "", window.location.pathname);
            
            // Check if wizard needs to open now that the reset modal is gone
            this.checkWizardAutoOpen();
        } catch (error) {
            this.showToast("❌ Erreur : " + error.message, "error");
        } finally {
            this.loading = false;
        }
    },

    /**
     * Logs out the user.
     * @param {boolean} [confirm=true] - Whether to ask for confirmation.
     */
    async logout(confirm = true) {
      if (
        confirm &&
        !(await this.askConfirm(
          "Voulez-vous vraiment vous déconnecter ?",
          "Déconnexion",
        ))
      )
        return;

      // Optimistic update: Clear user state immediately
      this.user = null;
      this.resetData();

      try {
        // Attempt to sign out from Supabase
        await AuthService.signOut();
      } catch (error) {
        console.error("Logout error (ignored for UX):", error);
      } finally {
        // FORCE CLEANUP: Clear Supabase data from localStorage
        // Supabase uses keys like 'sb-<project-ref>-auth-token'
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-") || key.includes("supabase")) {
            console.log("🧹 Removing localStorage key:", key);
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
    showToast(message, type = "success") {
      const id = Date.now() + Math.random().toString(36).substr(2, 9);
      // @ts-ignore
      this.toasts.push({ id, message, type });

      setTimeout(() => {
        // @ts-ignore
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 5000);
    },
  }));
}
