import type { AtcAssignment, AtcFrequencySummary } from "@/lib/atc/types";
import type { Airport } from "@/lib/airports/types";

export type AircraftSource = "ADS-B" | "MLAT" | "TIS-B" | "Mode-S" | "UNKNOWN";
export type AircraftDataOrigin = "local" | "adsblol";

export interface AircraftProvenance {
  seenLocal: boolean;
  seenNetwork: boolean;
  lastLocalSeen: string | null;
  lastNetworkSeen: string | null;
  positionOrigin: AircraftDataOrigin | null;
  positionSource: AircraftSource;
}

export interface ReceiverPosition {
  lat: number;
  lon: number;
  name: string;
}

/** Public receiver coordinates may be intentionally unavailable. */
export interface PublicReceiverPosition {
  lat: number | null;
  lon: number | null;
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
  /** Optional fields present in the tar1090/readsb catalog. */
  flags?: string | null;
  year?: string | null;
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
  /** Observation origin; optional for compatibility with older test fixtures. */
  origin?: AircraftDataOrigin;
  provenance?: AircraftProvenance;
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
  /** Observation values captured at the same time as this trail position. */
  altitude: number | null;
  groundSpeed: number | null;
  track: number | null;
}

export interface ProviderSnapshot {
  aircraft: Aircraft[];
  receiver: ReceiverPosition;
  fetchedAt: string;
  provider: string;
  messagesPerSecond?: number | null;
}

export type CoverageMode = "local" | "extended";

export interface CoverageStats {
  displayedAircraft: number;
  localAircraft: number;
  networkAircraft: number;
  networkOnlyAircraft: number;
  seenByBoth: number;
}

export type NetworkProviderStatus =
  | "disabled"
  | "online"
  | "stale"
  | "timeout"
  | "rate_limited"
  | "http_error"
  | "invalid_response";

export interface NetworkProviderDiagnostics {
  enabled: boolean;
  status: NetworkProviderStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  latencyMs: number | null;
  consecutiveFailures: number;
  aircraftCount: number;
  positionedAircraftCount: number;
  mlatAircraftCount: number;
  radiusNm: number;
  pollIntervalMs: number;
  retryAfterMs: number | null;
}

export interface SourceStatusSnapshot {
  local: {
    online: boolean;
  };
  adsbLol: NetworkProviderDiagnostics;
}

export interface StateSnapshot {
  aircraft: AircraftView[];
  relevantAtcFrequencies: AtcFrequencySummary[];
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
  sources?: SourceStatusSnapshot;
  coverageStats?: CoverageStats;
}

