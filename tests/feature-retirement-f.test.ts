import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const corridorSource = readFileSync(new URL("../lib/weather/corridor-intelligence.ts", import.meta.url), "utf8");
const fusionSource = readFileSync(new URL("../lib/server/weather-fusion.ts", import.meta.url), "utf8");
const aircraftStateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");

describe("retired Operational Twin model-wind lane", () => {
  it("retires the old situation assembler without restoring rejected wind timing", () => {
    expect(existsSync(new URL("../lib/server/operational-twin.ts", import.meta.url))).toBe(false);
    expect(corridorSource).not.toContain("ICON_EU");
    expect(corridorSource).not.toContain("windSnapshots");
    expect(corridorSource).toContain("buildPirepEvents");
    expect(corridorSource).toContain("buildSigmetEvents");
    expect(aircraftStateSource).not.toContain("buildWeatherCorridorIntelligence");
    expect(aircraftStateSource).not.toContain("defaultWindAloftProvider.getWind");
  });

  it("keeps the shared model-wind provider in independent Weather Fusion", () => {
    expect(fusionSource).toContain("defaultWindAloftProvider.getWind");
    expect(fusionSource).toContain("buildAircraftWindContext");
  });
});
