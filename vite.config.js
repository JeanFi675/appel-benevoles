import { defineConfig } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import { resolve } from 'path'

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
            }
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
            }
          },
        },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  }
})
