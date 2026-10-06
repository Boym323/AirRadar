import type { AircraftView } from "@/lib/aircraft/types";
import type { LogbookLabel } from "@/lib/aircraft/types";

export type SpotterDiscoveryFilter = "all" | "new" | "rare";

export interface SpotterFilters {
  maxDistanceKm: number | null;
  maxAltitudeFt: number | null;
  discovery: SpotterDiscoveryFilter;
  aircraftType: string;
}

export function isLocalSpotterAircraft(aircraft: AircraftView): boolean {
  return aircraft.origin === "local" || aircraft.provenance?.seenLocal === true;
}

export function sortSpotterAircraftByDistance(aircraft: readonly AircraftView[]): AircraftView[] {
  return [...aircraft].sort((a, b) => {
    const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY;
    return aDistance - bDistance || a.icaoHex.localeCompare(b.icaoHex);
  });
}

export function filterSpotterAircraft(
  aircraft: readonly AircraftView[],
  filters: SpotterFilters,
  labelsByHex: ReadonlyMap<string, readonly LogbookLabel[]> = new Map(),
): AircraftView[] {
  const typeQuery = filters.aircraftType.trim().toUpperCase();
  return sortSpotterAircraftByDistance(aircraft.filter((item) => {
    if (!isLocalSpotterAircraft(item)) return false;
    if (filters.maxDistanceKm !== null && (item.distanceKm === null || item.distanceKm > filters.maxDistanceKm)) return false;
    if (filters.maxAltitudeFt !== null && (item.altitude === null || item.altitude > filters.maxAltitudeFt)) return false;
    if (typeQuery) {
      const type = [item.aircraftType, item.enrichment?.metadata?.icaoTypeCode, item.enrichment?.metadata?.aircraftDescription]
        .filter(Boolean).join(" ").toUpperCase();
      if (!type.includes(typeQuery)) return false;
    }
    if (filters.discovery !== "all" && !(labelsByHex.get(item.icaoHex) ?? []).includes(filters.discovery)) return false;
    return true;
  }));
}
