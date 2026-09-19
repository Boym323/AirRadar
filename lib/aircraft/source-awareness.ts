import type { AircraftView, ReceiverPosition } from "@/lib/aircraft/types";
import { haversineDistanceKm } from "@/lib/geo";

export type AircraftSourceClassification = "LOCAL_ONLY" | "NETWORK_ONLY" | "OVERLAP" | "UNKNOWN";
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

export function computeLocalCoverageRatio(aircraft: readonly AircraftView[], receiver: ReceiverPosition, radiusNm: number, now = Date.now(), maxNetworkAgeMs = 60_000): LocalCoverageRatio {
  let denominator = 0;
  let numerator = 0;
  for (const item of aircraft) {
    if (item.provenance?.seenNetwork !== true || typeof item.lat !== "number" || typeof item.lon !== "number") continue;
    if (haversineDistanceKm(receiver.lat, receiver.lon, item.lat, item.lon) > radiusNm * 1.852) continue;
    const networkSeen = item.provenance.lastNetworkSeen ? Date.parse(item.provenance.lastNetworkSeen) : NaN;
    if (!Number.isFinite(networkSeen) || now - networkSeen > maxNetworkAgeMs) continue;
    denominator += 1;
    const localSeen = item.provenance.lastLocalSeen ? Date.parse(item.provenance.lastLocalSeen) : NaN;
    if (item.provenance.seenLocal && Number.isFinite(localSeen) && now - localSeen <= maxNetworkAgeMs) numerator += 1;
  }
  return { radiusNm, numerator, denominator, percentage: denominator > 0 ? (numerator / denominator) * 100 : null };
}
