import Alpine from 'alpinejs';
import { AuthService } from './services/auth.js';
import { ApiService } from './services/api.js';
import { AdminModule } from './modules/admin/index.js';

document.addEventListener('alpine:init', () => {
    Alpine.data('adminApp', () => ({
        ...AdminModule,

        async init() {
            // Check authentication
            const { user } = await AuthService.getSession();
            if (!user) {
                window.location.href = 'index.html';
                return;
            }

            // Check admin role
            const { data: profile, error } = await ApiService.fetch('benevoles', {
                eq: { id: user.id },
                select: 'role'
            });

            // Note: fetch returns array, we need single
            const adminProfile = (profile && profile.length > 0) ? profile[0] : null;

            if (error || !adminProfile || adminProfile.role !== 'admin') {
                this.isAdmin = false;
                this.loading = false;
                return;
            }

            this.isAdmin = true;
            this.loading = false;
            await this.loadData();

            // Auth listener
            AuthService.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
                    window.history.replaceState(null, '', window.location.pathname);
                }
            });
        }
    }));
});

Alpine.start();
