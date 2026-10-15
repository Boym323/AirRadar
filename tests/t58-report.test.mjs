import { describe, expect, it } from "vitest";
import { T57_BASELINE, buildT58Comparison, verifyT58Preflight, verifyT58Summary } from "../scripts/t58-report.mjs";

const sample = () => ({
  verdict: "PASS_WITH_LIMITATIONS", commit: "e9a9b835", version: "1.0.455",
  samples: 61, missing: 0, durationSeconds: 3601.2, stableProcessAndCommit: true,
  cpuPercent: { p50: 30.1, p95: 45.5 }, memoryMiB: { rss: { p50: 904 } },
  eventLoopWindowP99Ms: { p95: 120 }, eventLoopWindowMaxMs: { max: 1900 },
  load: { aircraft: { p50: 78 } },
  hotPathsByWindowCpuMs: [{ name: "twin.eventOutcome.local", calls: 920, cpuMs: 60000 }],
  operationalTwinForensics: { enabled: true, cacheHitRate: 0.75,
    pendingPopulation: { p50: 20 } },
});

describe("T58 preflight", () => {
  it("requires operational twin attribution before collecting an hour", () => {
    expect(verifyT58Preflight({ status: "TELEMETRY_READY", commit: "e9a9b835",
      operationalTwinForensicsEnabled: true })).toBe("e9a9b835");
    expect(() => verifyT58Preflight({ status: "TELEMETRY_READY", commit: "e9a9b835",
      operationalTwinForensicsEnabled: false })).toThrow("t58_operational_twin_forensics_disabled");
    expect(() => verifyT58Preflight({ status: "TELEMETRY_READY", commit: "wrong" }))
      .toThrow("t58_preflight_identity_unavailable");
  });
});
describe("T58 published report", () => {
  it("rejects secrets and aircraft identifiers from archive", () => {
    for (const key of ["icaoHex", "lat", "token", "password", "diagnosticsStoreId", "headers"]) {
      expect(() => verifyT58Summary({ ...sample(), extra: { [key]: "PRIVATE" } }))
        .toThrow("t58_archive_sensitive_key");
    }
    expect(() => verifyT58Summary({ ...sample(), commit: "INVALID" }))
      .toThrow("t58_invalid_summary");
  });
  it("compares mean per-call attributed CPU, cache and tails", () => {
    const md = buildT58Comparison(sample(), {
      runUrl: "https://github.com/Boym323/AirRadar/actions/runs/38721671934",
    });
    expect(md).toContain("T58 — production soak vs T57");
    expect(md).toContain("Event Outcome CPU per call (ms)");
    expect(md).toContain("ATC truth-cache hits (%)");
    expect(md).toContain("Observational before/after");
    expect(T57_BASELINE.eventOutcomeCalls).toBe(842);
  });
  it("preserves unavailable observations and non-PASS verdicts", () => {
    const weak = sample(); weak.hotPathsByWindowCpuMs = [];
    weak.operationalTwinForensics = { enabled: false };
    weak.verdict = "INSUFFICIENT_EVIDENCE"; weak.stableProcessAndCommit = false;
    const md = buildT58Comparison(weak);
    expect(md).toContain("N/A");
    expect(md).toContain("INSUFFICIENT_EVIDENCE");
    expect(md).toContain("Process or commit changed");
    expect(md).toContain("forensics were not collected");
  });
  it("rejects untrusted Markdown links", () => {
    expect(() => buildT58Comparison(sample(), {
      runUrl: "https://evil.example/data?token=SECRET",
    })).toThrow("t58_invalid_workflow_url");
  });
});
