import Alpine from 'alpinejs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

// Isolated Client for Public Page (No Session / No Conflict)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

// Register component directly
console.log('Registering debitApp...');
Alpine.data('debitApp', () => ({
    loading: true,
    error: null,
    benevole: null, 
    currentAmount: '',
    success: false,
    newBalance: null,
    remainderToPay: 0,
    debitedAmount: 0,

    async init() {
        console.log('debitApp init started');
        try {
            // Get ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const benevoleId = urlParams.get('id');
            console.log('Benevole ID:', benevoleId);

            if (!benevoleId) {
                this.error = "Aucun bénévole identifié. Veuillez scanner un QR Code valide.";
                this.loading = false;
                return;
            }

            // Fetch Benevole Public Info with Timeout
            console.log('Calling get_public_benevole_info...');
            const rpcPromise = supabase.rpc('get_public_benevole_info', { target_id: benevoleId });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("RPC Timeout (10s)")), 10000));
            
            const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
            console.log('RPC Response:', { data, error });
            
            if (error) throw error;
            
            // RPC returns set of rows, usually 1
            if (!data || data.length === 0) {
                this.error = "Bénévole introuvable.";
                this.loading = false;
                return;
            }

            const info = data[0];
            this.benevole = {
                id: benevoleId,
                prenom: info.prenom,
                nom: info.nom,
                solde: info.solde
            };
            console.log('Benevole loaded:', this.benevole);
        } catch (e) {
            console.error("Init Error:", e);
            this.error = "Erreur de chargement: " + (e.message || "Inconnue");
        } finally {
            this.loading = false;
            console.log('Loading state set to false');
        }
    },

        // --- Keypad Logic ---
        appendDigit(digit) {
            if (this.currentAmount.includes('.') && this.currentAmount.split('.')[1].length >= 2) return;
            if (this.currentAmount === '' && digit === 0) return;
            this.currentAmount += digit.toString();
        },
        appendDecimal() {
            if (!this.currentAmount.includes('.')) {
                this.currentAmount = this.currentAmount === '' ? '0.' : this.currentAmount + '.';
            }
        },
        clearAmount() {
            this.currentAmount = '';
        },
        isValidAmount() {
            const amount = parseFloat(this.currentAmount);
            return !isNaN(amount) && amount > 0;
        },

        async processPayment() {
            if (!this.isValidAmount()) return;
            
            const amount = parseFloat(this.currentAmount);
            this.loading = true;

            const { data, error } = await supabase.rpc('public_debit_cagnotte', {
                target_benevole_id: this.benevole.id,
                montant_input: amount,
                description_input: 'Debit QR Code Public'
            });

            if (error) {
                alert("Erreur système : " + error.message);
                this.loading = false;
                return;
            }

            // Handle Smart Debit Result
            if (!data.success) {
                alert("Erreur : " + data.message);
                this.loading = false;
                
                // If special refusal (already negative), maybe clear or reset?
                // For now alert is enough as per requirement "no debit if negative"
                return;
            }

            // Success (Full or Partial)
            this.success = true;
            this.debitedAmount = data.debited_amount;
            this.newBalance = data.new_balance;
            this.remainderToPay = data.remainder_to_pay; // If > 0, partial payment
            this.loading = false;
        },

        formatMoney(val) {
            return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val);
        }
}));

window.Alpine = Alpine;
console.log('Starting Alpine...');
window.supabase = supabase; // Verify this points to local const
Alpine.start();
