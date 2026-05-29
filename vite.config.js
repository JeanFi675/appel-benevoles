import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import { resolve } from 'path';

export default defineConfig({
  base: './', // Ensures relative paths for GitHub Pages
  plugins: [
    createHtmlPlugin({
      minify: true,
      pages: [
        {
          entry: 'src/js/main.js',
          filename: 'index.html',
          template: 'index.html',
          injectOptions: {
            data: {
              title: 'Bénévoles Escalade',
            },
            ejsOptions: {
              root: resolve(__dirname),
            },
          },
        },
        {
          entry: 'src/js/admin.js',
          filename: 'admin.html',
          template: 'admin.html',
          injectOptions: {
            data: {
              title: 'Administration - Bénévoles Escalade',
            },
            ejsOptions: {
              root: resolve(__dirname),
            },
          },
        },
        {
          entry: 'src/js/debit.js',
          filename: 'debit.html',
          template: 'debit.html',
          injectOptions: {
            data: {
              title: 'Paiement - Bénévoles',
            },
            ejsOptions: {
              root: resolve(__dirname),
            },
          },
        },
        {
          entry: 'src/js/scanner-tshirt.js',
          filename: 'scanner-tshirt.html',
          template: 'scanner-tshirt.html',
          injectOptions: {
            data: {
              title: 'Scanner T-Shirt - Bénévoles',
            },
            ejsOptions: {
              root: resolve(__dirname),
            },
          },
        },

        {
          entry: 'src/js/admin-connexions.js',
          filename: 'admin-connexions.html',
          template: 'admin-connexions.html',
          injectOptions: {
            data: {
              title: 'Diagnostic Connexions - Bénévoles Escalade',
            },
            ejsOptions: {
              root: resolve(__dirname),
            },
          },
        },
        {
          entry: 'src/js/besoins.js',
          filename: 'besoins.html',
          template: 'besoins.html',
          injectOptions: {
            data: {
              title: 'Besoins Bénévoles - Escalade',
            },
            ejsOptions: {
              root: resolve(__dirname),
            },
          },
        },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'esbuild',
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        debit: resolve(__dirname, 'debit.html'),
        scanner: resolve(__dirname, 'scanner-tshirt.html'),
        'admin-connexions': resolve(__dirname, 'admin-connexions.html'),
        besoins: resolve(__dirname, 'besoins.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('alpinejs')) return 'vendor-alpine';
            if (id.includes('html5-qrcode') || id.includes('qrcode')) return 'vendor-qrcode';
            return 'vendor';
          }
        },
      },
    },
  },
});
