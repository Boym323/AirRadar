import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Aviation Weather Fusion V1 boundaries", () => {
  it("keeps fusion on-demand and outside the ADS-B hot path", async () => {
    const service = await readFile("lib/server/weather-fusion.ts", "utf8");
    const state = await readFile("lib/server/aircraft-state.ts", "utf8");
    const route = await readFile("app/api/aircraft/[hex]/weather-fusion/route.ts", "utf8");

    expect(service).toContain("Promise.allSettled");
    expect(service).toContain("defaultPirepProvider.getPireps");
    expect(service).toContain("defaultAviationWeatherProvider.getSigmets");
    expect(service).toContain("defaultWindAloftProvider.getWind");
    expect(service).toContain("queryAircraftWeatherObservations");
    expect(route).toContain('checkPublicRateLimit("weather", request)');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(state).not.toContain("weather-fusion");
    expect(state).not.toContain("buildWeatherFusion");
  });

  it("keeps source evidence visible in the aircraft UI", async () => {
    const component = await readFile("components/aircraft-weather-fusion.tsx", "utf8");
    const detail = await readFile("components/aircraft-detail-v3.tsx", "utf8");
    const cs = await readFile("lib/i18n/cs.ts", "utf8");

    expect(component).toContain("weatherFusionEvidenceTitle");
    expect(component).toContain("weatherFusionSourcesTitle");
    expect(component).toContain("weatherFusionDisclaimer");
    expect(detail).toContain("<AircraftWeatherFusion");
    expect(cs).toContain("Nejde o certifikovaný meteorologický produkt");
  });
});
