import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shadowSource = readFileSync(new URL("../lib/operational-twin/wind-timing-shadow.ts", import.meta.url), "utf8");
const corridorSource = readFileSync(new URL("../lib/operational-twin/corridor.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const situationSource = readFileSync(new URL("../lib/operational-twin/index.ts", import.meta.url), "utf8");

describe("Operational Digital Twin Wind Timing Shadow V1 boundary", () => {
  it("remains a pure in-memory projection over existing corridor and Weather Corridor data", () => {
    expect(shadowSource).toContain("buildOperationalTwinWindTimingShadow");
    expect(shadowSource).toContain('mode: "SHADOW"');
    expect(shadowSource).not.toContain("fetch(");
    expect(shadowSource).not.toContain("EventSource");
    expect(shadowSource).not.toContain("getPrisma");
    expect(shadowSource).not.toContain("setInterval");
    expect(shadowSource).not.toContain("setTimeout");
    expect(shadowSource).not.toContain("/api/");
  });

  it("runs only after canonical corridor and Weather Corridor construction", () => {
    const corridorIndex = serverSource.indexOf("buildOperationalTwinCorridor(state, route, now)");
    const weatherIndex = serverSource.indexOf("buildWeatherCorridorIntelligence({");
    const shadowIndex = serverSource.indexOf("buildOperationalTwinWindTimingShadow({");
    expect(corridorIndex).toBeGreaterThanOrEqual(0);
    expect(weatherIndex).toBeGreaterThan(corridorIndex);
    expect(shadowIndex).toBeGreaterThan(weatherIndex);
    expect(serverSource).toContain("observedGroundSpeedKt: state.groundSpeedKt");
  });

  it("does not alter the canonical corridor builder", () => {
    expect(corridorSource).not.toContain("wind-timing-shadow");
    expect(corridorSource).not.toContain("WeatherCorridor");
    expect(corridorSource).not.toContain("headwindKt");
    expect(corridorSource).not.toContain("tailwindKt");
  });

  it("returns the shadow additively in the existing situation response", () => {
    expect(situationSource).toContain("windTimingShadow: input.windTimingShadow");
    expect(serverSource).toContain("windTimingShadow,");
  });
});
