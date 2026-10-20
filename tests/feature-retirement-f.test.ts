import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = new URL("../", import.meta.url);
const exists = (path: string) => existsSync(new URL(path, base));

describe("retired Weather Fusion and analytic corridor boundary", () => {
  it("does not retain weather-fusion or model-based meteorological corridor evaluators", () => {
    for (const path of [
      "lib/server/weather-fusion.ts",
      "lib/weather/fusion.ts",
      "lib/weather/corridor-intelligence.ts",
      "app/api/aircraft/[hex]/weather-fusion/route.ts",
      "components/aircraft-weather-fusion.tsx",
    ]) expect(exists(path), path).toBe(false);
    const state = readFileSync(new URL("lib/server/aircraft-state.ts", base), "utf8");
    expect(state).not.toContain("buildWeatherCorridorIntelligence");
    expect(state).not.toContain("buildWeatherFusion");
    expect(state).not.toContain("defaultWindAloftProvider.getWind");
  });

  it("preserves actual weather products, observations, SIGMET and route context", () => {
    for (const path of [
      "lib/server/aviation-weather-provider.ts",
      "lib/server/aircraft-weather.ts",
      "lib/weather/aircraft-sigmet-context.ts",
      "lib/weather/route-weather-context.ts",
      "app/api/weather/airport/route.ts",
      "app/api/weather/sigmet/route.ts",
      "components/airport-weather.tsx",
    ]) expect(exists(path), path).toBe(true);
  });
});
