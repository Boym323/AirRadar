import type {
  Aircraft,
  AircraftDataOrigin,
  AircraftProvenance,
  CoverageStats,
  ReceiverPosition,
  TrailPoint,
} from "@/lib/aircraft/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";

const POSITION_TIE_MS = 1_000;

function originOf(aircraft: Aircraft): AircraftDataOrigin {
  return aircraft.origin ?? "local";
}

function finiteAge(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value * 1000 : null;
}

/** Estimate when the reported position was observed; seen_pos is preferred. */
export function positionObservedAt(aircraft: Pick<Aircraft, "lastSeen" | "seenSeconds" | "seenPosSeconds">): number | null {
  const lastSeen = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(lastSeen)) return null;
  const seen = finiteAge(aircraft.seenSeconds);
  const seenPos = finiteAge(aircraft.seenPosSeconds);
  if (seen !== null && seenPos !== null) return lastSeen + Math.max(0, seen - seenPos);
  return lastSeen;
}

export function positionAgeMs(aircraft: Pick<Aircraft, "lastSeen" | "seenSeconds" | "seenPosSeconds">, now = Date.now()): number {
  const observedAt = positionObservedAt(aircraft);
  return observedAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now - observedAt);
}

function messageAgeMs(aircraft: Aircraft, now: number): number {
  const seen = finiteAge(aircraft.seenSeconds);
  const lastSeen = Date.parse(aircraft.lastSeen);
  if (seen !== null) return seen;
  return Number.isFinite(lastSeen) ? Math.max(0, now - lastSeen) : Number.POSITIVE_INFINITY;
}

function sourceRank(aircraft: Aircraft): number {
  const local = originOf(aircraft) === "local";
  if (local && aircraft.source === "ADS-B") return 50;
  if (local && aircraft.source === "MLAT") return 40;
  if (!local && aircraft.source === "ADS-B") return 30;
  if (!local && aircraft.source === "MLAT") return 20;
  return local ? 10 : 0;
}

function isFresh(aircraft: Aircraft, staleAfterMs: number, now: number): boolean {
  const age = messageAgeMs(aircraft, now);
  return Number.isFinite(age) && age <= staleAfterMs;
}

function staleAfterFor(
  aircraft: Aircraft,
  localStaleAfterMs: number,
  networkStaleAfterMs: number,
): number {
  return originOf(aircraft) === "local" ? localStaleAfterMs : networkStaleAfterMs;
}

function choosePositionObservation(
  local: Aircraft | undefined,
  network: Aircraft | undefined,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number },
  now: number,
): Aircraft | undefined {
  const candidates = [local, network].filter((item): item is Aircraft => Boolean(item));
  const fresh = candidates.filter((item) => isFresh(item, staleAfterFor(item, options.localStaleAfterMs, options.networkStaleAfterMs), now));
  return fresh.sort((left, right) => {
    const ageDifference = positionAgeMs(left, now) - positionAgeMs(right, now);
    if (Math.abs(ageDifference) > POSITION_TIE_MS) return ageDifference;
    return sourceRank(right) - sourceRank(left);
  })[0];
}

function nonEmpty<T>(local: T | null | undefined, network: T | null | undefined): T | null {
  return local ?? network ?? null;
}

function provenance(local: Aircraft | undefined, network: Aircraft | undefined, position: Aircraft | undefined): AircraftProvenance {
  const positionOrigin = position ? originOf(position) : null;
  return {
    seenLocal: Boolean(local),
    seenNetwork: Boolean(network),
    lastLocalSeen: local?.lastSeen ?? null,
    lastNetworkSeen: network?.lastSeen ?? null,
    positionOrigin,
    positionSource: position?.source ?? "UNKNOWN",
  };
}

