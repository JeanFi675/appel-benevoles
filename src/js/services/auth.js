import { supabase } from '../config.js';

/**
 * Service handling authentication operations.
 * @namespace AuthService
 */
export const AuthService = {
    /**
     * Gets the current session from Supabase.
     * @returns {Promise<{ session: object|null, user: object|null }>} The session and user object.
     */
    async getSession() {
        const { data: { session } } = await supabase.auth.getSession();
        return {
            session,
            user: session?.user || null
        };
    },

    /**
     * Subscribes to authentication state changes.
     * @param {function(string, object): void} callback - Function called on state change.
     * @returns {object} The subscription object (call .unsubscribe() to stop).
     */
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    },

    /**
     * Sends a magic link to the specified email.
     * @param {string} email - The user's email address.
     * @returns {Promise<{ error: object|null }>} Result of the operation.
     */
    async signInWithOtp(email) {
        return await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.href
            }
        });
    },

    /**
     * Logs out the current user.
     * @returns {Promise<{ error: object|null }>} Result of the operation.
     */
    async signOut() {
        return await supabase.auth.signOut();
    }
};
