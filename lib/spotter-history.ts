import type { HistoricalAircraftTrack } from "@/lib/time-machine/playback";
import { haversineDistanceKm, type SpotterObserverPosition } from "@/lib/spotter-location";

export interface SpotterRecentPass {
  trackId: string;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  origin: string | null;
  destination: string | null;
  closestAt: string;
  closestDistanceKm: number;
  altitudeFt: number | null;
}

export function findRecentObserverPasses(
  tracks: readonly HistoricalAircraftTrack[],
  observer: SpotterObserverPosition,
  maxDistanceKm = 10,
  limit = 10,
): SpotterRecentPass[] {
  const passes: SpotterRecentPass[] = [];

  for (const track of tracks) {
    let closest: { timestamp: string; distanceKm: number; altitudeFt: number | null } | null = null;
    for (const position of track.positions) {
      if (!Number.isFinite(position.lat) || !Number.isFinite(position.lon)) continue;
      const distanceKm = haversineDistanceKm(observer, { lat: position.lat, lon: position.lon });
      if (!closest || distanceKm < closest.distanceKm) {
        closest = {
          timestamp: position.timestamp,
          distanceKm,
          altitudeFt: position.altitude,
        };
      }
    }
    if (!closest || closest.distanceKm > maxDistanceKm) continue;

    passes.push({
      trackId: track.id,
      icaoHex: track.hex,
      callsign: track.callsign,
      registration: track.registration,
      aircraftType: track.type,
      origin: track.origin,
      destination: track.destination,
      closestAt: closest.timestamp,
      closestDistanceKm: closest.distanceKm,
      altitudeFt: closest.altitudeFt,
    });
  }

  return passes
    .sort((a, b) => Date.parse(b.closestAt) - Date.parse(a.closestAt)
      || a.closestDistanceKm - b.closestDistanceKm
      || a.icaoHex.localeCompare(b.icaoHex))
    .slice(0, Math.max(0, limit));
}
