import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/reservoir": {
        target: "http://localhost:8888/.netlify/functions/reservoir",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/reservoir/, ""),
      },
    },
  },
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
  },
});
