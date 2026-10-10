import type { AircraftView } from "@/lib/aircraft/types";

/** Select at most one fresh locally observed aircraft from the existing SSE snapshot.
 * Stale, network-only, grounded or missing-position targets cannot take over TV camera.
 */
export function pickPresentationAircraft(aircraft: readonly AircraftView[], previousHex: string | null): AircraftView | null {
  const eligible = aircraft.filter((item) =>
    (item.origin === "local" || item.provenance?.positionOrigin === "local")
    && !item.onGround
    && Number.isFinite(item.lat) && item.lat !== null && Math.abs(item.lat) <= 90
    && Number.isFinite(item.lon) && item.lon !== null && Math.abs(item.lon) <= 180
    && item.seenPosSeconds !== null && item.seenPosSeconds !== undefined && item.seenPosSeconds >= 0 && item.seenPosSeconds <= 30
    && item.distanceKm !== null && item.distanceKm >= 0,
  );
  if (!eligible.length) return null;
  eligible.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.icaoHex.localeCompare(b.icaoHex));
  return eligible.find((item) => item.icaoHex !== previousHex) ?? eligible[0];
}
