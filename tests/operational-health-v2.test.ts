import { describe, expect, it } from "vitest";
import { buildOperationalHealthV2 } from "@/lib/server/operational-health-v2";
import type { SourceReliability } from "@/lib/server/source-reliability";
import { toAdminSystemStatus, toPublicSystemStatus } from "@/lib/server/system-status-projection";
import type { SystemStatusResponse } from "@/lib/server/system-status-contract";

const source: SourceReliability = {
  version: "source-reliability-v2", evaluatedAt: "2026-10-08T12:00:00.000Z",
  local: { state: "HEALTHY", ageSeconds: 2 },
  network: { state: "DISABLED", ageSeconds: null, consecutiveFailures: 0 },
  availability: "LOCAL_ONLY",
};
const input = {
  source, activeSseClients: 2, sseClientLimit: 128,
  deniedSse: { global: 0, channel: 0, client: 0 }, coalescedAircraftSnapshots: 0,
  databaseStatus: "ok" as const, historyStatus: "ok" as const,
};

describe("C4 Operational Health V2", () => {
  it("does not degrade healthy LOCAL service when optional NETWORK is disabled", () => {
    const result = buildOperationalHealthV2(input);
    expect(result).toMatchObject({ state: "HEALTHY", reasons: [], sourceAvailability: "LOCAL_ONLY" });
  });

  it("distinguishes unavailable evidence from an actual outage", () => {
    expect(buildOperationalHealthV2({ ...input, source: { ...source, availability: "UNKNOWN" } }).state).toBe("INSUFFICIENT_DATA");
    expect(buildOperationalHealthV2({ ...input, source: { ...source, availability: "NONE" } }).reasons).toContain("FEEDS_UNAVAILABLE");
  });

  it("flags actionable faults, not lifetime coalescing counters", () => {
    const result = buildOperationalHealthV2({
      ...input, source: { ...source, local: { state: "STALE", ageSeconds: 300 } },
      activeSseClients: 128, coalescedAircraftSnapshots: 10_000,
      databaseStatus: "offline", historyStatus: "degraded",
    });
    expect(result.reasons).toEqual(["LOCAL_FEED_STALE", "DATABASE_OFFLINE", "HISTORY_DEGRADED", "SSE_CAPACITY_EXHAUSTED"]);
    expect(result.stream.coalescedSnapshotsSinceStart).toBe(10_000);
  });

  it("keeps operational summary admin-only without a new endpoint", () => {
    const status = {
      receiver: { readsb: { sourceReliability: source } },
      runtime: { activeSseClients: 1, sseClientLimit: 128, sseDenied: input.deniedSse, sseCoalescedAircraftSnapshots: 0 },
      database: { status: "ok", history: { status: "ok" } },
    } as unknown as SystemStatusResponse;
    expect(toAdminSystemStatus(status).operationalHealth?.state).toBe("HEALTHY");
    expect(toPublicSystemStatus(status).operationalHealth).toBeUndefined();
  });
});
