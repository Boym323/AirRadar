import type { SourceReliability } from "@/lib/server/source-reliability";
import type { SystemStatus } from "@/lib/server/system-status-contract";

export type OperationalHealthReason = "FEEDS_UNAVAILABLE" | "LOCAL_FEED_STALE" |
  "DATABASE_OFFLINE" | "HISTORY_DEGRADED" | "SSE_CAPACITY_EXHAUSTED";

export interface OperationalHealthV2 {
  version: "operational-health-v2";
  state: "HEALTHY" | "DEGRADED" | "INSUFFICIENT_DATA";
  reasons: OperationalHealthReason[];
  sourceAvailability: SourceReliability["availability"];
  /** Process-lifetime diagnostic counters, not per-minute rates or proven packet loss. */
  stream: {
    activeClients: number;
    capacity: number;
    deniedSinceStart: number;
    coalescedSnapshotsSinceStart: number;
  };
  databaseState: SystemStatus;
  predictiveCapture: "ACTIVE" | "DISABLED" | "UNAVAILABLE";
  deliveryDiagnostics: "SEPARATE_ADMIN_ENDPOINT";
}

export function buildOperationalHealthV2(input: {
  source: SourceReliability;
  activeSseClients: number;
  sseClientLimit: number;
  deniedSse: { global: number; channel: number; client: number };
  coalescedAircraftSnapshots: number;
  databaseStatus: "ok" | "offline" | "disabled";
  historyStatus: SystemStatus;
  predictiveValidation?: { enabled: boolean };
}): OperationalHealthV2 {
  const count = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1_000_000_000, Math.trunc(n))) : 0;
  const reasons: OperationalHealthReason[] = [];
  if (input.source.availability === "NONE") reasons.push("FEEDS_UNAVAILABLE");
  if (input.source.local.state === "STALE") reasons.push("LOCAL_FEED_STALE");
  if (input.databaseStatus === "offline") reasons.push("DATABASE_OFFLINE");
  if (input.historyStatus === "degraded") reasons.push("HISTORY_DEGRADED");
  const active = count(input.activeSseClients);
  const capacity = count(input.sseClientLimit);
  if (capacity > 0 && active >= capacity) reasons.push("SSE_CAPACITY_EXHAUSTED");
  const denied = count(input.deniedSse.global) + count(input.deniedSse.channel) + count(input.deniedSse.client);
  return {
    version: "operational-health-v2",
    state: reasons.length ? "DEGRADED" : input.source.availability === "UNKNOWN" || input.databaseStatus === "disabled" ? "INSUFFICIENT_DATA" : "HEALTHY",
    reasons,
    sourceAvailability: input.source.availability,
    stream: {
      activeClients: active,
      capacity,
      deniedSinceStart: Math.min(1_000_000_000, denied),
      coalescedSnapshotsSinceStart: count(input.coalescedAircraftSnapshots),
    },
    databaseState: input.databaseStatus,
    predictiveCapture: !input.predictiveValidation ? "UNAVAILABLE" : input.predictiveValidation.enabled ? "ACTIVE" : "DISABLED",
    deliveryDiagnostics: "SEPARATE_ADMIN_ENDPOINT",
  };
}
