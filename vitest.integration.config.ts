import { defineConfig } from "vitest/config";

// These suites cross a process, persistence, filesystem, runtime, or route
// boundary. Keep this list explicit: adding a new integration suite requires
// an intentional classification review instead of silently changing the
// default development scope.
const integrationSuites = [
  "tests/aircraft-photos.test.ts",
  "tests/aircraft-radar-quick-detail.test.ts",
  "tests/airport-movements-query.test.ts",
  "tests/airport-traffic.test.ts",
  "tests/atc-sector-history-streaming.test.ts",
  "tests/global-search.test.ts",
  "tests/history-v2.test.ts",
  "tests/history.test.ts",
  "tests/nearby-airports.test.ts",
  "tests/ogn-softrf.test.ts",
  "tests/production-gates.test.ts",
  "tests/recap.test.ts",
  "tests/receiver-advanced-statistics-db.test.ts",
  "tests/statistics-range.test.ts",
  "tests/system-status.test.ts",
  "tests/update-ogn-softrf.test.ts",
];

export default defineConfig({
  test: {
    environment: "node",
    include: integrationSuites,
    maxWorkers: 4,
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
