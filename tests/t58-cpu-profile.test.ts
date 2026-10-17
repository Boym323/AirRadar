import { describe, expect, it, vi } from "vitest";
import { getT58CpuProfileSummary, startT58CpuProfile, stopT58CpuProfileForTests,
  summarizeT58CpuProfile } from "@/lib/server/t58-cpu-profile";

describe("bounded T58 V8 profile attribution", () => {
  const stall = {
    observedAt: "2026-10-17T12:00:02.000Z", endedMonoMs: 2_000, overshootMs: 1_000,
    cpuPercent: 95, gcPauseMs: 5, gcCount: 2, mainThreadCpuMs: 900,
    schedulerWaitMs: 1, schedulerSwitches: 10,
  };
  it("matches timed samples to a stall and keeps only safe function names", () => {
    const result = summarizeT58CpuProfile({
      startTime: 1_000_000, endTime: 3_000_000,
      nodes: [
        { id: 1, callFrame: { functionName: "(root)", url: "" }, children: [2] },
        { id: 2, callFrame: { functionName: "snapshotLoop", url: "file:///private/path?token=SECRET" }, children: [3] },
        { id: 3, callFrame: { functionName: "decodeFrame",
          url: "file:///var/www/airradar/.next/standalone/.next/server/chunks/lib_07shbkf._.js",
          lineNumber: 12, columnNumber: 34 } },
      ],
      samples: [3, 3, 3], timeDeltas: [500_000, 500_000, 1_100_000],
    }, 0, [stall]);
    expect(result).toMatchObject({ status: "completed", samples: 3, stalls: [{ sampleCount: 1,
      topFrames: [{ frame: "snapshotLoop > decodeFrame", category: "javascript",
        chunk: "lib_07shbkf._.js", line: 12, column: 34, samples: 1 }] }] });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("private/path");
  });

  it("discards oversized profiler responses before iterating samples", () => {
    const result = summarizeT58CpuProfile({ startTime: 0, endTime: 1,
      nodes: [], samples: Array(10_001).fill(1), timeDeltas: Array(10_001).fill(1) }, 0, []);
    expect(result).toMatchObject({ status: "discarded", reason: "profile_bounds_exceeded", stalls: [] });
  });

  it("uses a local inspector session and closes it after a bounded capture", async () => {
    vi.stubEnv("AIRRADAR_T58_CPU_PROFILE_ENABLED", "1");
    try {
      await startT58CpuProfile();
      expect(getT58CpuProfileSummary().status).toBe("running");
      const until = performance.now() + 100;
      while (performance.now() < until) Math.sqrt(12345);
      await stopT58CpuProfileForTests();
      expect(getT58CpuProfileSummary()).toMatchObject({ status: "completed", reason: "test_stop" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
