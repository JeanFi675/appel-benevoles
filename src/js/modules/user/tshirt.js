import { ApiService } from "../../services/api.js";
import QRCode from "qrcode";

let isRenderingTshirt = false;

export const TshirtModule = {
    // Check if we should render
    async renderTshirtWidget(parentElement, userId) {
        if (!parentElement) return;

        // Check if widget already exists to avoid loop, but we might want to refresh
        // For now simple guard
        if (isRenderingTshirt) return;
        isRenderingTshirt = true;

        try {
            // Fetch status
            const { data, error } = await ApiService.rpc('get_family_tshirt_info_smart', { scan_id: userId });
            if (error || !data || data.length === 0) {
                parentElement.innerHTML = ""; // Clear if empty
                return;
            }

            // Check if ANYONE is eligible
            const eligibles = data.filter(v => v.has_registrations);
            if (eligibles.length === 0) {
                parentElement.innerHTML = "";
                return; // No T-shirts to give
            }

            // Check if ALL are collected
            const allCollected = eligibles.every(v => v.t_shirt_recupere);
            if (allCollected) {
                parentElement.innerHTML = ""; // Hide if all collected
                return;
            }

            // Render Widget
            parentElement.innerHTML = "";
            const widget = document.createElement("div");
            widget.className = "bg-white rounded-lg shadow-sm p-2 md:p-4 border border-blue-100 tshirt-widget-content";

            const countToCollect = eligibles.filter(v => !v.t_shirt_recupere).length;

            widget.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                     <h3 class="text-xs md:text-sm font-semibold text-blue-800 uppercase tracking-wide">👕 Mes T-shirts</h3>
                     <p class="text-blue-600 font-bold text-sm md:text-xl">${countToCollect} à récupérer</p>
                </div>
                 <button id="show-tshirt-qr" class="bg-blue-600 hover:bg-blue-800 text-white p-1 md:p-2 rounded-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                 </button>
            </div>
            <div id="tshirt-qr-container" class="hidden mt-4 text-center border-t pt-4">
                 <p class="text-sm text-gray-500 mb-2">Présentez ce code au stand T-shirts</p>
                 <div class="flex justify-center bg-white p-2 rounded">
                    <canvas id="tshirt-canvas" class="max-w-full h-auto"></canvas>
                 </div>
            </div>
        `;

            parentElement.appendChild(widget);

            // Event Listeners
            const btn = widget.querySelector('#show-tshirt-qr');
            const container = widget.querySelector('#tshirt-qr-container');
            const canvas = widget.querySelector('#tshirt-canvas');

            if (btn) {
                btn.addEventListener('click', () => {
                    if (container.classList.contains('hidden')) {
                        container.classList.remove('hidden');
                        const path = window.location.pathname;
                        const directory = path.substring(0, path.lastIndexOf("/") + 1);
                        const scannerUrl = `${window.location.origin}${directory}scanner-tshirt.html?id=${userId}`;

                        QRCode.toCanvas(canvas, scannerUrl, { width: 200, margin: 2 }, (e) => { if (e) console.error(e); });
                        parentElement.classList.add("col-span-2");
                    } else {
                        container.classList.add('hidden');
                        parentElement.classList.remove("col-span-2");
                    }
                });
            }

        } catch (e) {
            console.error("Error rendering tshirt widget:", e);
        } finally {
            isRenderingTshirt = false;
        }
    }
};
