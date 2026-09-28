import type { Aircraft } from "@/lib/aircraft/types";

export interface DurableFlightLike {
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  airline: string | null;
  origin: string | null;
  destination: string | null;
  maxAltitude: number | null;
  minDistanceKm: number | null;
  lastSeenAt: Date;
}

export interface FlightUpdateInput {
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  airline: string | null;
  origin: string | null;
  destination: string | null;
  altitude: number | null;
  distanceKm: number | null;
  lastSeenAt: Date;
}

export type FlightUpdateReason = "freshness" | "callsign" | "identity" | "route" | "altitude-aggregate" | "distance-aggregate";

export interface FlightUpdatePlan { data: Record<string, unknown>; reasons: FlightUpdateReason[]; }

function nextMax(current: number | null, candidate: number | null): number | null {
  return Math.max(current ?? 0, candidate ?? 0) || null;
}

function nextMin(current: number | null, candidate: number | null): number | null {
  const value = Math.min(current ?? Number.POSITIVE_INFINITY, candidate ?? Number.POSITIVE_INFINITY);
  return value === Number.POSITIVE_INFINITY ? null : value;
}

/** Build only changed Flight columns; freshness remains an immediate durable heartbeat. */
export function planFlightUpdate(current: DurableFlightLike, input: FlightUpdateInput): FlightUpdatePlan {
  const data: Record<string, unknown> = {};
  const reasons: FlightUpdateReason[] = [];
  const fields: Array<[keyof DurableFlightLike, string | null, FlightUpdateReason]> = [
    ["callsign", current.callsign ?? input.callsign, "callsign"],
    ["registration", current.registration ?? input.registration, "identity"],
    ["aircraftType", current.aircraftType ?? input.aircraftType, "identity"],
    ["airline", current.airline ?? input.airline, "route"],
    ["origin", current.origin ?? input.origin, "route"],
    ["destination", current.destination ?? input.destination, "route"],
  ];
  for (const [field, value, reason] of fields) {
    if (value !== current[field]) { data[field] = value; reasons.push(reason); }
  }
  const maxAltitude = nextMax(current.maxAltitude, input.altitude);
  if (maxAltitude !== current.maxAltitude) { data.maxAltitude = maxAltitude; reasons.push("altitude-aggregate"); }
  const minDistanceKm = nextMin(current.minDistanceKm, input.distanceKm);
  if (minDistanceKm !== current.minDistanceKm) { data.minDistanceKm = minDistanceKm; reasons.push("distance-aggregate"); }
  if (input.lastSeenAt.getTime() !== current.lastSeenAt.getTime()) { data.lastSeenAt = input.lastSeenAt; reasons.push("freshness"); }
  return { data, reasons };
}

export interface AircraftDurableValues {
  registration: string | null;
  registrationCountry: string | null;
  registrationCountryCode: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
}

export function aircraftDurableValues(item: Aircraft): AircraftDurableValues {
  const metadata = item.enrichment?.metadata;
  return {
    registration: item.registration ?? metadata?.registration ?? null,
    registrationCountry: metadata?.registrationCountry ?? null,
    registrationCountryCode: metadata?.registrationCountryCode ?? null,
    aircraftType: item.aircraftType ?? metadata?.icaoTypeCode ?? null,
    manufacturer: metadata?.manufacturer ?? null,
    model: metadata?.aircraftDescription ?? null,
    operator: metadata?.operator ?? null,
  };
}

export function changedAircraftValues(current: AircraftDurableValues, next: AircraftDurableValues): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  for (const field of Object.keys(next) as Array<keyof AircraftDurableValues>) {
    if (next[field] !== current[field]) changes[field] = next[field];
  }
  return changes;
}
