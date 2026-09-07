import type {
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
  };
}
