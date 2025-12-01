import { defineConfig } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import { resolve } from 'path'

export default defineConfig({
  base: './', // Ensures relative paths for GitHub Pages
  plugins: [
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          title: 'Bénévoles Escalade',
        },
        ejsOptions: {
          root: resolve(__dirname),
        }
      },
    }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
