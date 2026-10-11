import { describe, expect, it } from "vitest";
import { databaseLatencySummary, databaseLatencyWindow } from "@/lib/server/database-latency-statistics";
import type { RuntimeTelemetrySample } from "@/lib/server/runtime-telemetry";

const now = Date.parse("2026-10-11T12:00:00.000Z");
const value = (offsetMinutes: number, databaseLatencyMs: number | null, databaseState: RuntimeTelemetrySample["databaseState"] = "ok") => ({
  recordedAt: new Date(now - offsetMinutes * 60_000).toISOString(),
  databaseState,
  databaseLatencyMs,
});

describe("real runtime DB latency distributions", () => {
  it("uses nearest-rank P50/P95/P99 on measured minute probes, never interpolates", () => {
    const samples = Array.from({ length: 100 }, (_, i) => value(i, i + 1));
    const result = databaseLatencyWindow(samples, 60, now);
    expect(result).toMatchObject({
      sampleCount: 61, failedSampleCount: 0, disabledSampleCount: 0, p50Ms: 31,
      p95Ms: 58, p99Ms: 61, status: "measured", source: "runtime-telemetry-minute-probe",
    });
    expect(result.maxMs).toBe(61);
  });
  it("separates offline and disabled probes from measured latency", () => {
    const s = [value(0, 8), value(1, 300, "offline"), value(2, null, "disabled"), value(3, 4)];
    const result = databaseLatencyWindow(s, 60, now);
    expect(result).toMatchObject({ sampleCount: 2, failedSampleCount: 1, disabledSampleCount: 1, p50Ms: 4, p99Ms: 8, maxMs: 8 });
  });
  it("does not fabricate zero latency when DB is unavailable", () => {
    expect(databaseLatencyWindow([], 60, now)).toMatchObject({ sampleCount: 0, status: "insufficient_data", p50Ms: null, p99Ms: null });
    expect(databaseLatencyWindow([value(0, null, "disabled")], 60, now)).toMatchObject({ sampleCount: 0, status: "disabled", p50Ms: null });
    expect(databaseLatencyWindow([value(0, 19, "offline")], 60, now)).toMatchObject({ sampleCount: 0, failedSampleCount: 1, status: "insufficient_data" });
  });
  it("uses separate 60-minute and 24-hour windows, excluding future/expired samples", () => {
    const s = [value(0, 1), value(61, 100), value(1_300, 1000), value(1_441, 10000), value(-1, 9000)];
    const summary = databaseLatencySummary(s, now);
    expect(summary.lastHour).toMatchObject({ sampleCount: 1, p99Ms: 1 });
    expect(summary.last24Hours).toMatchObject({ sampleCount: 3, p50Ms: 100, p99Ms: 1000 });
    expect(summary.lastHour.lastSampleAt).toBe(new Date(now).toISOString());
  });
});
