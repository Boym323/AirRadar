import type {
  AircraftView,
  AircraftMetadata,
  PublicReceiverPosition,
  PublicStateSnapshot,
  ReceiverPosition,
  StateSnapshot,
  PublicAircraft,
} from "@/lib/aircraft/types";
import { getPublicReceiverPositionMode, type PublicReceiverPositionMode } from "@/lib/server/config";

export type { PublicReceiverPositionMode } from "@/lib/server/config";

export interface PublicAircraftChangeSet {
  changed: AircraftView[];
  removed: string[];
}

const publicSnapshotCache = new WeakMap<StateSnapshot, Map<PublicReceiverPositionMode, PublicStateSnapshot>>();
const publicAircraftFingerprintCache = new WeakMap<PublicStateSnapshot, Map<string, string>>();
const publicAircraftDeltaCache = new WeakMap<PublicStateSnapshot, WeakMap<PublicStateSnapshot, PublicAircraftChangeSet>>();

function publicAircraftFingerprint(aircraft: AircraftView): string {
  return JSON.stringify(aircraft);
}

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

/** Metadata used by the live list/map labels. Provider provenance and detail-only
 * catalog fields stay behind the selected-aircraft API. */
function publicLiveMetadata(metadata: AircraftMetadata): Pick<AircraftMetadata,
  "registration" | "registrationCountry" | "registrationCountryCode" |
  "aircraftType" | "icaoTypeCode" | "aircraftDescription"
> {
  return {
    registration: metadata.registration,
    registrationCountry: metadata.registrationCountry,
    registrationCountryCode: metadata.registrationCountryCode,
    aircraftType: metadata.aircraftType,
    icaoTypeCode: metadata.icaoTypeCode,
    aircraftDescription: metadata.aircraftDescription,
  };
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
      radiusNm: Math.max(0, Math.min(2_000, Math.trunc(network.radiusNm))),
      pollIntervalMs: Math.max(0, Math.min(86_400_000, Math.trunc(network.pollIntervalMs))),
      retryAfterMs: network.retryAfterMs === null ? null : Math.max(0, Math.min(86_400_000, Math.trunc(network.retryAfterMs))),
      ...(network.selectedSource ? { selectedSource: network.selectedSource } : {}),
    },
  };
}

function publicAircraft(item: AircraftView): PublicAircraft {
  const { icaoHex, callsign, registration, aircraftType, aircraftDescription, lat, lon,
    altitude, baroAltitude, geomAltitude, groundSpeed, track, verticalRate, baroRate,
    geomRate, squawk, category, emergency, rssi, messages, seenSeconds, seenPosSeconds,
    lastSeen, source, origin, provenance, sourceType, onGround, distanceKm, bearing, trail,
    enrichment } = item;
  const route = enrichment?.route;
  const metadata = enrichment?.metadata;
  return {
    icaoHex, callsign, registration, aircraftType, aircraftDescription, lat, lon,
    altitude, baroAltitude, geomAltitude, groundSpeed, track, verticalRate, baroRate,
    geomRate, squawk, category, emergency, rssi, messages, seenSeconds, seenPosSeconds,
    lastSeen, source, ...(origin === undefined ? {} : { origin }),
    ...(provenance === undefined ? {} : { provenance }), sourceType, onGround,
    distanceKm, bearing, ...(trail === undefined ? {} : { trail }),
    ...((metadata || route) ? { enrichment: {
      ...(metadata ? { metadata: publicLiveMetadata(metadata) } : {}),
      ...(route ? { route: { callsign: route.callsign, airline: route.airline, airlineIcao: route.airlineIcao,
        airlineIata: route.airlineIata, origin: route.origin, destination: route.destination,
        originAirport: route.originAirport, destinationAirport: route.destinationAirport } } : {}),
    } } : {}),
  };
}

function publicAircraftFingerprints(snapshot: PublicStateSnapshot): Map<string, string> {
  const cached = publicAircraftFingerprintCache.get(snapshot);
  if (cached) return cached;
  const fingerprints = new Map<string, string>();
  for (const aircraft of snapshot.aircraft) fingerprints.set(aircraft.icaoHex, publicAircraftFingerprint(aircraft));
  publicAircraftFingerprintCache.set(snapshot, fingerprints);
  return fingerprints;
}

/**
 * Computes a public delta once per snapshot pair. SSE clients share the
 * public snapshot object produced for a state generation, so the expensive
 * fingerprint work is no longer repeated for every connection.
 */
export function getPublicAircraftChangeSet(
  previous: PublicStateSnapshot,
  current: PublicStateSnapshot,
): PublicAircraftChangeSet {
  let byPrevious = publicAircraftDeltaCache.get(current);
  if (!byPrevious) {
    byPrevious = new WeakMap<PublicStateSnapshot, PublicAircraftChangeSet>();
    publicAircraftDeltaCache.set(current, byPrevious);
  }
  const cached = byPrevious.get(previous);
  if (cached) return cached;

  const previousFingerprints = publicAircraftFingerprints(previous);
  const currentFingerprints = publicAircraftFingerprints(current);
  const currentByHex = new Map(current.aircraft.map((aircraft) => [aircraft.icaoHex, aircraft]));
  const changed: AircraftView[] = [];
  for (const aircraft of current.aircraft) {
    if (previousFingerprints.get(aircraft.icaoHex) !== currentFingerprints.get(aircraft.icaoHex)) changed.push(aircraft);
  }
  const removed = [...previousFingerprints.keys()].filter((hex) => !currentByHex.has(hex)).sort();
  const result = { changed, removed };
  byPrevious.set(previous, result);
  return result;
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
  const cached = publicSnapshotCache.get(snapshot)?.get(mode);
  if (cached) return cached;
  const value: PublicStateSnapshot = {
    aircraft: snapshot.aircraft.map(publicAircraft),
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
    sourceStats: snapshot.sourceStats,
    localCoverageRatio: snapshot.localCoverageRatio,
  };
  let byMode = publicSnapshotCache.get(snapshot);
  if (!byMode) {
    byMode = new Map();
    publicSnapshotCache.set(snapshot, byMode);
  }
  byMode.set(mode, value);
  return value;
}

/**
 * The live feed contains fields needed for the map and list, including the
 * public aircraft metadata used to display the type and registration. Flight
 * plans remain available only from the selected-aircraft API.
 */
export function toPublicLiveStateSnapshot(
  snapshot: StateSnapshot,
  mode: PublicReceiverPositionMode = getPublicReceiverPositionMode(),
): PublicStateSnapshot {
  return toPublicStateSnapshot(snapshot, mode);
}
