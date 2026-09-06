export type AircraftSource = "ADS-B" | "MLAT" | "TIS-B" | "UNKNOWN";

export interface ReceiverPosition {
  lat: number;
  lon: number;
  name: string;
}

export interface AircraftMetadata {
  registration: string | null;
  aircraftType: string | null;
  aircraftDescription: string | null;
  operator: string | null;
  manufacturer: string | null;
  source: string;
  retrievedAt: string;
}

export interface FlightRoute {
  callsign: string;
  airline: string | null;
  origin: string | null;
  destination: string | null;
  source: string;
  retrievedAt: string;
}

export interface FlightPlan {
  callsign: string;
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
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
  groundSpeed: number | null;
  track: number | null;
  verticalRate: number | null;
  squawk: string | null;
  rssi: number | null;
  messages: number | null;
  lastSeen: string;
  source: AircraftSource;
  onGround: boolean;
  distanceKm: number | null;
  bearing: number | null;
  trail: TrailPoint[];
  enrichment?: AircraftEnrichment;
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
  uniqueAircraftToday: number;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
}
