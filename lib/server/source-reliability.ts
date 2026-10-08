import type { NetworkProviderDiagnostics } from "@/lib/aircraft/types";

export type SourceHealth = "HEALTHY" | "STALE" | "UNAVAILABLE" | "DISABLED" | "DEMO" | "UNKNOWN";

export interface SourceReliability {
  version: "source-reliability-v2";
  evaluatedAt: string;
  local: { state: SourceHealth; ageSeconds: number | null };
  network: { state: SourceHealth; ageSeconds: number | null; consecutiveFailures: number };
  /** Observed feed availability, not a claim that a live source switch occurred. */
  availability: "BOTH" | "LOCAL_ONLY" | "NETWORK_ONLY" | "NONE" | "UNKNOWN";
}

function ageSeconds(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || instant > now) return null;
  return Math.floor((now - instant) / 1000);
}

/** Pure, bounded read-only snapshot. Does not poll, reconnect, or change provider affinity. */
export function buildSourceReliability(input: {
  online: boolean;
  sourceStatus: "live" | "demo" | "offline";
  lastSnapshot: string | null;
  network?: NetworkProviderDiagnostics;
  now?: Date;
  localStaleAfterSeconds?: number;
}): SourceReliability {
  const now = input.now ?? new Date();
  const time = now.getTime();
  const localAge = ageSeconds(input.lastSnapshot, time);
  const networkAge = ageSeconds(input.network?.lastSuccessAt, time);
  const localState: SourceHealth = input.sourceStatus === "demo"
    ? "DEMO"
    : !input.online || input.sourceStatus === "offline"
      ? "UNAVAILABLE"
      : localAge === null
        ? "UNKNOWN"
        : localAge > (input.localStaleAfterSeconds ?? 180)
          ? "STALE"
          : "HEALTHY";
  const network = input.network;
  const networkState: SourceHealth = !network?.enabled
    ? "DISABLED"
    : network.status === "online"
      ? networkAge === null
        ? "UNKNOWN"
        : networkAge > Math.max(30, Math.ceil(network.pollIntervalMs / 1000) * 3)
          ? "STALE"
          : "HEALTHY"
      : networkAge === null
        ? "UNAVAILABLE"
        : "STALE";
  const localHealthy = localState === "HEALTHY";
  const networkHealthy = networkState === "HEALTHY";
  const availability = localHealthy && networkHealthy ? "BOTH"
    : localHealthy ? "LOCAL_ONLY"
    : networkHealthy ? "NETWORK_ONLY"
    : localState === "UNKNOWN" || networkState === "UNKNOWN" || localState === "DEMO"
      ? "UNKNOWN"
      : "NONE";
  return {
    version: "source-reliability-v2",
    evaluatedAt: now.toISOString(),
    local: { state: localState, ageSeconds: localAge },
    network: {
      state: networkState,
      ageSeconds: networkAge,
      consecutiveFailures: Number.isFinite(network?.consecutiveFailures)
        ? Math.min(1_000_000, Math.max(0, Math.trunc(network!.consecutiveFailures)))
        : 0,
    },
    availability,
  };
}
