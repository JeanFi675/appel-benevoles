// vite.config.js
import { defineConfig } from "file:///C:/Users/jpduheron/Annonceurs/appel-benevoles/node_modules/vite/dist/node/index.js";
import { createHtmlPlugin } from "file:///C:/Users/jpduheron/Annonceurs/appel-benevoles/node_modules/vite-plugin-html/dist/index.mjs";
import { resolve } from "path";
var __vite_injected_original_dirname = "C:\\Users\\jpduheron\\Annonceurs\\appel-benevoles";
var vite_config_default = defineConfig({
  base: "./",
  // Ensures relative paths for GitHub Pages
  plugins: [
    createHtmlPlugin({
      minify: true,
      pages: [
        {
          entry: "src/js/main.js",
          filename: "index.html",
          template: "index.html",
          injectOptions: {
            data: {
              title: "B\xE9n\xE9voles Escalade"
            },
            ejsOptions: {
              root: resolve(__vite_injected_original_dirname)
            }
          }
        },
        {
          entry: "src/js/admin.js",
          filename: "admin.html",
          template: "admin.html",
          injectOptions: {
            data: {
              title: "Administration - B\xE9n\xE9voles Escalade"
            },
            ejsOptions: {
              root: resolve(__vite_injected_original_dirname)
            }
          }
        }
      ]
    })
  ],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      input: {
        main: resolve(__vite_injected_original_dirname, "index.html"),
        admin: resolve(__vite_injected_original_dirname, "admin.html")
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxqcGR1aGVyb25cXFxcQW5ub25jZXVyc1xcXFxhcHBlbC1iZW5ldm9sZXNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGpwZHVoZXJvblxcXFxBbm5vbmNldXJzXFxcXGFwcGVsLWJlbmV2b2xlc1xcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvanBkdWhlcm9uL0Fubm9uY2V1cnMvYXBwZWwtYmVuZXZvbGVzL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHsgY3JlYXRlSHRtbFBsdWdpbiB9IGZyb20gJ3ZpdGUtcGx1Z2luLWh0bWwnXHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJ1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBiYXNlOiAnLi8nLCAvLyBFbnN1cmVzIHJlbGF0aXZlIHBhdGhzIGZvciBHaXRIdWIgUGFnZXNcclxuICBwbHVnaW5zOiBbXHJcbiAgICBjcmVhdGVIdG1sUGx1Z2luKHtcclxuICAgICAgbWluaWZ5OiB0cnVlLFxyXG4gICAgICBwYWdlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGVudHJ5OiAnc3JjL2pzL21haW4uanMnLFxyXG4gICAgICAgICAgZmlsZW5hbWU6ICdpbmRleC5odG1sJyxcclxuICAgICAgICAgIHRlbXBsYXRlOiAnaW5kZXguaHRtbCcsXHJcbiAgICAgICAgICBpbmplY3RPcHRpb25zOiB7XHJcbiAgICAgICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgICAgICB0aXRsZTogJ0JcdTAwRTluXHUwMEU5dm9sZXMgRXNjYWxhZGUnLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBlanNPcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgcm9vdDogcmVzb2x2ZShfX2Rpcm5hbWUpLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgZW50cnk6ICdzcmMvanMvYWRtaW4uanMnLFxyXG4gICAgICAgICAgZmlsZW5hbWU6ICdhZG1pbi5odG1sJyxcclxuICAgICAgICAgIHRlbXBsYXRlOiAnYWRtaW4uaHRtbCcsXHJcbiAgICAgICAgICBpbmplY3RPcHRpb25zOiB7XHJcbiAgICAgICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgICAgICB0aXRsZTogJ0FkbWluaXN0cmF0aW9uIC0gQlx1MDBFOW5cdTAwRTl2b2xlcyBFc2NhbGFkZScsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGVqc09wdGlvbnM6IHtcclxuICAgICAgICAgICAgICByb290OiByZXNvbHZlKF9fZGlybmFtZSksXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pLFxyXG4gIF0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogJ2Rpc3QnLFxyXG4gICAgYXNzZXRzRGlyOiAnYXNzZXRzJyxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgaW5wdXQ6IHtcclxuICAgICAgICBtYWluOiByZXNvbHZlKF9fZGlybmFtZSwgJ2luZGV4Lmh0bWwnKSxcclxuICAgICAgICBhZG1pbjogcmVzb2x2ZShfX2Rpcm5hbWUsICdhZG1pbi5odG1sJyksXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH1cclxufSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFtVSxTQUFTLG9CQUFvQjtBQUNoVyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFGeEIsSUFBTSxtQ0FBbUM7QUFJekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsTUFBTTtBQUFBO0FBQUEsRUFDTixTQUFTO0FBQUEsSUFDUCxpQkFBaUI7QUFBQSxNQUNmLFFBQVE7QUFBQSxNQUNSLE9BQU87QUFBQSxRQUNMO0FBQUEsVUFDRSxPQUFPO0FBQUEsVUFDUCxVQUFVO0FBQUEsVUFDVixVQUFVO0FBQUEsVUFDVixlQUFlO0FBQUEsWUFDYixNQUFNO0FBQUEsY0FDSixPQUFPO0FBQUEsWUFDVDtBQUFBLFlBQ0EsWUFBWTtBQUFBLGNBQ1YsTUFBTSxRQUFRLGdDQUFTO0FBQUEsWUFDekI7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLFFBQ0E7QUFBQSxVQUNFLE9BQU87QUFBQSxVQUNQLFVBQVU7QUFBQSxVQUNWLFVBQVU7QUFBQSxVQUNWLGVBQWU7QUFBQSxZQUNiLE1BQU07QUFBQSxjQUNKLE9BQU87QUFBQSxZQUNUO0FBQUEsWUFDQSxZQUFZO0FBQUEsY0FDVixNQUFNLFFBQVEsZ0NBQVM7QUFBQSxZQUN6QjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLGVBQWU7QUFBQSxNQUNiLE9BQU87QUFBQSxRQUNMLE1BQU0sUUFBUSxrQ0FBVyxZQUFZO0FBQUEsUUFDckMsT0FBTyxRQUFRLGtDQUFXLFlBQVk7QUFBQSxNQUN4QztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
