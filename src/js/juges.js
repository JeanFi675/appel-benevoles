import Alpine from "alpinejs";
import { AuthService } from "./services/auth.js";
import { ApiService } from "./services/api.js";
import { CagnotteModule } from "./modules/user/cagnotte.js";

function initJugesApp() {
  Alpine.data("jugesApp", () => ({
    /** @type {{ id: string, email: string } | null} */
    user: null,
    loading: false,
    toasts: [],
    isLoaded: false,
    showForm: false, // Wait until profile loads to show form
    isAdmin: false,
    isAdminJuge: false,
    
    profileForm: {
      id: null,
      prenom: "",
      nom: "",
      telephone: "",
      taille_tshirt: "",
      presence_samedi: false,
      presence_dimanche: false,
      repas_vendredi: false,
      repas_samedi: false,
    },

    // Include modules we need
    ...CagnotteModule,

    async init() {
      // Magic link error handling
      const hash = window.location.hash;
      const search = window.location.search;
      const isAuthRedirect = hash.includes("access_token") || hash.includes("type=") || hash.includes("error=") || search.includes("code=");

      if (hash && hash.includes("error=")) {
        const params = new URLSearchParams(hash.substring(1));
        const errorDescription = params.get("error_description");
        const errorCode = params.get("error_code");
        if (errorDescription) {
          let msg = errorDescription.replace(/\+/g, " ");
          if (errorCode === "otp_expired") msg = "Ce lien a expiré.";
          setTimeout(() => this.showToast("❌ " + msg, "error"), 500);
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

      let { user } = await AuthService.getSession();
      if (user) {
        this.user = user;
        await this.loadJugeProfile();
      }

      AuthService.onAuthStateChange(async (event, session) => {
        this.user = session?.user || null;
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          if (isAuthRedirect) window.history.replaceState(null, "", window.location.pathname);
          // Wait briefly to allow auth token propagation
          setTimeout(async () => {
             await this.loadJugeProfile();
          }, 300);
        } else if (event === "SIGNED_OUT") {
          this.user = null;
          this.profileForm.id = null;
          this.isLoaded = false;
        }
      });
    },

    async loadJugeProfile() {
      const currentUser = /** @type {any} */ (this.user);
      if (!currentUser) return;
      this.isLoaded = false;
      this.isAdmin = false;
      try {
        const { data, error } = await ApiService.fetch('benevoles', {
          eq: { user_id: currentUser.id }
        });

        if (error) throw error;
        
        if (data && data.length > 0) {
          // Check if user is an admin for the top-bar "Retour Accueil" button
          const hasJuge = data.some(p => p.role === 'juge' || p.role === 'admin-juge');
          const hasAdmin = data.some(p => p.role === 'admin');

          if (!hasJuge && !hasAdmin) {
              // Si connecté en tant que simple bénévole, on redirige vers l'index
              window.location.href = "index.html";
              return;
          }

          if (data.some(p => p.role === 'admin')) {
             this.isAdmin = true;
          }
          if (data.some(p => p.role === 'admin' || p.role === 'admin-juge')) {
             this.isAdminJuge = true;
          }

          const jugeProfile = data.find(p => p.role === 'juge' || p.role === 'admin-juge' || p.role === 'admin');
          const profile = jugeProfile || data[0];

          this.profileForm = {
            id: profile.id,
            prenom: profile.prenom || "",
            nom: profile.nom || "",
            telephone: profile.telephone || "",
            taille_tshirt: profile.taille_tshirt || "",
            presence_samedi: profile.presence_samedi || false,
            presence_dimanche: profile.presence_dimanche || false,
            repas_vendredi: profile.repas_vendredi || false,
            repas_samedi: profile.repas_samedi || false,
          };
        }
      } catch (error) {
        console.error("Erreur chargement profil juge:", error);
      } finally {
        this.isLoaded = true;
        this.showForm = true;
      }
    },

    async saveProfile() {
      const currentUser = /** @type {any} */ (this.user);
      if (!currentUser) return;
      if (!this.profileForm.prenom || !this.profileForm.nom || !this.profileForm.telephone || !this.profileForm.taille_tshirt) {
        this.showToast("❌ Veuillez remplir tous les champs obligatoires (*)", "error");
        return;
      }

      this.loading = true;
      try {
        let roleToSave = 'juge';
        if (this.isAdminJuge) roleToSave = 'admin-juge';
        if (this.isAdmin) roleToSave = 'admin';

        const profileData = {
          user_id: currentUser.id,
          email: currentUser.email,
          role: roleToSave,
          prenom: this.profileForm.prenom,
          nom: this.profileForm.nom,
          telephone: this.profileForm.telephone,
          taille_tshirt: this.profileForm.taille_tshirt,
          repas_vendredi: this.profileForm.repas_vendredi,
          repas_samedi: this.profileForm.repas_samedi,
        };

        if (this.profileForm.id) {
          profileData.id = this.profileForm.id;
        }

        const { error } = await ApiService.upsert("benevoles", profileData);
        if (error) throw error;

        this.showToast("✅ Profil Juge enregistré !", "success");
        await this.loadJugeProfile(); // reload to get Cagnotte updated
        
        // Refresh the cagnotte widget manually if present
        if (document.getElementById('cagnotte-widget-container')) {
             this.renderWidget(document.getElementById('cagnotte-widget-container'), currentUser.id);
        }

      } catch (error) {
        this.showToast("❌ Erreur : " + error.message, "error");
      } finally {
        this.loading = false;
      }
    },

    // Auth actions
    loginEmail: "",
    async sendMagicLink() {
      if (!this.loginEmail) return;
      this.loading = true;
      try {
        const { error } = await AuthService.signInWithOtp(this.loginEmail);
        if (error) throw error;
        this.showToast("📧 Vérifiez votre boîte mail !", "success");
        this.loginEmail = "";
      } catch (err) {
        this.showToast("❌ Erreur : " + err.message, "error");
      } finally {
        this.loading = false;
      }
    },

    async logout() {
       this.user = null;
       await AuthService.signOut();
       Object.keys(localStorage).forEach((key) => {
         if (key.startsWith("sb-") || key.includes("supabase")) localStorage.removeItem(key);
       });
       window.location.href = window.location.pathname;
    },

    showToast(message, type = "success") {
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

initJugesApp();
Alpine.start();
