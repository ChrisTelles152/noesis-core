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
      "client/src/**/*.test.{ts,tsx}",
      "server/**/*.test.ts",
      "shared/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      include: [
        "client/src/sdk/**/*.ts",
        "client/src/hooks/**/*.ts",
        "client/src/lib/**/*.ts",
        "server/**/*.ts",
        "shared/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/types.ts",
        "server/vite.ts",
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
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
