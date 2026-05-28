import Alpine from "alpinejs";
import { AuthService } from "./services/auth.js";
import { ApiService } from "./services/api.js";
import { AdminModule } from "./modules/admin/index.js";
import { createAdminStore } from "./stores/admin-store.js";
import { adminHeuresTab } from "./components/admin/admin-heures-tab.js";
import { adminMailingTab } from "./components/admin/admin-mailing-tab.js";
import { adminReferentsTab } from "./components/admin/admin-referents-tab.js";

document.addEventListener("alpine:init", () => {
  Alpine.store("admin", createAdminStore());
  Alpine.data("adminHeuresTab", adminHeuresTab);
  Alpine.data("adminMailingTab", adminMailingTab);
  Alpine.data("adminReferentsTab", adminReferentsTab);

  // `Object.create(AdminModule)` (au lieu du spread `...AdminModule`) préserve les
  // getters/setters de prototype installés sur AdminModule, qui délèguent le state
  // partagé à `Alpine.store('admin')`. Un spread invoquerait les getters et copierait
  // les valeurs au moment du wiring, cassant la délégation.
  Alpine.data("adminApp", () => {
    const inst = Object.create(AdminModule);

    inst.init = async function () {
      const { user } = await AuthService.getSession();
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      this.currentUser = user;

      const { data: profiles, error } = await ApiService.fetch("benevoles", {
        eq: { user_id: user.id },
        select: "role",
      });

      const hasAdminRole = profiles && profiles.some((p) => p.role === "admin");

      if (error || !hasAdminRole) {
        this.isAdmin = false;
        this.loading = false;

        window.location.href = "index.html";
        return;
      }

      this.isAdmin = true;

      await this.loadData();
      await this.initVisualCreator();
      this.loading = false;

      AuthService.onAuthStateChange(async (event, session) => {
        if (
          event === "SIGNED_IN" &&
          window.location.hash.includes("access_token")
        ) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      });
    };

    return inst;
  });
});

Alpine.start();
