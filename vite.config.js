import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5500,
    open: false, // Ne pas ouvrir le navigateur automatiquement sous WSL
    host: true   // Écouter sur toutes les interfaces (important pour WSL)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
