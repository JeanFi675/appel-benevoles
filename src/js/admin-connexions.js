import Alpine from "alpinejs";
import { AuthService } from "./services/auth.js";
import { ApiService } from "./services/api.js";

function initAdminConnexionsApp() {
  Alpine.data("adminConnexionsApp", () => ({
    user: null,
    loading: true,
    isAdmin: false,
    users: [],
    toasts: [],

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

        // Check if user has 'admin'
        if (data && data.some(p => p.role === 'admin')) {
          this.isAdmin = true;
          await this.loadUsers();
        } else {
          this.isAdmin = false;
          window.location.href = "index.html";
        }
      } catch (err) {
        console.error("Erreur vérification droits admin:", err);
        this.isAdmin = false;
      } finally {
          this.loading = false;
      }
    },

    async loadUsers() {
        try {
            const { data, error } = await ApiService.rpc('get_auth_users_without_benevole');
            
            if (error) throw error;
            this.users = data || [];
        } catch(err) {
            console.error("Erreur chargement utilisateurs orphelins:", err);
            this.showToast("❌ Impossible de charger la liste", "error");
        }
    },

    copyEmails() {
        if (!this.users.length) return;
        const emails = this.users.map(u => /** @type {any} */ (u).email).join(', ');
        navigator.clipboard.writeText(emails).then(() => {
            this.showToast("✅ Emails copiés dans le presse-papier !");
        }).catch(err => {
            console.error('Erreur copie presse-papier:', err);
            this.showToast("❌ Erreur lors de la copie des emails", "error");
        });
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    },

    showToast(message, type = "success") {
      const id = Date.now() + Math.random().toString(36).substr(2, 9);
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => /** @type {any} */ (t).id !== id);
      }, 5000);
    }
  }));
}

initAdminConnexionsApp();
Alpine.start();
