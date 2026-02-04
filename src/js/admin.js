import Alpine from "alpinejs";
import { AuthService } from "./services/auth.js";
import { ApiService } from "./services/api.js";
import { AdminModule } from "./modules/admin/index.js";

document.addEventListener("alpine:init", () => {
  Alpine.data("adminApp", () => ({
    ...AdminModule,

    async init() {
      // Check authentication
      const { user } = await AuthService.getSession();
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      this.currentUser = user;

      // Check admin role
      const { data: profiles, error } = await ApiService.fetch("benevoles", {
        eq: { user_id: user.id },
        select: "role",
      });

      const hasAdminRole = profiles && profiles.some((p) => p.role === "admin");

      if (error || !hasAdminRole) {
        this.isAdmin = false;
        this.loading = false;
        return;
      }

      this.isAdmin = true;

      // Wait for data before showing UI
      await this.loadData();
      this.loading = false;

      // Auth listener
      AuthService.onAuthStateChange(async (event, session) => {
        if (
          event === "SIGNED_IN" &&
          window.location.hash.includes("access_token")
        ) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      });
    },
  }));
});

Alpine.start();
