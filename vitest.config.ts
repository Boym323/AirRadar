import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Keep SQLite-heavy suites from being starved when CI exposes dozens of CPUs.
    maxWorkers: 4,
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
