import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const exists = (relative: string) => existsSync(new URL(relative, root));

describe("retired Airport Intelligence analytics boundaries", () => {
  it("does not ship rejected arrival-flow and prediction modules", () => {
    for (const path of [
      "lib/server/airport-movements.ts",
      "lib/server/airport-operations.ts",
      "lib/server/airport-terminal-demand-horizon-v9.ts",
      "lib/airport-intelligence/v3.ts",
      "lib/airport-intelligence/number-stats.ts",
      "components/airport-movement-analytics.tsx",
      "lib/i18n/airport-movement-analytics.ts",
      "scripts/airport-operations-quality.ts",
      "tests/airport-movements.test.ts",
      "tests/airport-movements-query.test.ts",
      "tests/airport-live-board-v6.test.ts",
      "tests/airport-live-board-v7.test.ts",
      "tests/airport-live-board-v9-terminal-demand.test.ts",
      "tests/airport-intelligence-v3.test.ts"
]) {
      expect(exists(path), path).toBe(false);
    }
  });

  it("preserves catalog, runways, METAR and local nearby-aircraft functions", () => {
    for (const path of [
      "app/api/airports/route.ts",
      "app/api/airports/[icao]/route.ts",
      "lib/server/airport-detail.ts",
      "lib/server/airport-infrastructure.ts",
      "lib/server/airport-traffic.ts",
      "lib/airport-traffic/live.ts",
      "components/airport-detail.tsx",
      "components/airport-weather.tsx",
    ]) expect(exists(path), path).toBe(true);
    const details = readFileSync(new URL("components/airport-detail.tsx", root), "utf8");
    expect(details).toContain("AirportWeatherPanel");
    expect(details).toContain("AirportInfrastructureSections");
    expect(details).not.toContain("AirportMovementAnalytics");
  });
});