export interface PublicStateSnapshot extends Omit<StateSnapshot, "receiver"> {
  receiver: PublicReceiverPosition;
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

export interface ReceiverStatisticsResponse {
  date: string;
  timezone: string;
  live: {
    aircraftCount: number;
    messagesPerSecond: number | null;
  };
  daily: {
    uniqueAircraft: number;
    maxConcurrentAircraft: number;
    maxDistanceKm: number;
  };
  coverage: ReceiverStatisticsCoverageBucket[];
  coverageSummary: ReceiverStatisticsCoverageSummary;
  topAircraftTypes: Array<{ name: string; count: number }>;
  topAirlines: Array<{ name: string; count: number }>;
}

export interface ReceiverStatisticsCoverageBucket {
  /** The lower bound is inclusive; bearingTo is the existing exclusive upper bound. */
  bearingFrom: number;
  bearingTo: number;
  maxDistanceKm: number;
}

export interface ReceiverStatisticsCoverageSummary {
  maxDistanceKm: number;
  /** Representative whole-degree bearing for the bucket with the maximum. */
  maxBearing: number | null;
  populatedBuckets: number;
  averageDistanceKm: number | null;
  bestDirections: ReceiverStatisticsCoverageBucket[];
}

export interface ReceiverReceptionRecord {
  date: string;
  distanceKm: number;
  icaoHex: string;
  registration: string | null;
  recordedAt: string;
  bearing: number;
}

export type LogbookLabel = "new" | "rare" | "returning";
export type LogbookInterestingReason = LogbookLabel | "record" | "watchlisted" | "emergency";

export interface LogbookInterestingAircraft {
  icaoHex: string;
  labels: LogbookLabel[];
  reasons: LogbookInterestingReason[];
  flightCount: number;
  returningGapDays: number | null;
  isLive: boolean;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  distanceKm: number | null;
}

export interface LogbookSummaryResponse {
  source: "postgres" | "memory" | "unavailable";
  generatedAt: string;
  liveAircraft: number;
  uniqueAircraftToday: number;
  newAircraftToday: number;
  rareAircraftToday: number;
  returningAircraftToday: number;
  watchlistedLiveAircraft: number;
  interestingAircraft: LogbookInterestingAircraft[];
  todayReceptionRecord: ReceiverReceptionRecord | null;
  lifetimeReceptionRecord: ReceiverReceptionRecord | null;
}

export interface RecapRankingItem {
  name: string;
  count: number;
}

export interface RecapRouteItem {
  origin: string;
  destination: string;
  count: number;
}

export interface RecapInterestingItem {
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  reason: LogbookInterestingReason;
}

export interface ReceiverRecapComparison {
  hasData: boolean;
  uniqueAircraft: number | null;
  observedFlights: number | null;
  maxDistanceKm: number | null;
}

export interface ReceiverRecapResponse {
  source: "postgres" | "unavailable";
  range: "daily" | "weekly";
  from: string;
  to: string;
  timezone: string;
  isCurrentDay: boolean;
  hasData: boolean;
  uniqueAircraft: number | null;
  observedFlights: number | null;
  newAircraft: number | null;
  rareOrReturning: number | null;
  maxDistanceKm: number | null;
  coverageKm: number | null;
  topAircraftTypes: RecapRankingItem[];
  topRoutes: RecapRouteItem[];
  interestingAircraft: RecapInterestingItem[];
  bestReception: ReceiverReceptionRecord | null;
  alertCount: number | null;
  comparison: ReceiverRecapComparison | null;
}

export interface ReceiverReceptionRecordsResponse {
  source: "postgres" | "memory" | "unavailable";
  today: ReceiverReceptionRecord | null;
  lifetime: ReceiverReceptionRecord | null;
  top: ReceiverReceptionRecord[];
  historicalRecordCount: number;
}

export type ReceiverStatisticsRange = "7d" | "30d";

export interface ReceiverStatisticsTrendPoint {
  date: string;
  uniqueAircraft: number | null;
  maxConcurrentAircraft: number | null;
  maxDistanceKm: number | null;
}

export interface ReceiverStatisticsCoverageTrendPoint {
  date: string;
  maxDistanceKm: number | null;
}

export interface ReceiverStatisticsRangeData {
  range: ReceiverStatisticsRange;
  days: number;
  from: string;
  to: string;
  hasData: boolean;
  summary: {
    uniqueAircraft: number;
    maxConcurrentAircraft: number;
    maxDistanceKm: number;
  };
  trend: ReceiverStatisticsTrendPoint[];
  coverageTrend: ReceiverStatisticsCoverageTrendPoint[];
  coverageSummary: ReceiverStatisticsCoverageSummary;
}

export interface ReceiverStatisticsComparisonPeriod {
  from: string;
  to: string;
  hasData: boolean;
  uniqueAircraft: number | null;
  maxConcurrentAircraft: number | null;
  maxDistanceKm: number | null;
  coverageMaxDistanceKm: number | null;
}

export interface ReceiverStatisticsComparison {
  current: ReceiverStatisticsComparisonPeriod;
  previous: ReceiverStatisticsComparisonPeriod;
}

export interface ReceiverStatisticsRangeResponse extends ReceiverStatisticsResponse {
  /** Coverage summary for the current local day, used by the range comparison. */
  todayCoverageSummary: ReceiverStatisticsCoverageSummary;
  period: ReceiverStatisticsRangeData;
  comparison: ReceiverStatisticsComparison;
}
