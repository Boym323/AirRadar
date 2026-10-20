import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/situation/route.ts", import.meta.url), "utf8");
const corridorSource = readFileSync(new URL("../lib/operational-twin/corridor.ts", import.meta.url), "utf8");
const weatherCorridorSource = readFileSync(new URL("../lib/weather/corridor-intelligence.ts", import.meta.url), "utf8");

describe("Operational Digital Twin V1 boundary", () => {
  it("keeps the 4D horizon bounded and deterministic", () => {
    expect(corridorSource).toContain("OPERATIONAL_TWIN_HORIZON_MINUTES");
    expect(corridorSource).toContain("OPERATIONAL_TWIN_STEP_MINUTES");
    expect(corridorSource).toContain("VERTICAL_RATE_HOLD_MINUTES = 10");
    expect(corridorSource).not.toContain("fetch(");
    expect(corridorSource).not.toContain("process.env");
  });

  it("does not scan flight history or trigger paid on-demand enrichment", () => {
    expect(serverSource).not.toContain("FlightPosition");
    expect(serverSource).not.toContain("getAircraftDetail");
    expect(serverSource).not.toContain("getAircraftQuickDetail");
    expect(serverSource).not.toContain("enrichAircraftDetailView");
    expect(serverSource).not.toContain("getFlightPlanOnDemand");
  });

  it("uses readiness-gated PUBLIC predictive advisories and never admin preview", () => {
    expect(serverSource).toContain("enforcePredictiveReadiness");
    expect(serverSource).toContain("buildPublicEtaAdvisory");
    expect(serverSource).toContain("buildPublicRunwayAdvisory");
    expect(serverSource).toContain("buildPublicTrajectoryAdvisory");
    expect(serverSource).not.toContain("AdminPreview");
  });

  it("uses the plan-only AUP path and existing bounded weather provider", () => {
    expect(serverSource).toContain("getAirspacePlan");
    expect(serverSource).not.toContain("getAirspaceActivity(");
    expect(serverSource).toContain("defaultAviationWeatherProvider.getSigmets");
  });

  it("uses one bounded Weather Corridor enrichment path without client polling", () => {
    expect(serverSource).toContain("defaultPirepProvider.getPireps");
    expect(serverSource).toContain("radiusNm: 300");
    expect(serverSource).not.toContain("defaultWindAloftProvider.getWind");
    expect(serverSource).toContain("buildWeatherCorridorIntelligence");
    expect(weatherCorridorSource).not.toContain("fetch(");
    expect(weatherCorridorSource).not.toContain("process.env");
  });

  it("leaves the temporary public endpoint rate-limited while not shipping the retired client", () => {
    expect(routeSource).toContain('checkPublicRateLimit("aircraft", request)');
    expect(existsSync(new URL("../components/aircraft-operational-twin.tsx", import.meta.url))).toBe(false);
    const detail = readFileSync(new URL("../components/aircraft-detail-v3.tsx", import.meta.url), "utf8");
    expect(detail).not.toContain("AircraftOperationalTwin");
    expect(detail).toContain("<AircraftAltitudeChart");
  });
});
