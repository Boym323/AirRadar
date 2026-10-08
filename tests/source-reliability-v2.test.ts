import { describe, expect, it } from "vitest";
import type { NetworkProviderDiagnostics } from "@/lib/aircraft/types";
import { buildSourceReliability } from "@/lib/server/source-reliability";

const now = new Date("2026-10-08T18:00:00.000Z");
const network = (overrides: Partial<NetworkProviderDiagnostics> = {}): NetworkProviderDiagnostics => ({
  enabled: true,
  status: "online",
  lastAttemptAt: now.toISOString(),
  lastSuccessAt: now.toISOString(),
  latencyMs: 20,
  consecutiveFailures: 0,
  aircraftCount: 10,
  positionedAircraftCount: 10,
  mlatAircraftCount: 0,
  radiusNm: 100,
  pollIntervalMs: 10_000,
  retryAfterMs: null,
  ...overrides,
});

const input = { now, online: true, sourceStatus: "live" as const, lastSnapshot: now.toISOString() };

describe("C1 source availability diagnostics", () => {
  it("distinguishes both, local-only and network-only without claiming a switch", () => {
    expect(buildSourceReliability({ ...input, network: network() }).availability).toBe("BOTH");
    expect(buildSourceReliability({ ...input, network: network({ enabled: false }) }).availability).toBe("LOCAL_ONLY");
    const failedLocal = { ...input, online: false, sourceStatus: "offline" as const };
    expect(buildSourceReliability({ ...failedLocal, network: network() }).availability).toBe("NETWORK_ONLY");
  });

  it("does not call healthy a network feed reporting online with an old success", () => {
    const result = buildSourceReliability({ ...input, network: network({ lastSuccessAt: "2026-10-08T17:55:00.000Z" }) });
    expect(result.network.state).toBe("STALE");
    expect(result.network.ageSeconds).toBe(300);
    expect(result.availability).toBe("LOCAL_ONLY");
  });

  it("handles demo, absent timestamps, future timestamps and disabled feeds conservatively", () => {
    expect(buildSourceReliability({ ...input, sourceStatus: "demo", network: network({ enabled: false }) }).availability).toBe("UNKNOWN");
    expect(buildSourceReliability({ ...input, lastSnapshot: null, network: network({ enabled: false }) }).local.state).toBe("UNKNOWN");
    expect(buildSourceReliability({ ...input, lastSnapshot: "2099-01-01T00:00:00.000Z", network: network({ enabled: false }) }).local.state).toBe("UNKNOWN");
    expect(buildSourceReliability({ ...input, network: network({ enabled: false }) }).network.state).toBe("DISABLED");
  });

  it("keeps consecutive failure diagnostics bounded and never performs source switching", () => {
    const result = buildSourceReliability({ ...input, network: network({ status: "offline", consecutiveFailures: 10_000_000 }) });
    expect(result.network.consecutiveFailures).toBe(1_000_000);
    expect(result.network.state).toBe("STALE");
    expect(result.availability).toBe("LOCAL_ONLY");
  });
});
