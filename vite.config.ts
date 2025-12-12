import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [TanStackRouterVite(), viteReact()],
  resolve: {
    alias: {
      "~": __dirname,
      "@": path.resolve(__dirname, "./src"),
      "@cvx": path.resolve(__dirname, "./convex"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // React core
            if (id.includes("react-dom") || id.includes("/react/")) {
              return "vendor-react";
            }
            // TanStack libraries
            if (id.includes("@tanstack")) {
              return "vendor-tanstack";
            }
            // Convex
            if (id.includes("convex")) {
              return "vendor-convex";
            }
            // Radix UI
            if (id.includes("@radix-ui")) {
              return "vendor-radix";
            }
            // Lucide icons
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
          }
        },
      },
    },
  },
});
