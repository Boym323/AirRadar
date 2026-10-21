import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("T04/W12 retired; R17/T08–T10/W06 retained", () => {
  it("does not present telemetry-inferred ATC controller assignment for a selected aircraft", () => {
    const detail = source("components/aircraft-radar-quick-detail.tsx");
    const context = source("lib/atc-context/engine.ts");
    const app = source("components/airradar-app.tsx");
    expect(detail).not.toContain("aircraft.atc ??");
    expect(detail).not.toContain("assignment?.");
    expect(detail).toContain("context.primaryAirspace");
    expect(detail).toContain("publishedFrequenciesMhz");
    expect(context).toContain("primaryAirspace: matches[0] ?? null");
    expect(app).toContain('map.on("click", "atc-sectors-fill"');
    expect(detail).toContain("t.atc.contextAts");
  });

  it("does not compute weather along the remaining route; retains SIGMET and map products", () => {
    expect(existsSync(join(root, "lib/weather/route-weather-context.ts"))).toBe(false);
    expect(existsSync(join(root, "tests/route-weather-context.test.ts"))).toBe(false);
    const app = source("components/airradar-app.tsx");
    const detail = source("components/aircraft-radar-quick-detail.tsx");
    const loader = source("components/radar/use-radar-weather-context.ts");
    expect(app).not.toContain("buildRouteWeatherContext");
    expect(detail).not.toContain("RouteWeatherSection");
    expect(app).toContain("aircraftSigmetContext(selectedAircraft, sigmetData)");
    expect(loader).toContain('/api/weather/sigmet');
    expect(detail).toContain('data-testid="aircraft-sigmet-context"');
  });
});
