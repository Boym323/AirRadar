import type { AircraftView, ReceiverPosition } from "@/lib/aircraft/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";

export type AircraftSourceClassification = "LOCAL_ONLY" | "NETWORK_ONLY" | "OVERLAP" | "UNKNOWN";

export function aircraftSourceLabel(aircraft: Pick<AircraftView, "provenance">): string {
  switch (classifyAircraftSource(aircraft)) {
    case "LOCAL_ONLY": return "LOCAL";
    case "NETWORK_ONLY": return "NETWORK";
    case "OVERLAP": return "LOCAL + NETWORK";
    default: return "UNKNOWN";
  }
}

/** A compact label for the source that supplied the aircraft's current position.
 * This is intentionally separate from seen-by coverage, which may include more
 * than one provider for the same ICAO identity. */
export function aircraftPositionSourceLabel(aircraft: Pick<AircraftView, "provenance" | "source">): string {
  const origin = aircraft.provenance?.positionOrigin;
  if (origin === "adsblol") return "ADSB.LOL";
  if (origin === "adsbhub") return "ADSBHUB";
  if (origin === "local") return aircraft.provenance?.positionSource === "MLAT" ? "LOCAL · MLAT" : "LOCAL ADS-B";
  if (aircraft.provenance?.positionSource === "MLAT") return "MLAT";
  if (aircraft.provenance?.positionSource === "ADS-B") return "ADS-B";
  return aircraft.provenance?.positionSource ?? aircraft.source ?? "UNKNOWN";
}
export type AircraftSourceFilter = "all" | "local" | "network" | "overlap";

export interface SourceStats {
  local: number;
  network: number;
  overlap: number;
  localOnly: number;
  networkOnly: number;
  total: number;
}

export function classifyAircraftSource(aircraft: Pick<AircraftView, "provenance">): AircraftSourceClassification {
  const local = aircraft.provenance?.seenLocal === true;
  const network = aircraft.provenance?.seenNetwork === true;
  if (local && network) return "OVERLAP";
  if (local) return "LOCAL_ONLY";
  if (network) return "NETWORK_ONLY";
  return "UNKNOWN";
}

export function matchesAircraftSourceFilter(aircraft: Pick<AircraftView, "provenance">, filter: AircraftSourceFilter): boolean {
  const classification = classifyAircraftSource(aircraft);
  if (filter === "all") return true;
  if (filter === "local") return classification === "LOCAL_ONLY" || classification === "OVERLAP";
  if (filter === "network") return classification === "NETWORK_ONLY" || classification === "OVERLAP";
  return classification === "OVERLAP";
}

export function filterAircraftBySource(aircraft: readonly AircraftView[], filter: AircraftSourceFilter): AircraftView[] {
  return aircraft.filter((item) => matchesAircraftSourceFilter(item, filter));
}

export function computeSourceStats(aircraft: readonly AircraftView[]): SourceStats {
  let localOnly = 0;
  let networkOnly = 0;
  let overlap = 0;
  for (const item of aircraft) {
    switch (classifyAircraftSource(item)) {
      case "LOCAL_ONLY": localOnly += 1; break;
      case "NETWORK_ONLY": networkOnly += 1; break;
      case "OVERLAP": overlap += 1; break;
      default: break;
    }
  }
  return { local: localOnly + overlap, network: networkOnly + overlap, overlap, localOnly, networkOnly, total: localOnly + networkOnly + overlap };
}

export interface LocalCoverageRatio {
  radiusNm: number;
  numerator: number;
  denominator: number;
  percentage: number | null;
}

export interface CoverageEligibility {
  icaoHex: string;
  distanceKm: number;
  bearing: number;
  altitude: number | null;
  captured: boolean;
}

/** The shared comparison cohort used by both live and historical coverage. */
export function eligibleNetworkObservation(
  network: AircraftView,
  local: AircraftView | undefined,
  receiver: ReceiverPosition,
  radiusNm: number,
  now = Date.now(),
  networkFreshMs = 60_000,
  localFreshMs = networkFreshMs,
): CoverageEligibility | null {
  if (network.provenance?.seenNetwork !== true || !network.icaoHex || /^~|^0+$/.test(network.icaoHex)) return null;
  if (typeof network.lat !== "number" || !Number.isFinite(network.lat) || typeof network.lon !== "number" || !Number.isFinite(network.lon)) return null;
  const networkSeen = network.provenance.lastNetworkSeen ? Date.parse(network.provenance.lastNetworkSeen) : NaN;
  if (!Number.isFinite(networkSeen) || now - networkSeen < 0 || now - networkSeen > networkFreshMs) return null;
  const distanceKm = haversineDistanceKm(receiver.lat, receiver.lon, network.lat, network.lon);
  if (!Number.isFinite(distanceKm)) return null;
  if (distanceKm > radiusNm * 1.852) return null;
  const bearing = ((typeof network.bearing === "number" && Number.isFinite(network.bearing)
    ? network.bearing : initialBearing(receiver.lat, receiver.lon, network.lat, network.lon)) + 360) % 360;
  const localSeen = local?.provenance?.lastLocalSeen ? Date.parse(local.provenance.lastLocalSeen) : NaN;
  const captured = local?.provenance?.seenLocal === true && Number.isFinite(localSeen)
    && now - localSeen >= 0 && now - localSeen <= localFreshMs;
  return { icaoHex: network.icaoHex.toUpperCase(), distanceKm, bearing, altitude: Number.isFinite(network.baroAltitude ?? NaN) ? network.baroAltitude : (Number.isFinite(network.altitude ?? NaN) ? network.altitude : null), captured };
}

export function computeLocalCoverageRatio(aircraft: readonly AircraftView[], receiver: ReceiverPosition, radiusNm: number, now = Date.now(), maxNetworkAgeMs = 60_000, maxLocalAgeMs = maxNetworkAgeMs): LocalCoverageRatio {
  let denominator = 0;
  let numerator = 0;
  for (const item of aircraft) {
    const eligible = eligibleNetworkObservation(item, item, receiver, radiusNm, now, maxNetworkAgeMs, maxLocalAgeMs);
    if (!eligible) continue;
    denominator += 1;
    if (eligible.captured) numerator += 1;
  }
  return { radiusNm, numerator, denominator, percentage: denominator > 0 ? (numerator / denominator) * 100 : null };
}