function selectedEmergency(
  local: Aircraft | undefined,
  network: Aircraft | undefined,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number },
  now: number,
): string | null {
  const fresh = [local, network]
    .filter((item): item is Aircraft => item !== undefined
      && isFresh(item, staleAfterFor(item, options.localStaleAfterMs, options.networkStaleAfterMs), now))
    .sort((left, right) => messageAgeMs(left, now) - messageAgeMs(right, now));
  return fresh[0]?.emergency ?? null;
}

function selectedTrail(position: Aircraft | undefined): TrailPoint[] {
  return position?.trail?.slice(-120) ?? [];
}

/**
 * Explicitly arbitrates two observations. The object is assembled field by
 * field so a network observation cannot accidentally replace local metadata,
 * RSSI, message counters, or a newer kinematic group.
 */
export function mergeAircraftObservations(
  local: Aircraft | undefined,
  network: Aircraft | undefined,
  receiver: ReceiverPosition,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number; now?: number },
): Aircraft | null {
  if (!local && !network) return null;
  const now = options.now ?? Date.now();
  const position = choosePositionObservation(local, network, options, now);
  if (!position) return null;
  const lat = position.lat;
  const lon = position.lon;
  const distanceKm = lat !== null && lon !== null ? haversineDistanceKm(receiver.lat, receiver.lon, lat, lon) : null;
  const bearing = lat !== null && lon !== null ? initialBearing(receiver.lat, receiver.lon, lat, lon) : null;
  const merged: Aircraft = {
    icaoHex: position.icaoHex,
    callsign: nonEmpty(local?.callsign, network?.callsign),
    registration: nonEmpty(local?.registration, network?.registration),
    aircraftType: nonEmpty(local?.aircraftType, network?.aircraftType),
    aircraftDescription: nonEmpty(local?.aircraftDescription, network?.aircraftDescription),
    lat,
    lon,
    altitude: position.altitude,
    baroAltitude: position.baroAltitude,
    geomAltitude: position.geomAltitude,
    groundSpeed: position.groundSpeed,
    track: position.track,
    verticalRate: position.verticalRate,
    baroRate: position.baroRate,
    geomRate: position.geomRate,
    squawk: position.squawk,
    category: nonEmpty(local?.category, network?.category),
    emergency: selectedEmergency(local, network, options, now),
    // RSSI and message counts are receiver-local measurements. Network-only
    // aircraft deliberately expose neither value.
    rssi: local ? local.rssi : null,
    messages: local ? local.messages : null,
    seenSeconds: position.seenSeconds,
    seenPosSeconds: position.seenPosSeconds,
    lastSeen: position.lastSeen,
    source: position.source,
    distanceKm,
    bearing,
    origin: originOf(position),
    provenance: provenance(local, network, position),
    sourceType: position.sourceType,
    onGround: position.onGround,
    trail: selectedTrail(position),
  };
  if (local?.enrichment) merged.enrichment = local.enrichment;
  else if (network?.enrichment) merged.enrichment = network.enrichment;
  if (local?.atc !== undefined) merged.atc = local.atc;
  else if (network?.atc !== undefined) merged.atc = network.atc;
  return merged;
}

export function mergeAircraftMaps(
  local: ReadonlyMap<string, Aircraft>,
  network: ReadonlyMap<string, Aircraft>,
  receiver: ReceiverPosition,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number; now?: number },
): Aircraft[] {
  const keys = new Set([...local.keys(), ...network.keys()]);
  const merged: Aircraft[] = [];
  for (const key of keys) {
    const value = mergeAircraftObservations(local.get(key), network.get(key), receiver, options);
    if (value) merged.push(value);
  }
  return merged;
}

export function coverageStats(
  local: ReadonlyMap<string, Aircraft>,
  network: ReadonlyMap<string, Aircraft>,
  displayedAircraft: number,
): CoverageStats {
  let seenByBoth = 0;
  for (const key of local.keys()) if (network.has(key)) seenByBoth += 1;
  return {
    displayedAircraft,
    localAircraft: local.size,
    networkAircraft: network.size,
    networkOnlyAircraft: Math.max(0, network.size - seenByBoth),
    seenByBoth,
  };
}
