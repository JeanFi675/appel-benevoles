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
    jugesNonTrouves: [],
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

        // Check if user has 'admin' or 'admin-juge' role
        if (data && data.some(p => p.role === 'admin' || p.role === 'admin-juge')) {
          this.isAdmin = true;
          this.isGlobalAdmin = data.some(p => p.role === 'admin');
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



    async loadJuges() {
        try {
            const { data, error } = await ApiService.fetch('benevoles', {
                in: { role: ['juge', 'admin-juge'] }
            });
            if (error) throw error;
            
            const supabaseJuges = data || [];
            
            // Récupération des données du webhook
            const webhookResponse = await fetch('https://n8n.jpcloudkit.fr/webhook/sync-juge');
            const webhookJuges = await webhookResponse.json();
            
            const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
            
            const matchedJuges = [];
            const unmatchedJuges = [];
            const updates = [];
            
            // Croisement des données Webhook -> Supabase
            webhookJuges.forEach(wj => {
                const wjNom = normalize(wj.nom);
                const wjPrenom = normalize(wj.prenom);
                
                const match = supabaseJuges.find(sj => 
                    normalize(sj.nom) === wjNom && normalize(sj.prenom) === wjPrenom
                );

                if (match) {
                    const newSamedi = wj["present-samedi"] === true;
                    const newDimanche = wj["present-dimanche"] === true;
                    
                    if (match.presence_samedi !== newSamedi || match.presence_dimanche !== newDimanche) {
                        updates.push(ApiService.update('benevoles', {
                            presence_samedi: newSamedi,
                            presence_dimanche: newDimanche
                        }, { id: match.id }).catch(err => console.error("Erreur sync juge", err)));
                    }

                    matchedJuges.push({
                        ...match,
                        presence_samedi: newSamedi,
                        presence_dimanche: newDimanche
                    });
                } else {
                    unmatchedJuges.push({
                        nom: wj.nom,
                        prenom: wj.prenom,
                        presence_samedi: wj["present-samedi"],
                        presence_dimanche: wj["present-dimanche"]
                    });
                }
            });
            
            // Ajout des juges Supabase qui ne sont pas dans le webhook
            supabaseJuges.forEach(sj => {
                const sjNom = normalize(sj.nom);
                const sjPrenom = normalize(sj.prenom);
                const isInWebhook = webhookJuges.some(wj => normalize(wj.nom) === sjNom && normalize(wj.prenom) === sjPrenom);
                
                if (!isInWebhook) {
                    if (sj.presence_samedi !== false || sj.presence_dimanche !== false) {
                        updates.push(ApiService.update('benevoles', {
                            presence_samedi: false,
                            presence_dimanche: false
                        }, { id: sj.id }).catch(err => console.error("Erreur sync juge absent", err)));
                    }

                    matchedJuges.push({
                        ...sj,
                        presence_samedi: false,
                        presence_dimanche: false
                    });
                }
            });

            if (updates.length > 0) {
                await Promise.all(updates);
                this.showToast(`✅ ${updates.length} profil(s) synchronisé(s) depuis le fichier.`, "success");
            }

            // Trier par nom alphabétique
            this.juges = matchedJuges.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
            this.jugesNonTrouves = unmatchedJuges.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
        } catch(err) {
            console.error("Erreur chargement juges:", err);
            this.showToast("❌ Impossible de charger les juges", "error");
        }
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

initAdminJugesApp();
Alpine.start();
