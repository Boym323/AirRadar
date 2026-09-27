import type { AircraftView } from "@/lib/aircraft/types";
import type { OgnTargetView } from "@/lib/ogn/types";
import { haversineDistanceKm } from "@/lib/geo";

const POSITION_MATCH_RADIUS_KM = 0.3;
const EXACT_POSITION_MATCH_RADIUS_KM = 0.5;
const ALTITUDE_MATCH_TOLERANCE_FT = 300;

/** Returns true when an OGN target is almost certainly already shown by ADS-B. */
export function isOgnDuplicateOfAircraft(target: OgnTargetView, aircraft: AircraftView): boolean {
  if (target.address && target.addressType === "icao" && target.address.toUpperCase() === aircraft.icaoHex.toUpperCase()) return true;
  if (!Number.isFinite(aircraft.lat) || !Number.isFinite(aircraft.lon)) return false;

  const distanceKm = haversineDistanceKm(target.latitude, target.longitude, aircraft.lat!, aircraft.lon!);
  if (distanceKm > POSITION_MATCH_RADIUS_KM) return false;
  // OGN and ADS-B position reports can have different timestamps. When the
  // coordinates are effectively identical, missing OGN altitude must not
  // leave two labels/icons for the same aircraft.
  if (distanceKm <= EXACT_POSITION_MATCH_RADIUS_KM) return true;
  if (target.altitudeFt === null || aircraft.altitude === null) return false;
  return Math.abs(target.altitudeFt - aircraft.altitude) <= ALTITUDE_MATCH_TOLERANCE_FT;
}
