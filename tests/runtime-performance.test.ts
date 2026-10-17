import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimePerformanceDiagnostics,
  measureRuntime,
  measureRuntimeAsync,
  resetRuntimePerformanceDiagnosticsForTests,
} from "@/lib/server/runtime-performance";

describe("runtime performance diagnostics", () => {
  beforeEach(() => {
    resetRuntimePerformanceDiagnosticsForTests();
  });

  it("computes bounded window percentiles on read, not per hot-path call", () => {
    for (let i = 0; i < 10_000; i += 1) {
      measureRuntime("snapshot.trail-update", 1, () => i);
    }
    const entry = getRuntimePerformanceDiagnostics()["snapshot.trail-update"];
    expect(entry.calls).toBe(10_000);
    expect(entry.samplesMs).toHaveLength(128);
    expect(entry.windows).toHaveLength(1);
    expect(entry.windows[0]?.samplesMs.length).toBeLessThanOrEqual(64);
    expect(entry.windows[0]?.p99Ms).toBeGreaterThanOrEqual(entry.windows[0]?.p95Ms ?? 0);
    expect(entry.cpuAttribution).toBe("inclusive-process-overlap");
  });

  it("reuses the minute boundary until rollover without exposing internal state", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-16T10:00:59.900Z"));
      for (let index = 0; index < 1_000; index += 1) {
        measureRuntime("snapshot.trail-update", 1, () => index);
      }
      let entry = getRuntimePerformanceDiagnostics()["snapshot.trail-update"];
      expect(entry.windows.map((window) => window.from)).toEqual(["2026-10-16T10:00:00.000Z"]);
      expect(entry.windows[0]?.calls).toBe(1_000);

      vi.setSystemTime(new Date("2026-10-16T10:01:00.000Z"));
      measureRuntime("snapshot.trail-update", 1, () => 1);
      entry = getRuntimePerformanceDiagnostics()["snapshot.trail-update"];
      expect(entry.windows.map((window) => window.from)).toEqual([
        "2026-10-16T10:00:00.000Z",
        "2026-10-16T10:01:00.000Z",
      ]);
      expect(entry.windows.map((window) => window.calls)).toEqual([1_000, 1]);
      expect(entry).not.toHaveProperty("windowStartMs");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports overlapping async operations without claiming exclusive process CPU", async () => {
    const resolve: Array<() => void> = [];
    const suspended = () => new Promise<void>((done) => resolve.push(done));
    const first = measureRuntimeAsync("network.metadata", 1, suspended);
    const second = measureRuntimeAsync("network.metadata", 1, suspended);
    let running = getRuntimePerformanceDiagnostics()["network.metadata"];
    expect(running.activeAsync).toBe(2);
    expect(running.maxConcurrentAsync).toBe(2);
    resolve[0]?.();
    await first;
    running = getRuntimePerformanceDiagnostics()["network.metadata"];
    expect(running.activeAsync).toBe(1);
    resolve[1]?.();
    await second;
    running = getRuntimePerformanceDiagnostics()["network.metadata"];
    expect(running.activeAsync).toBe(0);
    expect(running.maxConcurrentAsync).toBe(2);
    expect(running.calls).toBe(2);
    expect(running.cpuAttribution).toBe("inclusive-process-overlap");
  });

  it("keeps the sample window bounded without leaking ring-buffer internals", () => {
    for (let index = 0; index < 160; index += 1) {
      measureRuntime("test.metric", 2, () => index);
    }

    const metric = getRuntimePerformanceDiagnostics()["test.metric"];
    expect(metric).toBeDefined();
    if (!metric) throw new Error("missing runtime performance metric");
    expect(metric.calls).toBe(160);
    expect(metric.processedAircraft).toBe(320);
    expect(metric.samplesMs).toHaveLength(128);
    expect(metric).not.toHaveProperty("sampleCursor");
    expect(metric.p50Ms).toBeGreaterThanOrEqual(0);
    expect(metric.p95Ms).toBeGreaterThanOrEqual(metric.p50Ms);
    expect(metric.p99Ms).toBeGreaterThanOrEqual(metric.p95Ms);
  });

  it("counts results with the supplied allowlisted counter and never stores result data", () => {
    const payload = { aircraft: [{ hex: "ABCDEF", flight: "PRIVATE123", lat: 50.1 }] };
    const countAircraft = (result: typeof payload | undefined) => result?.aircraft.length ?? 0;
    expect(measureRuntime("network.readsb-json-parse", countAircraft, () => payload)).toBe(payload);
    const output = JSON.stringify(getRuntimePerformanceDiagnostics());
    expect(output).toContain("network.readsb-json-parse");
    expect(output).not.toContain("ABCDEF");
    expect(output).not.toContain("PRIVATE123");
    expect(output).not.toContain("50.1");
    expect(getRuntimePerformanceDiagnostics()["network.readsb-json-parse"]?.processedAircraft).toBe(1);
  });
});
