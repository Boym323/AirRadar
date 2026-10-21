import type { AircraftEnrichment } from "@/lib/aircraft/types";

/** Stable, side-effect-free public history and aircraft-detail wire contracts. */
export interface HistoryResponse {
  source: "postgres" | "memory";
  flight: {
    id: number | null;
    callsign: string | null;
    registration: string | null;
    aircraftType: string | null;
    airline: string | null;
    origin: string | null;
    destination: string | null;
    startedAt: string | null;
    endedAt: string | null;
    lastSeenAt: string | null;
    maxAltitude: number | null;
    minDistanceKm: number | null;
  } | null;
  positions: Array<{
    recordedAt: string;
    lat: number;
    lon: number;
    altitude: number | null;
    groundSpeed: number | null;
    track: number | null;
  }>;
}

export interface AircraftDetailMetadata {
  icaoHex: string;
  registration: string | null;
  registrationCountry: string | null;
  registrationCountryCode: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
}

export type AircraftQuickEnrichment = Omit<AircraftEnrichment, "flightPlan">;

/**
 * The radar drawer only needs the durable identity row and locally available
 * enrichment. Keeping this DTO separate prevents the drawer from depending on
 * recent-flight/history payloads or on-demand flight-plan enrichment.
 */
export interface AircraftQuickDetailResponse {
  aircraft: AircraftDetailMetadata | null;
  liveEnrichment?: AircraftQuickEnrichment;
}
