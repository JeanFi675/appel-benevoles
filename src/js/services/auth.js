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
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
                console.error('❌ AuthService.getSession error:', error);
                return { session: null, user: null };
            }
            return {
                session: data?.session || null,
                user: data?.session?.user || null
            };
        } catch (err) {
            console.error('❌ AuthService.getSession exception:', err);
            return { session: null, user: null };
        }
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
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });
    },

    /**
     * Signs in a user with an email and password.
     * @param {string} email - The user's email address.
     * @param {string} password - The user's password.
     * @returns {Promise<{ data: object|null, error: object|null }>}
     */
    async signInWithPassword(email, password) {
        return await supabase.auth.signInWithPassword({
            email,
            password
        });
    },

    /**
     * Sends a password reset email.
     * @param {string} email - The user's email address.
     * @returns {Promise<{ error: object|null }>}
     */
    async resetPasswordForEmail(email) {
        return await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname + "?type=recovery"
        });
    },

    /**
     * Updates the user's password. Requires an active session (e.g., from recovery link).
     * @param {string} newPassword - The new password.
     * @returns {Promise<{ error: object|null }>}
     */
    async updateUserPassword(newPassword) {
        return await supabase.auth.updateUser({
            password: newPassword
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
