import { ApiService } from "../../services/api.js";
// Import QRCode via CDN fallback or npm if available in build process
// Assuming dynamic import or global availability if linked in HTML,
// but since we installed via npm and use Vite, we can import it.
import QRCode from "qrcode";

let isRendering = false;

export const CagnotteModule = {
  user: null, // Will be set by init
  container: null,

  init(user) {
    this.user = user;
    // Find or create the container in the dashboard
    // We'll look for a specific placeholder in the dashboard HTML
    // If not found, we might append it to a specific section
  },

  /**
   * Fetches the current balance for the user's family
   */
  async getBalance() {
    if (!this.user) return 0;
    try {
      const { data, error } = await ApiService.rpc("get_user_balance", {
        target_user_id: this.user.id,
      });
      if (error) throw error;
      return data || 0;
    } catch (e) {
      console.error("Error fetching balance:", e);
      return 0;
    }
  },

  /**
   * Renders the Cagnotte widget (Balance + QR Code Button)
   * @param {HTMLElement} parentElement - Where to inject the widget
   * @param {string} benevoleId - The specific volunteer ID for the QR Code
   */
  /**
   * Renders the Cagnotte widget (Balance + QR Code Button)
   * @param {HTMLElement} parentElement - Where to inject the widget
   * @param {string} benevoleId - The specific volunteer ID for the QR Code
   */
  async renderWidget(parentElement, benevoleId) {
    if (!parentElement) return;

    // Simple debounce/lock to prevent double-render loop, but allow re-entry if enough time passed
    if (isRendering) return;
    isRendering = true;

    try {
      // Check if widget already exists to avoid unnecessary flicker/re-render
      if (parentElement.querySelector(".cagnotte-widget-content")) {
        // Update balance only? For now, let's full re-render to be safe but fast
        // actually, full re-render is fine.
      }

      const balance = await this.getBalance();

      // Check again if parent still exists (component might have been destroyed)
      if (!parentElement) return;

      // Clear logic: simpler is better.
      parentElement.innerHTML = "";

      const widget = document.createElement("div");
      widget.className =
        "bg-white rounded-lg shadow-sm p-4 border border-emerald-100 cagnotte-widget-content";
      widget.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-semibold text-emerald-800 uppercase tracking-wide">Ma Cagnotte</h3>
                        <div class="text-2xl font-bold text-emerald-600">${parseFloat(
                          balance
                        ).toFixed(2)} €</div>
                    </div>
                    <button id="show-qr-${benevoleId}" class="bg-gray-800 hover:bg-black text-white p-2 rounded-lg transition-colors" title="Afficher mon QR Code">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </button>
                </div>
                
                <!-- Modal / Expanded Area for QR Code -->
                <div id="qr-container-${benevoleId}" class="hidden mt-4 text-center border-t pt-4">
                    <p class="text-sm text-gray-500 mb-2">Présentez ce code pour régler vos consos</p>
                    <div class="flex justify-center bg-white p-2 rounded">
                        <canvas id="qr-canvas-${benevoleId}"></canvas>
                    </div>
                </div>
            `;

      parentElement.appendChild(widget);

      // Event Listeners
      const btn = widget.querySelector(`#show-qr-${benevoleId}`);
      const qrContainer = widget.querySelector(`#qr-container-${benevoleId}`);
      const canvas = widget.querySelector(`#qr-canvas-${benevoleId}`);

      btn.addEventListener("click", () => {
        const isHidden = qrContainer.classList.contains("hidden");
        if (isHidden) {
          qrContainer.classList.remove("hidden");

          // Generate Full URL for Debit
          // Handle subdirectories (e.g. GitHub Pages repo name)
          const path = window.location.pathname;
          const directory = path.substring(0, path.lastIndexOf("/") + 1);
          const debitUrl = `${window.location.origin}${directory}debit.html?id=${benevoleId}`;
          this.generateQR(canvas, debitUrl);

          btn.classList.add("bg-emerald-600");
          btn.classList.remove("bg-gray-800");
        } else {
          qrContainer.classList.add("hidden");
          btn.classList.remove("bg-emerald-600");
          btn.classList.add("bg-gray-800");
        }
      });
    } finally {
      isRendering = false;
    }
  },

  generateQR(canvas, text) {
    QRCode.toCanvas(
      canvas,
      text,
      {
        width: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      },
      function (error) {
        if (error) console.error(error);
      }
    );
  },
};
