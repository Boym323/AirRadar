import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(new URL("../lib/server/statistics-coverage-intelligence.ts", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../lib/receiver-coverage-intelligence-v1.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/statistics-coverage-intelligence.tsx", import.meta.url), "utf8");

describe("Receiver Coverage Intelligence V1 boundary", () => {
  it("keeps the coverage intelligence read bounded and off FlightPosition", () => {
    expect(serverSource).not.toContain("schema.FlightPosition");
    expect(serverSource).not.toContain(".FlightPosition.where(");
    expect(serverSource).toContain("ReceiverDailyCoverage");
    expect(serverSource).toContain("ReceiverDailyStats");
    expect(serverSource).toContain("COVERAGE_INTELLIGENCE_FLIGHT_LIMIT");
  });

  it("keeps health evaluation pure and independent from external providers", () => {
    expect(modelSource).toContain("buildReceiverCoverageIntelligenceV1");
    expect(modelSource).not.toContain("fetch(");
    expect(modelSource).not.toContain("getPrisma");
    expect(modelSource).not.toContain("process.env");
  });

  it("does not mark traffic volume alone as degraded receiver coverage", () => {
    expect(modelSource).toContain("corroboratedDrop");
    expect(modelSource).toContain("coverage.unique_aircraft_below_baseline");
  });

  it("renders the V1 trend in the existing coverage intelligence page", () => {
    expect(pageSource).toContain('data-testid="receiver-coverage-intelligence-v1"');
    expect(pageSource).toContain("data.intelligence.trend.recentDays");
    expect(pageSource).toContain("data.intelligence.health.reasons");
    expect(pageSource).toContain("healthReasonLabel");
  });
});
