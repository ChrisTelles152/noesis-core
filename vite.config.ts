import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "apps", "web-demo", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      // Package aliases for development
      "@noesis/core": path.resolve(import.meta.dirname, "packages", "core", "src"),
      "@noesis/adapters-attention-web": path.resolve(import.meta.dirname, "packages", "adapters-attention-web", "src"),
      "@noesis/adapters-llm": path.resolve(import.meta.dirname, "packages", "adapters-llm", "src"),
      "@noesis/sdk-web": path.resolve(import.meta.dirname, "packages", "sdk-web", "src"),
    },
  },
  root: path.resolve(import.meta.dirname, "apps", "web-demo"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
