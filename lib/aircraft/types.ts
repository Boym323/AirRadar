import type { AtcAssignment, AtcFrequencySummary } from "@/lib/atc/types";
import type { Airport } from "@/lib/airports/types";

export type AircraftSource = "ADS-B" | "MLAT" | "TIS-B" | "Mode-S" | "UNKNOWN";
export type AircraftDataOrigin = "local" | "adsblol" | "adsbhub";

export interface AircraftProvenance {
  seenLocal: boolean;
  seenNetwork: boolean;
  lastLocalSeen: string | null;
  lastNetworkSeen: string | null;
  positionOrigin: AircraftDataOrigin | null;
  positionSource: AircraftSource;
  /** Network providers that contributed the current observation. */
  networkSources?: Array<"adsbhub" | "adsblol">;
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
  operator?: string | null;
  manufacturer?: string | null;
  /** Optional fields present in the tar1090/readsb catalog. */
  flags?: string | null;
  year?: string | null;
  source?: string;
  retrievedAt?: string;
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
  source?: string;
  retrievedAt?: string;
}

export interface FlightPlan {
  callsign: string;
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  scheduledArrival: string | null;
  estimatedArrival: string | null;
  filedRoute: string | null;
  waypoints: string[];
  source?: string;
  retrievedAt?: string;
  flightAware?: FlightAwareFlightStatus;
}

export interface FlightAwareFlightStatus {
  ident?: string; identIcao?: string; identIata?: string; faFlightId?: string; flightNumber?: string; atcIdent?: string; type?: string;
  operator?: string; operatorIcao?: string; operatorIata?: string; registration?: string; aircraftType?: string;
  inboundFaFlightId?: string; codeshares?: string[]; codesharesIata?: string[]; status?: string;
  cancelled?: boolean; diverted?: boolean; blocked?: boolean; positionOnly?: boolean; progressPercent?: number;
  origin?: Record<string, unknown>; destination?: Record<string, unknown>; schedule?: Record<string, string>;
  filedEteSeconds?: number; filedAirspeed?: number; filedAltitude?: number; routeDistance?: number;
  departureDelaySeconds?: number; arrivalDelaySeconds?: number;
  operational?: { originTerminal?: string; originGate?: string; departureRunway?: string; destinationTerminal?: string; destinationGate?: string; baggageClaim?: string; arrivalRunway?: string };
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

/** Public aircraft are assembled explicitly by the serializer; this alias
 * keeps existing UI consumers compatible with the shared wire shape. */
export type PublicAircraft = AircraftView;

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

export interface LocalCoverageRatio {
  radiusNm: number;
  numerator: number;
  denominator: number;
  percentage: number | null;
}

export type NetworkProviderStatus =
  | "disabled"
  | "connecting"
  | "disconnected"
  | "degraded"
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
  selectedSource?: "mixed" | "adsbhub" | "adsblol-raw" | "adsblol-http" | "raw" | "http-fallback" | "unavailable";
  beastConnected?: boolean;
  mlatConnected?: boolean;
  beastLastFrameAt?: string | null;
  mlatLastLineAt?: string | null;
  beastFramesReceived?: number;
  beastFramesDecoded?: number;
  beastDecodeErrors?: number;
  mlatLinesReceived?: number;
  mlatLinesParsed?: number;
  mlatParseErrors?: number;
  beastReconnects?: number;
  mlatReconnects?: number;
  reconnects?: number;
  activeInternalTracks?: number;
  publishedAircraftCount?: number;
  adsbPositionCount?: number;
  mlatPositionCount?: number;
  droppedTracks?: number;
  configuredRadiusNm?: number;
  lastSourceTransitionAt?: string | null;
  lastError?: string | null;
  connected?: boolean;
  connectionSince?: string | null;
  lastLineAt?: string | null;
  linesReceived?: number;
  linesParsed?: number;
  malformedLines?: number;
  invalidIcao?: number;
  invalidPosition?: number;
  bytesReceived?: number;
  linesPerSecond?: number;
  stale?: boolean;
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
  sourceStats?: import("@/lib/aircraft/source-awareness").SourceStats;
  localCoverageRatio?: LocalCoverageRatio;
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
