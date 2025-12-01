import { supabase } from '../config.js';

/**
 * Generic service for database operations.
 * @namespace ApiService
 */
export const ApiService = {
    /**
     * Fetches data from a table with optional filtering and ordering.
     * @param {string} table - The table name.
     * @param {object} [options] - Query options.
     * @param {string} [options.select='*'] - Columns to select.
     * @param {object} [options.eq] - Equality filter { column: value }.
     * @param {object} [options.order] - Ordering { column: 'name', ascending: true }.
     * @returns {Promise<{ data: any[], error: object|null }>} The query result.
     */
    async fetch(table, options = {}) {
        let query = supabase.from(table).select(options.select || '*');

        if (options.eq) {
            for (const [key, value] of Object.entries(options.eq)) {
                query = query.eq(key, value);
            }
        }

        if (options.order) {
            query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
        }

        return await query;
    },

    /**
     * Inserts a new record into a table.
     * @param {string} table - The table name.
     * @param {object} data - The data to insert.
     * @returns {Promise<{ data: any, error: object|null }>} The inserted data.
     */
    async insert(table, data) {
        return await supabase.from(table).insert(data).select().single();
    },

    /**
     * Updates an existing record.
     * @param {string} table - The table name.
     * @param {object} data - The data to update.
     * @param {object} match - The condition to match { column: value }.
     * @returns {Promise<{ data: any, error: object|null }>} The updated data.
     */
    async update(table, data, match) {
        let query = supabase.from(table).update(data);

        for (const [key, value] of Object.entries(match)) {
            query = query.eq(key, value);
        }

        return await query.select().single();
    },

    /**
     * Upserts a record (insert or update).
     * @param {string} table - The table name.
     * @param {object} data - The data to upsert.
     * @returns {Promise<{ data: any, error: object|null }>} The upserted data.
     */
    async upsert(table, data) {
        return await supabase.from(table).upsert(data).select().single();
    },

    /**
     * Deletes a record.
     * @param {string} table - The table name.
     * @param {object} match - The condition to match { column: value }.
     * @returns {Promise<{ error: object|null }>} The result.
     */
    async delete(table, match) {
        let query = supabase.from(table).delete();

        for (const [key, value] of Object.entries(match)) {
            query = query.eq(key, value);
        }

        return await query;
    }
};
