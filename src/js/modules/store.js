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

    // Auth State
    step: 1, // 1: Email, 2: OTP
    otpCode: "",

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

        if (hash && hash.includes("error=")) {
          const params = new URLSearchParams(hash.substring(1)); // Remove #
          const errorDescription = params.get("error_description");
          const errorCode = params.get("error_code");

          if (errorDescription) {
            // Translate common codes
            let msg = errorDescription.replace(/\+/g, " ");
            if (errorCode === "otp_expired")
              msg =
                "Ce lien de connexion a expiré. Veuillez en demander un nouveau.";

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

          this.user = session?.user || null;

          if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
            // Track successful auth time to prevent immediate "visibilitychange" checks (Race Condition fix)
            this.lastAuthSuccess = Date.now();

            // Clean URL hash
            if (isAuthRedirect) {
              console.log("🧹 Cleaning URL auth params...");
              window.history.replaceState(null, "", window.location.pathname);

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
            
            // Si on n'est pas encore connecté (ex: en pleine saisie d'OTP), on ne fait rien
            if (!this.user) return;

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

    loginEmail: "",

    /**
     * Requests an OTP code for login.
     */
    async requestOtp() {
      if (!this.loginEmail) return;

      this.loading = true;
      try {
        const { error } = await AuthService.signInWithOtp(this.loginEmail);
        if (error) throw error;

        this.showToast("📧 Code envoyé ! Vérifiez votre boîte mail.", "success");
        this.step = 2; // Move to step 2
        
        // Focus on the OTP input after DOM upate
        setTimeout(() => {
            const otpInput = document.getElementById('otp');
            if (otpInput) otpInput.focus();
        }, 100);

      } catch (error) {
        console.error("Error requesting OTP:", error);
        this.showToast("❌ Erreur : " + error.message, "error");
      } finally {
        this.loading = false;
      }
    },

    /**
     * Verifies the OTP code.
     */
    async verifyOtp() {
        if (!this.loginEmail || !this.otpCode || this.otpCode.length !== 6) {
            this.showToast("❌ Veuillez entrer un code à 6 chiffres.", "error");
            return;
        }

        this.loading = true;
        try {
            const { data, error } = await AuthService.verifyOtp(this.loginEmail, this.otpCode);
            
            if (error) throw error;
            
            if (data && data.session) {
                this.showToast("✅ Connexion réussie !", "success");
                
                // Track auth time
                this.lastAuthSuccess = Date.now();
                this.user = data.session.user;
                
                // Clean URL hash
                window.history.replaceState(null, "", window.location.pathname);
                
                await this.loadInitialData();
            } else {
                throw new Error("Code invalide ou expiré.");
            }

        } catch (error) {
            console.error("Error verifying OTP:", error);
            let msg = error.message;
            if (msg.includes("Token has expired or is invalid")) {
                msg = "Code invalide ou expiré. Veuillez vérifier ou demander un nouveau code.";
            }
            this.showToast("❌ Erreur : " + msg, "error");
            this.otpCode = ''; 
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
