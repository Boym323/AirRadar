import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hook = readFileSync(new URL("../components/radar/use-radar-aircraft-context.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

describe("selected aircraft context hook", () => {
  it("keeps the selected-aircraft ATC context lifecycle while retiring intelligence and route-weather polling", () => {
    expect(hook).toContain("/context");
    expect(hook).toContain("30_000");
    expect(hook).toContain("controller?.abort()");
    for (const retired of ["/api/intelligence/events", "/route-weather"]) {
      expect(hook).not.toContain(retired);
    }
    expect(hook).not.toContain("setIntelligenceEvents");
    expect(hook).not.toContain("setRouteWeather");
    expect(app).toContain("useRadarAircraftContext({ aircraftHex: contextAircraftHex, hasPosition: contextHasPosition })");
  });

  it("retains the existing operational-twin context temporarily pending the dedicated map dependency removal", () => {
    expect(hook).toContain("/situation");
    expect(hook).toContain("60_000");
  });
});
