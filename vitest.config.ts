import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: [
      "apps/web-demo/src/**/*.test.{ts,tsx}",
      "apps/server/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "shared/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: [
        "apps/web-demo/src/sdk/**/*.ts",
        "apps/web-demo/src/hooks/**/*.ts",
        "apps/web-demo/src/lib/**/*.ts",
        "apps/server/**/*.ts",
        "packages/*/src/**/*.ts",
        "shared/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/types.ts",
        "apps/server/vite.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/web-demo/src"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@noesis-edu/core": path.resolve(__dirname, "./packages/core/src"),
      "@noesis/adapters-attention-web": path.resolve(__dirname, "./packages/adapters-attention-web/src"),
      "@noesis/adapters-llm": path.resolve(__dirname, "./packages/adapters-llm/src"),
      "@noesis/sdk-web": path.resolve(__dirname, "./packages/sdk-web/src"),
    },
  },
});
