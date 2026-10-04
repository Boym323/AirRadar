import { describe, expect, it } from "vitest";
import { buildReceiverCoverageIntelligenceV2, type ReceiverCoverageHourlyEvidenceRow } from "@/lib/receiver-coverage-intelligence-v2";

const now = new Date("2026-10-04T20:00:00.000Z");

function row(hour: string, bucketKey: string, available: number, captured: number): ReceiverCoverageHourlyEvidenceRow {
  return { hour, dimension: bucketKey === "overall" ? "overall" : "azimuth", bucketKey, availableCount: available, capturedCount: captured };
}

function hours(fromMs: number, count: number, captureRatio: number, sectors = 36): ReceiverCoverageHourlyEvidenceRow[] {
  const rows: ReceiverCoverageHourlyEvidenceRow[] = [];
  for (let h = 0; h < count; h += 1) {
    const at = new Date(fromMs + h * 3_600_000).toISOString();
    rows.push(row(at, "overall", 100, Math.round(100 * captureRatio)));
    for (let sector = 0; sector < sectors; sector += 1) rows.push(row(at, `azimuth:${sector}`, 10, Math.round(10 * captureRatio)));
  }
  return rows;
}

describe("Receiver Coverage Intelligence V2", () => {
  it("compares rolling 24h with the previous seven-day baseline", () => {
    const currentFrom = now.getTime() - 24 * 3_600_000;
    const baselineFrom = currentFrom - 7 * 24 * 3_600_000;
    const result = buildReceiverCoverageIntelligenceV2({
      now,
      rows: [...hours(baselineFrom, 7 * 24, 0.80), ...hours(currentFrom, 24, 0.79)],
    });
    expect(result.health.state).toBe("GOOD");
    expect(result.health.currentRatio).toBeCloseTo(0.79, 2);
    expect(result.health.baselineRatio).toBeCloseTo(0.80, 2);
    expect(result.health.evaluatedSectors).toBe(36);
    expect(result.hourly).toHaveLength(24);
  });

  it("identifies directional degradation independently from the overall ratio", () => {
    const currentFrom = now.getTime() - 24 * 3_600_000;
    const baselineFrom = currentFrom - 7 * 24 * 3_600_000;
    const rows = [...hours(baselineFrom, 7 * 24, 0.85), ...hours(currentFrom, 24, 0.84)];
    for (const item of rows) {
      const at = Date.parse(item.hour);
      if (at >= currentFrom && ["azimuth:8", "azimuth:9", "azimuth:10"].includes(item.bucketKey)) {
        item.capturedCount = 4;
      }
    }
    const result = buildReceiverCoverageIntelligenceV2({ now, rows });
    expect(result.health.state).toBe("DEGRADED");
    expect(result.health.degradedSectors).toBe(3);
    expect(result.health.reasons).toContain("coverage_v2.sector_degradation");
    expect(result.sectors.slice(8, 11).every((sector) => sector.state === "DEGRADED")).toBe(true);
  });

  it("reports RECOVERING when the last six hours improve materially", () => {
    const currentFrom = now.getTime() - 24 * 3_600_000;
    const baselineFrom = currentFrom - 7 * 24 * 3_600_000;
    const rows = [...hours(baselineFrom, 7 * 24, 0.90), ...hours(currentFrom, 18, 0.55), ...hours(currentFrom + 18 * 3_600_000, 6, 0.78)];
    const result = buildReceiverCoverageIntelligenceV2({ now, rows });
    expect(result.health.state).toBe("RECOVERING");
    expect(result.health.last6hRatio).toBeGreaterThan(result.health.previous18hRatio!);
    expect(result.health.reasons).toContain("coverage_v2.overall_capture_below_baseline");
  });

  it("fails closed when baseline evidence is sparse", () => {
    const currentFrom = now.getTime() - 24 * 3_600_000;
    const baselineFrom = currentFrom - 7 * 24 * 3_600_000;
    const result = buildReceiverCoverageIntelligenceV2({
      now,
      rows: [...hours(baselineFrom, 3, 0.8, 4), ...hours(currentFrom, 3, 0.8, 4)],
    });
    expect(result.health.state).toBe("INSUFFICIENT_DATA");
    expect(result.health.reasons).toEqual(["coverage_v2.baseline_insufficient"]);
  });

  it("ignores rows outside the eight-day bounded window and malformed sectors", () => {
    const currentFrom = now.getTime() - 24 * 3_600_000;
    const baselineFrom = currentFrom - 7 * 24 * 3_600_000;
    const rows = [...hours(baselineFrom, 7 * 24, 0.8), ...hours(currentFrom, 24, 0.8)];
    rows.push(row(new Date(baselineFrom - 3_600_000).toISOString(), "overall", 1_000_000, 0));
    rows.push(row(new Date(currentFrom).toISOString(), "azimuth:99", 1_000_000, 0));
    const result = buildReceiverCoverageIntelligenceV2({ now, rows });
    expect(result.health.state).toBe("GOOD");
    expect(result.sectors).toHaveLength(36);
  });
});
