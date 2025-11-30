import { defineConfig, loadEnv } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  // Charger les variables d'environnement
  const env = loadEnv(mode, process.cwd(), '')

  return {
    server: {
      port: 5500,
      open: false, // Ne pas ouvrir le navigateur automatiquement sous WSL
      host: true   // Écouter sur toutes les interfaces (important pour WSL)
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html')
        }
      }
    },
    plugins: [
      createHtmlPlugin({
        minify: true,
        inject: {
          data: {
            VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || '',
            VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
            VITE_APP_URL_LOCAL: env.VITE_APP_URL_LOCAL || 'http://localhost:5500',
            VITE_APP_URL_PRODUCTION: env.VITE_APP_URL_PRODUCTION || ''
          }
        }
      })
    ]
  }
})
