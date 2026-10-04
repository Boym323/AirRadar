import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(new URL("../lib/server/statistics-coverage-intelligence.ts", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../lib/receiver-coverage-intelligence-v2.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/statistics-coverage-intelligence.tsx", import.meta.url), "utf8");

describe("Receiver Coverage Intelligence V2 boundary", () => {
  it("reuses bounded hourly aggregates and never scans FlightPosition", () => {
    expect(serverSource).toContain("ReceiverCoverageHourly");
    expect(serverSource).toContain('dimension: "azimuth"');
    expect(serverSource).toContain('dimension: "overall"');
    expect(serverSource).toContain("8 * 24 * 3_600_000");
    expect(serverSource).not.toContain("schema.FlightPosition");
    expect(serverSource).not.toContain(".FlightPosition.where(");
  });

  it("keeps the V2 health model pure", () => {
    expect(modelSource).toContain("buildReceiverCoverageIntelligenceV2");
    expect(modelSource).toContain("rolling-24h-vs-prior-7d-hourly-capture");
    expect(modelSource).not.toContain("getPrisma");
    expect(modelSource).not.toContain("fetch(");
    expect(modelSource).not.toContain("process.env");
  });

  it("requires corroborated evidence for directional degradation", () => {
    expect(modelSource).toContain("MIN_CURRENT_SECTOR_AVAILABLE");
    expect(modelSource).toContain("MIN_BASELINE_SECTOR_AVAILABLE");
    expect(modelSource).toContain('state = "DEGRADED"');
    expect(modelSource).toContain("relative < 0.75");
  });

  it("renders the V2 panel without introducing another client fetch", () => {
    expect(pageSource).toContain('data-testid="receiver-coverage-intelligence-v2"');
    expect(pageSource).toContain("data.intelligenceV2.hourly");
    expect(pageSource).toContain("data.intelligenceV2.sectors");
    expect(pageSource.match(/fetch\(/g)?.length ?? 0).toBe(1);
  });
});
