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
      "@noesis-edu/core": path.resolve(import.meta.dirname, "packages", "core", "src"),
      "@noesis/adapters-attention-web": path.resolve(import.meta.dirname, "packages", "adapters-attention-web", "src"),
      "@noesis/adapters-llm": path.resolve(import.meta.dirname, "packages", "adapters-llm", "src"),
      "@noesis/sdk-web": path.resolve(import.meta.dirname, "packages", "sdk-web", "src"),
    },
  },
  root: path.resolve(import.meta.dirname, "apps", "web-demo"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // WebGazer includes TensorFlow.js which is inherently large (~1.8MB)
    // We've split it into its own chunk so it only loads when needed
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Skip non-node_modules
          if (!id.includes('node_modules')) {
            return undefined;
          }

          // WebGazer and TensorFlow - very large, load separately
          if (id.includes('webgazer') || id.includes('@tensorflow') || id.includes('tensorflow')) {
            return 'vendor-webgazer';
          }

          // React core - small and frequently used
          if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-'))) {
            return 'vendor-react';
          }

          // Radix UI components
          if (id.includes('@radix-ui')) {
            return 'vendor-radix';
          }

          // Framer Motion - large animation library
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }

          // Recharts - large charting library
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }

          // Form libraries
          if (id.includes('react-hook-form') || id.includes('hookform') || id.includes('zod')) {
            return 'vendor-forms';
          }

          // Icons
          if (id.includes('lucide-react') || id.includes('@fortawesome')) {
            return 'vendor-icons';
          }

          // TanStack Query
          if (id.includes('@tanstack')) {
            return 'vendor-query';
          }

          // Other vendor utilities
          if (id.includes('date-fns') || id.includes('clsx') || id.includes('tailwind-merge')) {
            return 'vendor-utils';
          }

          return undefined;
        },
      },
    },
  },
});
