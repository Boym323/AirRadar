import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const twinSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const corridorSource = readFileSync(new URL("../lib/weather/corridor-intelligence.ts", import.meta.url), "utf8");
const fusionSource = readFileSync(new URL("../lib/server/weather-fusion.ts", import.meta.url), "utf8");
const aircraftStateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");

describe("retired Operational Twin model-wind lane", () => {
  it("does not fetch model wind or alter event timing in the Twin", () => {
    expect(twinSource).not.toContain("defaultWindAloftProvider");
    expect(twinSource).not.toContain("windTimingShadow");
    expect(twinSource).not.toContain("windTimingPromotion");
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
