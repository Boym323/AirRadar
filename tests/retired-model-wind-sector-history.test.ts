import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
const exists = (path: string) => existsSync(new URL("../" + path, import.meta.url));
describe("retired model-wind and ATC-sector history analytics", () => {
  it("does not ship rejected optional models or historical sector boards", () => {
    for (const path of [
      "lib/server/wind-aloft.ts",
      "lib/weather/aircraft-wind-context.ts",
      "lib/atc-sector-history.ts",
      "lib/server/sector-traffic-context.ts",
      "components/operations-dashboard.module.css",
      "components/radar/radar-operations-center.module.css"
]) expect(exists(path), path).toBe(false);
  });
  it("preserves live ATC and actual airport wind products", () => {
    for (const path of [
      "lib/server/atc-sector-service.ts",
      "lib/server/atc-data.ts",
      "lib/airport-runway-wind.ts",
      "lib/server/aircraft-weather.ts",
      "lib/server/aviation-weather-provider.ts",
      "app/api/atc/sectors/route.ts",
      "app/api/weather/airport/route.ts",
    ]) expect(exists(path), path).toBe(true);
  });
});
