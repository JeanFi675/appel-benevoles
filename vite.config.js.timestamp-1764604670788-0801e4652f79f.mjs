// vite.config.js
import { defineConfig } from "file:///C:/Users/jpduheron/Annonceurs/appel-benevoles/node_modules/vite/dist/node/index.js";
import { createHtmlPlugin } from "file:///C:/Users/jpduheron/Annonceurs/appel-benevoles/node_modules/vite-plugin-html/dist/index.mjs";
var vite_config_default = defineConfig({
  base: "./",
  // Ensures relative paths for GitHub Pages
  plugins: [
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          title: "B\xE9n\xE9voles Escalade"
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxqcGR1aGVyb25cXFxcQW5ub25jZXVyc1xcXFxhcHBlbC1iZW5ldm9sZXNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXGpwZHVoZXJvblxcXFxBbm5vbmNldXJzXFxcXGFwcGVsLWJlbmV2b2xlc1xcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvanBkdWhlcm9uL0Fubm9uY2V1cnMvYXBwZWwtYmVuZXZvbGVzL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHsgY3JlYXRlSHRtbFBsdWdpbiB9IGZyb20gJ3ZpdGUtcGx1Z2luLWh0bWwnXHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIGJhc2U6ICcuLycsIC8vIEVuc3VyZXMgcmVsYXRpdmUgcGF0aHMgZm9yIEdpdEh1YiBQYWdlc1xyXG4gIHBsdWdpbnM6IFtcclxuICAgIGNyZWF0ZUh0bWxQbHVnaW4oe1xyXG4gICAgICBtaW5pZnk6IHRydWUsXHJcbiAgICAgIGluamVjdDoge1xyXG4gICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgIHRpdGxlOiAnQlx1MDBFOW5cdTAwRTl2b2xlcyBFc2NhbGFkZScsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH0pLFxyXG4gIF0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogJ2Rpc3QnLFxyXG4gICAgYXNzZXRzRGlyOiAnYXNzZXRzJyxcclxuICB9XHJcbn0pXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBbVUsU0FBUyxvQkFBb0I7QUFDaFcsU0FBUyx3QkFBd0I7QUFFakMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsTUFBTTtBQUFBO0FBQUEsRUFDTixTQUFTO0FBQUEsSUFDUCxpQkFBaUI7QUFBQSxNQUNmLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxRQUNOLE1BQU07QUFBQSxVQUNKLE9BQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxFQUNiO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
