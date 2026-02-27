import Alpine from "alpinejs";
import { AuthService } from "./services/auth.js";
import { ApiService } from "./services/api.js";
import { TshirtModule } from "./modules/user/tshirt.js";

function initOfficielsApp() {
  Alpine.data("officielsApp", () => ({
    /** @type {{ id: string, email: string } | null} */
    user: null,
    loading: false,
    toasts: [],
    
    // Auth State
    step: 1, // 1: Email, 2: OTP
    otpCode: "",
    
    isLoaded: false,
    showForm: false, // Wait until profile loads to show form
    isAdmin: false,
    
    profileForm: {
      id: null,
      prenom: "",
      nom: "",
      taille_tshirt: "",
      repas_vendredi: false,
      repas_samedi: false,
    },

    // Include modules we need
    ...TshirtModule,

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
        await this.loadOfficielProfile();
      }

      AuthService.onAuthStateChange(async (event, session) => {
        this.user = session?.user || null;
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          if (isAuthRedirect) window.history.replaceState(null, "", window.location.pathname);
          // Wait briefly to allow auth token propagation
          setTimeout(async () => {
             await this.loadOfficielProfile();
          }, 300);
        } else if (event === "SIGNED_OUT") {
          this.user = null;
          this.profileForm.id = null;
          this.isLoaded = false;
        }
      });
    },

    async loadOfficielProfile() {
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
          const isOfficiel = data.some(p => p.role === 'officiel');
          const hasAdmin = data.some(p => p.role === 'admin');

          if (!isOfficiel && !hasAdmin) {
              // Si connecté en tant que simple bénévole ou juge, on le renvoie vers l'accueil
              window.location.href = "index.html";
              return;
          }

          if (hasAdmin) {
             this.isAdmin = true;
          }

          const officielProfile = data.find(p => p.role === 'officiel' || p.role === 'admin');
          const profile = officielProfile || data[0];

          this.profileForm = {
            id: profile.id,
            prenom: profile.prenom || "",
            nom: profile.nom || "",
            taille_tshirt: profile.taille_tshirt || "",
            repas_vendredi: profile.repas_vendredi || false,
            repas_samedi: profile.repas_samedi || false,
          };
        } else {
             // AUTO-CREATION: Le compte est nouveau, on verrouille immédiatement le rôle "officiel" en base
             await ApiService.upsert("benevoles", {
                user_id: currentUser.id,
                email: currentUser.email,
                role: 'officiel'
             });
             // On rappelle immédiatement le chargement une fois le profil vide en base
             return this.loadOfficielProfile();
        }
      } catch (error) {
        console.error("Erreur chargement profil officiel:", error);
      } finally {
        this.isLoaded = true;
        this.showForm = true;
      }
    },

    async saveProfile() {
      const currentUser = /** @type {any} */ (this.user);
      if (!currentUser) return;
      if (!this.profileForm.prenom || !this.profileForm.nom || !this.profileForm.taille_tshirt) {
        this.showToast("❌ Veuillez remplir tous les champs obligatoires (*)", "error");
        return;
      }

      this.loading = true;
      try {
        let roleToSave = 'officiel';
        if (this.isAdmin) roleToSave = 'admin';

        const profileData = {
          user_id: currentUser.id,
          email: currentUser.email,
          role: roleToSave,
          prenom: this.profileForm.prenom,
          nom: this.profileForm.nom,
          taille_tshirt: this.profileForm.taille_tshirt,
          repas_vendredi: this.profileForm.repas_vendredi,
          repas_samedi: this.profileForm.repas_samedi,
        };

        if (this.profileForm.id) {
          profileData.id = this.profileForm.id;
        }

        const { error } = await ApiService.upsert("benevoles", profileData);
        if (error) throw error;

        this.showToast("✅ Profil Officiel enregistré !", "success");
        await this.loadOfficielProfile(); 

      } catch (error) {
        this.showToast("❌ Erreur : " + error.message, "error");
      } finally {
        this.loading = false;
      }
    },

    // Auth actions
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
        this.step = 2;
        
        // Focus on the OTP input after DOM upate
        setTimeout(() => {
            const otpInput = document.getElementById('otp');
            if (otpInput) otpInput.focus();
        }, 100);

      } catch (err) {
        this.showToast("❌ Erreur : " + err.message, "error");
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
                this.user = data.session.user;
                
                // Clean URL hash
                window.history.replaceState(null, "", window.location.pathname);
                
                await this.loadOfficielProfile();
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

initOfficielsApp();
Alpine.start();
