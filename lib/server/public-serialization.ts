import type {
  AircraftView,
  PublicReceiverPosition,
  PublicStateSnapshot,
  ReceiverPosition,
  StateSnapshot,
} from "@/lib/aircraft/types";
import { getPublicReceiverPositionMode, type PublicReceiverPositionMode } from "@/lib/server/config";

export type { PublicReceiverPositionMode } from "@/lib/server/config";

function roundedCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toPublicReceiverPosition(
  receiver: ReceiverPosition,
  mode: PublicReceiverPositionMode = getPublicReceiverPositionMode(),
): PublicReceiverPosition {
  if (mode === "hidden") return { name: receiver.name, lat: null, lon: null };
  if (mode === "exact") return { ...receiver };
  return {
    name: receiver.name,
    lat: roundedCoordinate(receiver.lat),
    lon: roundedCoordinate(receiver.lon),
  };
}

function publicSourceError(online: boolean): string | null {
  return online ? null : "Receiver unavailable";
}

function publicSources(snapshot: StateSnapshot): PublicStateSnapshot["sources"] {
  const network = snapshot.sources?.adsbLol;
  if (!network) return undefined;
  return {
    local: { online: Boolean(snapshot.sources?.local.online) },
    adsbLol: {
      enabled: Boolean(network.enabled),
      status: network.status,
      lastAttemptAt: network.lastAttemptAt,
      lastSuccessAt: network.lastSuccessAt,
      latencyMs: Number.isFinite(network.latencyMs) && (network.latencyMs ?? 0) >= 0 ? network.latencyMs : null,
      consecutiveFailures: Math.max(0, Math.min(1_000_000, Math.trunc(network.consecutiveFailures))),
      aircraftCount: Math.max(0, Math.min(10_000, Math.trunc(network.aircraftCount))),
      positionedAircraftCount: Math.max(0, Math.min(10_000, Math.trunc(network.positionedAircraftCount))),
      mlatAircraftCount: Math.max(0, Math.min(10_000, Math.trunc(network.mlatAircraftCount))),
      radiusNm: Math.max(0, Math.min(250, Math.trunc(network.radiusNm))),
      pollIntervalMs: Math.max(0, Math.min(86_400_000, Math.trunc(network.pollIntervalMs))),
      retryAfterMs: network.retryAfterMs === null ? null : Math.max(0, Math.min(86_400_000, Math.trunc(network.retryAfterMs))),
    },
  };
}

/**
 * Converts the internal state into the only snapshot shape allowed on the
 * public API and SSE wire. Internal coordinates and raw provider errors never
 * cross this boundary.
 */
export function toPublicStateSnapshot(
  snapshot: StateSnapshot,
  mode: PublicReceiverPositionMode = getPublicReceiverPositionMode(),
): PublicStateSnapshot {
  return {
    aircraft: snapshot.aircraft,
    relevantAtcFrequencies: snapshot.relevantAtcFrequencies,
    receiver: toPublicReceiverPosition(snapshot.receiver, mode),
    fetchedAt: snapshot.fetchedAt,
    provider: snapshot.provider,
    sourceOnline: snapshot.sourceOnline,
    sourceError: publicSourceError(snapshot.sourceOnline),
    lastSourceUpdate: snapshot.lastSourceUpdate,
    readsbOnline: snapshot.readsbOnline,
    lastReadsbUpdate: snapshot.lastReadsbUpdate,
    lastError: publicSourceError(snapshot.readsbOnline),
    stats: snapshot.stats,
    sources: publicSources(snapshot),
    coverageStats: snapshot.coverageStats,
  };
}

/**
 * The live feed contains only fields needed for the map and list. Full
 * metadata and flight plans remain available from the selected-aircraft API.
 */
export function toPublicLiveStateSnapshot(
  snapshot: StateSnapshot,
  mode: PublicReceiverPositionMode = getPublicReceiverPositionMode(),
): PublicStateSnapshot {
  const aircraft: AircraftView[] = snapshot.aircraft.map((item) => {
    const route = item.enrichment?.route;
    const liveEnrichment = route ? { route } : undefined;
    return { ...item, enrichment: liveEnrichment };
  });
  return toPublicStateSnapshot({ ...snapshot, aircraft }, mode);
}
