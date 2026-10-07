import { beforeEach, describe, expect, it } from "vitest";
import {
  getRuntimePerformanceDiagnostics,
  measureRuntime,
  resetRuntimePerformanceDiagnosticsForTests,
} from "@/lib/server/runtime-performance";

describe("runtime performance diagnostics", () => {
  beforeEach(() => {
    resetRuntimePerformanceDiagnosticsForTests();
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
});
