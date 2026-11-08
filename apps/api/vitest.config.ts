import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts", "tests/integration/**/*.integration.spec.ts"],
    setupFiles: ["tests/setup.ts"],
    // Bound concurrent app/DB fixtures; these workflows are not latency benchmarks.
    maxWorkers: 4,
    testTimeout: process.env.TEST_PERSISTENCE_RPC_URL ? 15000 : 5000,
  },
});
