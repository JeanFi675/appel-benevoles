import { createClient } from '@supabase/supabase-js'
/// <reference types="vite/client" />
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

// Re-export for compatibility if needed, but better to import from constants
export { SUPABASE_URL, SUPABASE_ANON_KEY };

// Validation
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Configuration Supabase manquante. Vérifiez .env');
    console.error('Variables requises : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
}

// Initialisation du client Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
    },
});

// 🔒 Singleton de refresh pour éviter les race conditions
// Permet de dédupliquer les appels simultanés au refresh (ex: retour d'onglet + polling + auto-refresh)
let _refreshPromise = null;

export async function safeRefreshSession() {
    if (_refreshPromise) {
        return _refreshPromise;
    }

    _refreshPromise = supabase.auth.refreshSession();
    
    try {
        const result = await _refreshPromise;
        return result;
    } finally {
        _refreshPromise = null;
    }
}

// Détection d'environnement
export const isDevelopment = import.meta.env.DEV;

// URLs d'application pour redirections Magic Link
const APP_URLS = {
    local: import.meta.env.VITE_APP_URL_LOCAL || 'http://localhost:5173', // Vite default port
    production: (import.meta.env.VITE_APP_URL_PRODUCTION || window.location.origin).toLowerCase()
};

// Obtenir l'URL actuelle selon l'environnement
export const getAppUrl = () => isDevelopment ? APP_URLS.local : APP_URLS.production;

// Générer l'URL de redirection Magic Link pour une page spécifique
export const getMagicLinkRedirectUrl = (page = '') => {
    const baseUrl = getAppUrl();
    return page ? `${baseUrl}/${page}` : window.location.href;
};


