import Alpine from 'alpinejs';
import { AuthService } from './services/auth.js';

function setupLoginCodeApp() {
    Alpine.data('loginCodeApp', () => ({
        step: 1, // 1: Email, 2: OTP
        email: '',
        otpCode: '',
        loading: false,
        toasts: [],
        
        async init() {
            // Check if user is already logged in
            const { session } = await AuthService.getSession();
            if (session && session.user) {
                window.location.replace('./index.html');
            }
        },

        async requestOtp() {
            if (!this.email) return;

            this.loading = true;
            try {
                // We use standard signInWithOtp. It sends both Magic Link & OTP by default.
                const { error } = await AuthService.signInWithOtp(this.email);
                if (error) throw error;

                this.showToast("📧 Code envoyé ! Vérifiez votre boîte mail.", "success");
                this.step = 2; // Move to step 2
                
                // Focus on the OTP input after DOM upate
                setTimeout(() => {
                    const otpInput = document.getElementById('otp');
                    if (otpInput) otpInput.focus();
                }, 100);

            } catch (error) {
                console.error("Error requesting OTP:", error);
                this.showToast("❌ Erreur : " + error.message, "error");
            } finally {
                this.loading = false;
            }
        },

        async verifyOtp() {
            if (!this.email || !this.otpCode || this.otpCode.length !== 6) {
                this.showToast("❌ Veuillez entrer un code à 6 chiffres.", "error");
                return;
            }

            this.loading = true;
            try {
                const { data, error } = await AuthService.verifyOtp(this.email, this.otpCode);
                
                if (error) throw error;
                
                if (data && data.session) {
                    this.showToast("✅ Connexion réussie !", "success");
                    // Redirect to home page immediately to prevent Safari from blocking it
                    window.location.replace('./index.html');
                } else {
                    throw new Error("Code invalide ou expiré.");
                }

            } catch (error) {
                console.error("Error verifying OTP:", error);
                // Convert common errors to french
                let msg = error.message;
                if (msg.includes("Token has expired or is invalid")) {
                    msg = "Code invalide ou expiré. Veuillez vérifier ou demander un nouveau code.";
                }
                this.showToast("❌ Erreur : " + msg, "error");
                this.otpCode = ''; // Reset code input on error
            } finally {
                this.loading = false;
            }
        },

        /**
         * Displays a toast notification.
         */
        showToast(message, type = "success") {
            const id = Date.now() + Math.random().toString(36).substr(2, 9);
            // @ts-ignore
            this.toasts.push({ id, message, type });

            setTimeout(() => {
                // @ts-ignore
                this.toasts = this.toasts.filter((t) => t.id !== id);
            }, 5000);
        }
    }));
}

// Initialize Alpine component
setupLoginCodeApp();

// Start Alpine
Alpine.start();
