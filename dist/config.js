/**
 * Configuration Partagée - Système d'Authentification
 *
 * Centralise l'initialisation du client Supabase et la détection d'environnement.
 * Les variables sont définies via window.ENV dans le HTML (injectées par Vite).
 *
 * Sécurité : VITE_SUPABASE_ANON_KEY est safe (protégé par RLS)
 */

// Détection d'environnement
const isDevelopment = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';

// Configuration Supabase (depuis window.ENV injectées par Vite)
const SUPABASE_URL = window.ENV?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = window.ENV?.VITE_SUPABASE_ANON_KEY;

// Validation
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Configuration Supabase manquante. Vérifiez .env');
  console.error('Variables requises : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  console.error('window.ENV:', window.ENV);
}

// Initialisation du client Supabase (via CDN window.supabase)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// URLs d'application pour redirections Magic Link
const APP_URLS = {
  local: window.ENV?.VITE_APP_URL_LOCAL || 'http://localhost:5500',
  production: window.ENV?.VITE_APP_URL_PRODUCTION || window.location.origin
};

// Obtenir l'URL actuelle selon l'environnement
const getAppUrl = () => isDevelopment ? APP_URLS.local : APP_URLS.production;

// Générer l'URL de redirection Magic Link pour une page spécifique
const getMagicLinkRedirectUrl = (page = '') => {
  const baseUrl = getAppUrl();
  return page ? `${baseUrl}/${page}` : window.location.href;
};

// Export vers window pour Alpine.js
window.appConfig = {
  supabase,
  isDevelopment,
  SUPABASE_URL,
  getAppUrl,
  getMagicLinkRedirectUrl
};

console.log(`🔧 Environnement : ${isDevelopment ? 'Development' : 'Production'}`);
console.log(`🌐 App URL : ${getAppUrl()}`);
