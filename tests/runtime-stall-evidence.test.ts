import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeStallEvidence, RuntimeStallEvidenceRecorder,
  startRuntimeStallEvidence, stopRuntimeStallEvidence,
} from "@/lib/server/runtime-stall-evidence";

afterEach(() => {
  stopRuntimeStallEvidence();
  vi.unstubAllEnvs();
});

describe("bounded event-loop stall evidence", () => {
  it("is opt-in and does not start a background timer by default", () => {
    vi.stubEnv("AIRRADAR_STALL_EVIDENCE_ENABLED", "0");
    startRuntimeStallEvidence();
    expect(getRuntimeStallEvidence()).toMatchObject({
      status: "disabled", totalStalls: 0, recentStalls: [],
    });
  });

  it("correlates only sufficiently overlapping, named synchronous scopes", () => {
    const tracker = new RuntimeStallEvidenceRecorder();
    tracker.recordSync("snapshot.operationalTwin", 900, 6_000);
    tracker.recordSync("network.metadata", 5_900, 6_000);
    tracker.recordSync("snapshot.invalid/ABC123", 900, 5_900);
    const stall = tracker.tick(6_000, Date.parse("2026-10-16T12:00:00Z"), 5_000, 4_750);
    expect(stall).toMatchObject({
      overshootMs: 4_000, intervalCpuPercent: 95,
      attribution: "temporal-overlap-only",
      correlatedScope: { name: "snapshot.operationalTwin", overlapMs: 4_000 },
    });
    expect(tracker.snapshot().totalStalls).toBe(1);
  });

  it("does not convert nearby asynchronous work or clock changes into a causal claim", () => {
    const tracker = new RuntimeStallEvidenceRecorder();
    tracker.recordSync("history.persist", 500, 900);
    expect(tracker.tick(4_000, 1_000, 3_000, 5)).toMatchObject({
      attribution: "unattributed", correlatedScope: null, overshootMs: 2_000,
    });
    expect(tracker.tick(4_010, 1_001, 10, 2)).toBeNull();
    expect(tracker.tick(4_020, 1_002, -10, 2)).toBeNull();
    expect(tracker.snapshot().totalStalls).toBe(1);
  });

  it("retains only 24 safe events and returns detached snapshots", () => {
    const tracker = new RuntimeStallEvidenceRecorder();
    for (let n = 0; n < 40; n++) {
      tracker.tick(n * 4_000 + 3_000, 1_800_000_000_000 + n * 4_000, 3_000, null);
    }
    const first = tracker.snapshot();
    expect(first.totalStalls).toBe(40);
    expect(first.recentStalls).toHaveLength(24);
    first.recentStalls[0]!.overshootMs = 999;
    expect(tracker.snapshot().recentStalls[0]!.overshootMs).toBe(2_000);
  });

  it("shares one process observer across startup and route module evaluations", async () => {
    vi.stubEnv("AIRRADAR_STALL_EVIDENCE_ENABLED", "1");
    startRuntimeStallEvidence();
    expect(getRuntimeStallEvidence().status).toBe("enabled");
    vi.resetModules();
    const copy = await import("@/lib/server/runtime-stall-evidence");
    expect(copy.getRuntimeStallEvidence().status).toBe("enabled");
    copy.startRuntimeStallEvidence();
    copy.stopRuntimeStallEvidence();
    expect(getRuntimeStallEvidence().status).toBe("disabled");
  });
});
