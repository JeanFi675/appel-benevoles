// Force cache invalidation - 2026-05-25T03:04:00
import Alpine from 'alpinejs';
import { initStore } from './modules/store.js';

// Initialize the central store
initStore();

// Start Alpine
Alpine.start();
