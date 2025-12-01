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
      inject: {
        data: {
          title: "B\xE9n\xE9voles Escalade"
        },
        ejsOptions: {
          root: resolve(__vite_injected_original_dirname)
        }
      }
    })
  ],
  build: {
    outDir: "dist",
    assetsDir: "assets"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxqcGR1aGVyb25cXFxcQW5ub25jZXVyc1xcXFxhcHBlbC1iZW5ldm9sZXNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGpwZHVoZXJvblxcXFxBbm5vbmNldXJzXFxcXGFwcGVsLWJlbmV2b2xlc1xcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvanBkdWhlcm9uL0Fubm9uY2V1cnMvYXBwZWwtYmVuZXZvbGVzL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHsgY3JlYXRlSHRtbFBsdWdpbiB9IGZyb20gJ3ZpdGUtcGx1Z2luLWh0bWwnXHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJ1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBiYXNlOiAnLi8nLCAvLyBFbnN1cmVzIHJlbGF0aXZlIHBhdGhzIGZvciBHaXRIdWIgUGFnZXNcclxuICBwbHVnaW5zOiBbXHJcbiAgICBjcmVhdGVIdG1sUGx1Z2luKHtcclxuICAgICAgbWluaWZ5OiB0cnVlLFxyXG4gICAgICBpbmplY3Q6IHtcclxuICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICB0aXRsZTogJ0JcdTAwRTluXHUwMEU5dm9sZXMgRXNjYWxhZGUnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZWpzT3B0aW9uczoge1xyXG4gICAgICAgICAgcm9vdDogcmVzb2x2ZShfX2Rpcm5hbWUpLFxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgIH0pLFxyXG4gIF0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogJ2Rpc3QnLFxyXG4gICAgYXNzZXRzRGlyOiAnYXNzZXRzJyxcclxuICB9XHJcbn0pXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBbVUsU0FBUyxvQkFBb0I7QUFDaFcsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBRnhCLElBQU0sbUNBQW1DO0FBSXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQTtBQUFBLEVBQ04sU0FBUztBQUFBLElBQ1AsaUJBQWlCO0FBQUEsTUFDZixRQUFRO0FBQUEsTUFDUixRQUFRO0FBQUEsUUFDTixNQUFNO0FBQUEsVUFDSixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsWUFBWTtBQUFBLFVBQ1YsTUFBTSxRQUFRLGdDQUFTO0FBQUEsUUFDekI7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLEVBQ2I7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
