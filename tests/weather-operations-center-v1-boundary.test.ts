import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/weather/page.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/weather-operations-center.tsx", import.meta.url), "utf8");

describe("Weather Operations Center V1 boundary", () => {
  it("owns /weather as a thin UI over existing weather APIs", () => {
    expect(page).toContain("<WeatherOperationsCenter />");
    for (const endpoint of [
      "/api/weather/metar-map",
      "/api/weather/sigmet",
      "/api/weather/radar/frames",
    ]) {
      expect(center).toContain(endpoint);
    }
    expect(center).not.toContain("getPrisma");
    expect(center).not.toContain("/api/weather/operations");
  });

  it("uses existing bounded products instead of introducing a weather engine", () => {
    expect(center).toContain("Promise.allSettled");
    expect(center).not.toContain("/api/weather/pirep");
  });

  it("surfaces operational summaries for METAR, SIGMET and radar", () => {
    expect(center).toContain("strongWind");
    expect(center).toContain("thunderstormCount");
    expect(center).toContain("latestFrame");
  });
});
