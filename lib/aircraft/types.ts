export type AircraftSource = "ADS-B" | "MLAT" | "TIS-B" | "UNKNOWN";

export interface ReceiverPosition {
  lat: number;
  lon: number;
  name: string;
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
}

export interface TrailPoint {
  lat: number;
  lon: number;
  recordedAt: string;
}

export interface ProviderSnapshot {
  aircraft: Aircraft[];
  receiver: ReceiverPosition;
  fetchedAt: string;
  provider: "readsb" | "mock";
}

export interface StateSnapshot extends ProviderSnapshot {
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
