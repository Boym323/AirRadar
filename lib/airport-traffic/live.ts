import type { AircraftView } from "@/lib/aircraft/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";

export const AIRPORT_NEARBY_RADIUS_KM = 30;
export type AirportTrafficClassification = "approaching" | "departing" | "overflying" | "unknown";

export interface AirportTrafficObservation {
  aircraft: AircraftView;
  distanceKm: number;
  bearingToAirport: number;
  classification: AirportTrafficClassification;
}

function angleDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** Classifies a positioned, recent ADS-B observation using movement heuristics. */
export function classifyAirportTraffic(
  aircraft: Pick<AircraftView, "track" | "verticalRate">,
  distanceKm: number,
  bearingToAirport: number,
  previousDistanceKm: number | null,
): AirportTrafficClassification {
  if (previousDistanceKm === null || aircraft.track === null || !Number.isFinite(aircraft.track)) return "unknown";
  const trendKm = previousDistanceKm - distanceKm;
  const toward = angleDifference(aircraft.track, bearingToAirport) <= 65;
  const away = angleDifference(aircraft.track, (bearingToAirport + 180) % 360) <= 65;
  if (trendKm >= 0.2 && toward && (aircraft.verticalRate ?? 0) > -700) return "approaching";
  if (trendKm <= -0.2 && away && (aircraft.verticalRate ?? 0) >= 150) return "departing";
  if (Math.abs(trendKm) < 0.2 && !toward && !away) return "overflying";
  return "unknown";
}

export function nearbyAirportAircraft(
  aircraft: readonly AircraftView[],
  airport: { latitude: number; longitude: number },
  previousDistances: ReadonlyMap<string, number> = new Map(),
  now = Date.now(),
): AirportTrafficObservation[] {
  return aircraft.flatMap((item) => {
    if (item.lat === null || item.lon === null) return [];
    const ageMs = now - Date.parse(item.lastSeen);
    if (!Number.isFinite(ageMs) || ageMs > 120_000) return [];
    const distanceKm = haversineDistanceKm(item.lat, item.lon, airport.latitude, airport.longitude);
    if (!Number.isFinite(distanceKm) || distanceKm > AIRPORT_NEARBY_RADIUS_KM) return [];
    const bearingToAirport = initialBearing(item.lat, item.lon, airport.latitude, airport.longitude);
    return [{ aircraft: item, distanceKm, bearingToAirport, classification: classifyAirportTraffic(item, distanceKm, bearingToAirport, previousDistances.get(item.icaoHex) ?? null) }];
  }).sort((a, b) => a.distanceKm - b.distanceKm || a.aircraft.icaoHex.localeCompare(b.aircraft.icaoHex));
}
