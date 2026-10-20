import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Aviation Weather Fusion V1 boundaries", () => {
  it("keeps fusion on-demand and outside the ADS-B hot path", async () => {
    const service = await readFile("lib/server/weather-fusion.ts", "utf8");
    const state = await readFile("lib/server/aircraft-state.ts", "utf8");

    expect(service).toContain("Promise.allSettled");
    expect(service).toContain("defaultPirepProvider.getPireps");
    expect(service).toContain("defaultAviationWeatherProvider.getSigmets");
    expect(service).toContain("defaultWindAloftProvider.getWind");
    expect(service).toContain("queryAircraftWeatherObservations");
    expect(existsSync("app/api/aircraft/[hex]/weather-fusion/route.ts")).toBe(false);
    expect(state).not.toContain("weather-fusion");
    expect(state).not.toContain("buildWeatherFusion");
  });

  it("keeps the retired Weather Fusion module isolated from the retained aircraft UI", async () => {
    const detail = await readFile("components/aircraft-detail-v3.tsx", "utf8");
    const cs = await readFile("lib/i18n/cs.ts", "utf8");

    expect(detail).not.toContain("AircraftWeatherFusion");
    expect(existsSync("components/aircraft-weather-fusion.tsx")).toBe(false);
    expect(detail).toContain("<AircraftAdsbTelemetry");
    expect(detail).toContain("<AircraftAltitudeChart");
    expect(cs).toContain("Nejde o certifikovaný meteorologický produkt");
  });
});
