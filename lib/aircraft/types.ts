import type { AtcAssignment } from "@/lib/atc/types";
import type { Airport } from "@/lib/airports/types";

export type AircraftSource = "ADS-B" | "MLAT" | "TIS-B" | "Mode-S" | "UNKNOWN";

export interface ReceiverPosition {
  lat: number;
  lon: number;
  name: string;
}

export interface AircraftMetadata {
  registration: string | null;
  registrationCountry: string | null;
  registrationCountryCode: string | null;
  aircraftType: string | null;
  icaoTypeCode: string | null;
  aircraftDescription: string | null;
  operator: string | null;
  manufacturer: string | null;
  source: string;
  retrievedAt: string;
}

export interface FlightRoute {
  callsign: string;
  airline: string | null;
  airlineIcao: string | null;
  airlineIata: string | null;
  origin: string | null;
  destination: string | null;
  originAirport: Airport | null;
  destinationAirport: Airport | null;
  source: string;
  retrievedAt: string;
}

export interface FlightPlan {
  callsign: string;
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  scheduledArrival: string | null;
  estimatedArrival: string | null;
  filedRoute: string | null;
  waypoints: string[];
  source: string;
  retrievedAt: string;
}

export interface AircraftEnrichment {
  metadata?: AircraftMetadata;
  route?: FlightRoute;
  flightPlan?: FlightPlan;
}

export interface Aircraft {
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  aircraftDescription: string | null;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  baroAltitude: number | null;
  geomAltitude: number | null;
  groundSpeed: number | null;
  track: number | null;
  verticalRate: number | null;
  baroRate: number | null;
  geomRate: number | null;
  squawk: string | null;
  category: string | null;
  emergency: string | null;
  rssi: number | null;
  messages: number | null;
  seenSeconds: number | null;
  seenPosSeconds: number | null;
  lastSeen: string;
  source: AircraftSource;
  sourceType: string | null;
  onGround: boolean;
  distanceKm: number | null;
  bearing: number | null;
  trail: TrailPoint[];
  enrichment?: AircraftEnrichment;
  atc?: AtcAssignment | null;
}

/** The wire representation intentionally omits the in-memory trail by default. */
export type AircraftView = Omit<Aircraft, "trail"> & { trail?: TrailPoint[] };

export interface TrailPoint {
  lat: number;
  lon: number;
  recordedAt: string;
}

export interface ProviderSnapshot {
  aircraft: Aircraft[];
  receiver: ReceiverPosition;
  fetchedAt: string;
  provider: string;
  messagesPerSecond?: number | null;
}

export interface StateSnapshot {
  aircraft: AircraftView[];
  receiver: ReceiverPosition;
  fetchedAt: string;
  provider: string;
  sourceOnline: boolean;
  lastSourceUpdate: string | null;
  sourceError: string | null;
  readsbOnline: boolean;
  lastReadsbUpdate: string | null;
  lastError: string | null;
  stats: RadarStats;
}

export interface RadarStats {
  currentAircraft: number;
  aircraftSeenToday: number;
  uniqueAircraftToday: number;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
  aircraftTypes: Array<{ name: string; count: number }>;
  airlines: Array<{ name: string; count: number }>;
  messagesPerSecond: number | null;
}
