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
const EMERGENCY_TIE_MS = 1_000;
const SQUAWK_TIE_MS = 1_000;

function originOf(aircraft: Aircraft): AircraftDataOrigin {
  return aircraft.origin ?? "local";
}

function finiteAge(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value * 1000 : null;
}

/** A position is usable only when both coordinates pass the geographic bounds. */
export function hasUsablePosition(aircraft: Pick<Aircraft, "lat" | "lon">): boolean {
  return typeof aircraft.lat === "number" && Number.isFinite(aircraft.lat) && aircraft.lat >= -90 && aircraft.lat <= 90
    && typeof aircraft.lon === "number" && Number.isFinite(aircraft.lon) && aircraft.lon >= -180 && aircraft.lon <= 180;
}

/** Estimate when the reported position was observed; seen_pos is required. */
export function positionObservedAt(aircraft: Pick<Aircraft, "lastSeen" | "seenSeconds" | "seenPosSeconds">): number | null {
  const lastSeen = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(lastSeen)) return null;
  const seenPos = finiteAge(aircraft.seenPosSeconds);
  if (seenPos === null) return null;
  const seen = finiteAge(aircraft.seenSeconds);
  // lastSeen is the timestamp of the last message. When seen is available,
  // move back to the provider snapshot time before applying seen_pos. If it
  // is not available, lastSeen - seen_pos is the conservative approximation.
  return seen === null ? lastSeen - seenPos : lastSeen + seen - seenPos;
}

export function positionAgeMs(aircraft: Pick<Aircraft, "lastSeen" | "seenSeconds" | "seenPosSeconds">, now = Date.now()): number {
  const reportedAge = finiteAge(aircraft.seenPosSeconds);
  if (reportedAge === null) return Number.POSITIVE_INFINITY;
  const observedAt = positionObservedAt(aircraft);
  return observedAt === null ? reportedAge : Math.max(reportedAge, Math.max(0, now - observedAt));
}

function messageAgeMs(aircraft: Aircraft, now: number): number {
  const lastSeen = Date.parse(aircraft.lastSeen);
  const seen = finiteAge(aircraft.seenSeconds);
  const elapsed = Number.isFinite(lastSeen) ? Math.max(0, now - lastSeen) : null;
  if (elapsed === null) return seen ?? Number.POSITIVE_INFINITY;
  return Math.max(elapsed, seen ?? 0);
}

function sourceTypeRank(aircraft: Aircraft): number {
  if (aircraft.source === "ADS-B") return 4;
  if (aircraft.source === "MLAT") return 3;
  if (aircraft.source === "TIS-B") return 2;
  if (aircraft.source === "Mode-S") return 1;
  return 0;
}

function originRank(aircraft: Aircraft): number {
  return originOf(aircraft) === "local" ? 1 : 0;
}

function compareObservationFreshness(left: Aircraft, right: Aircraft, now: number, tieMs: number): number {
  const ageDifference = messageAgeMs(left, now) - messageAgeMs(right, now);
  if (Math.abs(ageDifference) > tieMs) return ageDifference;
  const originDifference = originRank(right) - originRank(left);
  if (originDifference !== 0) return originDifference;
  return sourceTypeRank(right) - sourceTypeRank(left);
}

function isFreshObservation(aircraft: Aircraft, staleAfterMs: number, now: number): boolean {
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

export function isFreshPosition(aircraft: Aircraft, staleAfterMs: number, now = Date.now()): boolean {
  return hasUsablePosition(aircraft) && positionAgeMs(aircraft, now) <= staleAfterMs;
}

export function selectPositionObservation(
  local: Aircraft | undefined,
  network: Aircraft | undefined,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number },
  now: number,
): Aircraft | undefined {
  // Provenance is the first arbitration boundary: a fresh usable local
  // position is authoritative even when the network position is newer.
  const localCandidates = local && isFreshPosition(local, options.localStaleAfterMs, now) ? [local] : [];
  if (localCandidates.length) {
    return localCandidates.sort((left, right) => compareObservationFreshness(left, right, now, POSITION_TIE_MS))[0];
  }

  const networkCandidates = network && isFreshPosition(network, options.networkStaleAfterMs, now) ? [network] : [];
  return networkCandidates.sort((left, right) => compareObservationFreshness(left, right, now, POSITION_TIE_MS))[0];
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

function emergencyValue(aircraft: Aircraft): string | null {
  const value = aircraft.emergency?.trim().toLowerCase();
  return value && value !== "none" && value !== "unknown" ? value : null;
}

function selectedEmergencyObservation(
  local: Aircraft | undefined,
  network: Aircraft | undefined,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number },
  now: number,
): Aircraft | undefined {
  const fresh = [local, network]
    .filter((item): item is Aircraft => item !== undefined
      && isFreshObservation(item, staleAfterFor(item, options.localStaleAfterMs, options.networkStaleAfterMs), now)
      && emergencyValue(item) !== null)
    .sort((left, right) => compareObservationFreshness(left, right, now, EMERGENCY_TIE_MS));
  return fresh[0];
}

function selectedEmergency(
  local: Aircraft | undefined,
  network: Aircraft | undefined,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number },
  now: number,
): string | null {
  const selected = selectedEmergencyObservation(local, network, options, now);
  return selected ? emergencyValue(selected) : null;
}

function squawkValue(aircraft: Aircraft): string | null {
  const value = aircraft.squawk?.trim();
  return value || null;
}

function isEmergencySquawk(value: string | null): boolean {
  return value === "7500" || value === "7600" || value === "7700";
}

function selectedSquawk(
  local: Aircraft | undefined,
  network: Aircraft | undefined,
  options: { localStaleAfterMs: number; networkStaleAfterMs: number },
  now: number,
  emergencyObservation: Aircraft | undefined,
): string | null {
  const emergencySquawk = emergencyObservation ? squawkValue(emergencyObservation) : null;
  if (isEmergencySquawk(emergencySquawk)) return emergencySquawk;

  const fresh = [local, network]
    .filter((item): item is Aircraft => item !== undefined
      && isFreshObservation(item, staleAfterFor(item, options.localStaleAfterMs, options.networkStaleAfterMs), now)
      && squawkValue(item) !== null)
    .sort((left, right) => compareObservationFreshness(left, right, now, SQUAWK_TIE_MS));
  return fresh[0] ? squawkValue(fresh[0]) : null;
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
  const position = selectPositionObservation(local, network, options, now);
  if (!position) return null;
  const emergencyObservation = selectedEmergencyObservation(local, network, options, now);
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
    squawk: selectedSquawk(local, network, options, now, emergencyObservation),
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
