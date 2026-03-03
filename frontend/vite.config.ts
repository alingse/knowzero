import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: "dist/stats.html",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/lib": path.resolve(__dirname, "./src/lib"),
      "@/stores": path.resolve(__dirname, "./src/stores"),
      "@/api": path.resolve(__dirname, "./src/api"),
      "@/types": path.resolve(__dirname, "./src/types"),
      "@/utils": path.resolve(__dirname, "./src/utils"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8002",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8002",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split lucide-react into separate chunk
          if (id.includes("lucide-react")) {
            return "lucide-react";
          }
          // Split markdown-related packages
          if (id.includes("react-markdown") || id.includes("remark-gfm") || id.includes("unified") ||
              id.includes("mdast") || id.includes("micromark") || id.includes("hast")) {
            return "markdown";
          }
          // Split TanStack Query
          if (id.includes("@tanstack/react-query")) {
            return "tanstack";
          }
        },
      },
    },
  },
});
