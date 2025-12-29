import Alpine from 'alpinejs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * @typedef {Object} Volunteer
 * @property {string} benevole_id
 * @property {string} prenom
 * @property {string} nom
 * @property {string} taille_tshirt
 * @property {boolean} t_shirt_recupere
 * @property {boolean} has_registrations
 * @property {boolean} [selected]
 */

Alpine.data('tshirtScanner', () => ({
    loading: true,
    error: null,
    /** @type {Volunteer[]} */
    volunteers: [],

    async init() {
        console.log('🏁 Scanner Init Started');
        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get('id');
        console.log('🆔 ID from URL:', id);

        if (!id) {
            this.error = "QR Code invalide (ID manquant).";
            this.loading = false;
            return;
        }

        // Failsafe timeout
        const timeoutId = setTimeout(() => {
            if (this.loading) {
                console.error('⏰ Init timed out');
                this.error = "Délai d'attente dépassé. Vérifiez votre connexion.";
                this.loading = false;
            }
        }, 5000);

        try {
            console.log('📡 Calling get_family_tshirt_info_smart...');
            const { data, error } = await supabase.rpc('get_family_tshirt_info_smart', { scan_id: id });
            console.log('✅ RPC Result:', { data, error });

            if (error) throw error;

            // @ts-ignore
            this.volunteers = (data || []).map(v => ({
                ...v,
                selected: v.has_registrations && !v.t_shirt_recupere // Auto-select if eligible and needed
            }));

            console.log('👥 Volunteers loaded:', this.volunteers.length);

            if (this.volunteers.length === 0) {
                this.error = "Aucun bénévole trouvé pour ce code.";
            }

        } catch (e) {
            console.error('💥 Init Error:', e);
            this.error = "Erreur chargement: " + e.message;
        } finally {
            clearTimeout(timeoutId);
            console.log('🛑 Finally block - setting loading false');
            this.loading = false;
        }
    },

    get anySelected() {
        return this.volunteers.some(v => v.selected && !v.t_shirt_recupere);
    },

    async validateSelected() {
        const toValidate = this.volunteers.filter(v => v.selected && !v.t_shirt_recupere);

        if (toValidate.length === 0) return;

        // Check sizes
        const missingSize = toValidate.find(v => !v.taille_tshirt);
        if (missingSize) {
            alert(`Veuillez sélectionner une taille pour ${missingSize.prenom}.`);
            return;
        }

        const count = toValidate.length;
        const names = toValidate.map(v => v.prenom).join(', ');

        if (!confirm(`Valider le retrait de ${count} T-shirt(s) pour : ${names} ?`)) return;

        this.loading = true;

        try {
            // Process all in parallel
            const promises = toValidate.map(async (v) => {
                const { error } = await supabase.rpc('update_tshirt_status', {
                    target_id: v.benevole_id,
                    new_taille: v.taille_tshirt,
                    mark_collected: true
                });
                if (error) throw error;
                v.t_shirt_recupere = true;
                v.selected = false;
            });

            await Promise.all(promises);
            // Success

        } catch (err) {
            alert("Erreur lors de la validation : " + err.message);
        } finally {
            this.loading = false;
        }
    }
}));

Alpine.start();
