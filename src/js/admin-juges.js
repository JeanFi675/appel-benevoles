import Alpine from "alpinejs";
import { AuthService } from "./services/auth.js";
import { ApiService } from "./services/api.js";

function initAdminJugesApp() {
  Alpine.data("adminJugesApp", () => ({
    user: null,
    loading: true,
    isAdmin: false,
    isGlobalAdmin: false,
    juges: [],
    toasts: [],
    configMontant: 10,
    savingConfig: false,

    async init() {
      let { user } = await AuthService.getSession();
      
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      this.user = user;
      
      await this.checkAdminRole();
    },

    async checkAdminRole() {
      try {
        const currentUser = /** @type {any} */ (this.user);
        const { data, error } = await ApiService.fetch('benevoles', {
          eq: { user_id: currentUser.id }
        });

        if (error) throw error;

        // Check if user has 'admin' or 'admin-juge' role
        if (data && data.some(p => p.role === 'admin' || p.role === 'admin-juge')) {
          this.isAdmin = true;
          this.isGlobalAdmin = data.some(p => p.role === 'admin');
          await this.loadConfig();
          await this.loadJuges();
        } else {
          this.isAdmin = false;
          window.location.href = "index.html";
        }
      } catch (err) {
        console.error("Erreur vérification droits admin-juge:", err);
        this.isAdmin = false;
      } finally {
          this.loading = false;
      }
    },

    async loadConfig() {
        try {
            const { data, error } = await ApiService.fetch('config', {
                eq: { key: 'tarif_degaines_juge' }
            });
            if (error) throw error;
            if (data && data.length > 0) {
                this.configMontant = parseFloat(data[0].value) || 10;
            }
        } catch(err) {
            console.error("Erreur chargement config:", err);
            this.showToast("❌ Erreur de chargement de la configuration", "error");
        }
    },

    async updateConfig() {
        this.savingConfig = true;
        try {
            const { error } = await ApiService.update('config', {
                value: this.configMontant
            }, { key: 'tarif_degaines_juge' });
            if (error) throw error;
            this.showToast("✅ Montant de la cagnotte sauvegardé !", "success");
        } catch(err) {
            console.error("Erreur mise à jour config:", err);
            this.showToast("❌ Impossible de sauvegarder le montant", "error");
        } finally {
             this.savingConfig = false;
        }
    },

    async loadJuges() {
        try {
            const { data, error } = await ApiService.fetch('benevoles', {
                in: { role: ['juge', 'admin-juge'] }
            });
            if (error) throw error;
            // Trier par nom alphabétique
            this.juges = (data || []).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
        } catch(err) {
            console.error("Erreur chargement juges:", err);
            this.showToast("❌ Impossible de charger les juges", "error");
        }
    },

    // @ts-ignore
    async updatePresence(juge) {
        try {
             const currentUser = /** @type {any} */ (juge);
             // On utilise update pour être sûr de ne pas écraser d'autres champs, et éviter les erreurs RLS sur l'insert.
             const { error } = await ApiService.update('benevoles', {
                 presence_samedi: currentUser.presence_samedi,
                 presence_dimanche: currentUser.presence_dimanche
             }, { id: currentUser.id });
             if (error) throw error;
             this.showToast(`✅ Présence mise à jour pour ${juge.prenom} ${juge.nom}`, "success");
        } catch (err) {
             console.error("Erreur mise à jour présence:", err);
             this.showToast("❌ Erreur lors de la mise à jour de la présence", "error");
             await this.loadJuges();
        }
    },

    showToast(message, type = "success") {
      const id = Date.now() + Math.random().toString(36).substr(2, 9);
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 5000);
    }
  }));
}

initAdminJugesApp();
Alpine.start();
