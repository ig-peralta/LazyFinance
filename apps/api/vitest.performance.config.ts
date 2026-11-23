import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Explicit opt-in: never discover load workloads from pnpm test or test:integration.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/performance/**/*.performance.spec.ts"],
    setupFiles: ["tests/setup.ts"],
    maxWorkers: 1,
    testTimeout: 600_000,
    hookTimeout: 30_000,
  },
});
