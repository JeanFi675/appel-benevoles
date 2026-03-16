import Alpine from "alpinejs";
import { AuthService } from "./services/auth.js";
import { ApiService } from "./services/api.js";

function initAdminConnexionsApp() {
  Alpine.data("adminConnexionsApp", () => ({
    user: null,
    loading: true,
    isAdmin: false,
    users: [],
    selectedIds: [],
    sortField: 'email',
    sortDir: 'asc',
    toasts: [],

    get sortedUsers() {
      return [...this.users].sort((a, b) => {
        const va = this.sortField === 'email' ? (a.email || '').toLowerCase() : (a.created_at || '');
        const vb = this.sortField === 'email' ? (b.email || '').toLowerCase() : (b.created_at || '');
        if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
        if (va > vb) return this.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    },

    get allChecked() {
      return this.users.length > 0 && this.selectedIds.length === this.users.length;
    },

    get someChecked() {
      return this.selectedIds.length > 0;
    },

    toggleAll(checked) {
      this.selectedIds = checked ? this.users.map(u => /** @type {any} */ (u).id) : [];
    },

    sortBy(field) {
      if (this.sortField === field) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortField = field;
        this.sortDir = 'asc';
      }
    },

    sortIcon(field) {
      if (this.sortField !== field) return '↕';
      return this.sortDir === 'asc' ? '↑' : '↓';
    },

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
        const source = this.someChecked
            ? this.users.filter(u => this.selectedIds.includes(/** @type {any} */ (u).id))
            : this.users;
        if (!source.length) return;
        const emails = source.map(u => /** @type {any} */ (u).email).join(', ');
        navigator.clipboard.writeText(emails).then(() => {
            const nb = source.length;
            this.showToast(`✅ ${nb} email${nb > 1 ? 's' : ''} copié${nb > 1 ? 's' : ''} dans le presse-papier !`);
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
