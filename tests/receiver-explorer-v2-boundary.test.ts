import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../components/receiver-coverage-page.tsx", import.meta.url), "utf8");
const polarSource = readFileSync(new URL("../components/receiver-range-polar.tsx", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../lib/server/statistics-coverage-intelligence.ts", import.meta.url), "utf8");

describe("Receiver Explorer V2 boundary", () => {
  it("reuses existing receiver data lanes without a new backend endpoint", () => {
    expect(pageSource).toContain('fetch(`/api/statistics/coverage-intelligence?range=${range}`');
    expect(pageSource).toContain('fetch(`/api/receiver/coverage?period=${capturePeriod}`');
    expect(pageSource).toContain('new EventSource("/api/stream?coverage=local")');
    expect(pageSource.match(/fetch\(/g)).toHaveLength(2);
    expect(pageSource).not.toContain("/api/receiver/explorer");
    expect(serverSource).not.toContain("schema.FlightPosition");\n    expect(serverSource).not.toContain(".FlightPosition.where(");
  });

  it("exposes the requested Explorer V2 product sections", () => {
    for (const testId of [
      "receiver-explorer-v2",
      "receiver-explorer-range-polar",
      "receiver-explorer-source-mix",
      "receiver-explorer-weak-sectors",
      "receiver-explorer-altitude",
      "receiver-explorer-trend",
      "receiver-explorer-records",
      "receiver-explorer-reference-capture",
    ]) {
      expect(pageSource).toContain('data-testid="' + testId + '"');
    }
  });

  it("keeps source mix explicitly live-only and range analytics historical", () => {
    expect(pageSource).toContain('aircraft.source === "ADS-B"');
    expect(pageSource).toContain('aircraft.source === "MLAT"');
    expect(pageSource).toContain("Current local receiver snapshot only");
    expect(pageSource).toContain('const historyRanges: CoverageIntelligenceRange[] = ["7d", "30d"]');
  });

  it("reuses shared polar geometry for median, P95 and maximum range", () => {
    expect(polarSource).toContain('import { polarPoint } from "@/lib/receiver-coverage-polar"');
    expect(polarSource).toContain("medianDailyMaxDistanceKm");
    expect(polarSource).toContain("p95DailyMaxDistanceKm");
    expect(polarSource).toContain("maxDistanceKm");
    expect(polarSource).not.toContain("fetch(");
  });
});
