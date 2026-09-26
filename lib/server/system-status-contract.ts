import type { AtcDataResponse } from "@/lib/atc/types";
import type { NetworkProviderDiagnostics, ReceiverStatisticsResponse, StateSnapshot } from "@/lib/aircraft/types";
import type { OgnDdbPersistenceDiagnostics, OgnProviderDiagnostics, OgnProviderStatus } from "@/lib/ogn/types";
import type { HistoryPersistenceStatus } from "@/lib/server/history";
import type { AviationWeatherDiagnostics, SigmetDatasetDiagnostics } from "@/lib/server/aviation-weather-provider";
import type { AviationWeatherPersistenceDiagnostics } from "@/lib/server/aviation-weather-persistence";
import type { AdsbDbPersistenceDiagnostics } from "@/lib/server/adsbdb-persistence";
import type { AlertStatus } from "@/lib/server/alert-engine";
import type { ReceiverStatisticsPersistenceStatus } from "@/lib/server/statistics";
import type { RuntimeDiagnostics } from "@/lib/server/runtime-diagnostics";
import type { WeatherRadarDiagnostics } from "@/lib/server/weather-radar/types";
import type { ReceiverQuality } from "@/lib/server/receiver-quality";
import { defaultWindAloftProvider } from "@/lib/server/wind-aloft";
import { defaultMapContextArchive, defaultWeatherRadarArchive } from "@/lib/server/map-context";

export type SystemStatus = "ok" | "degraded" | "offline" | "disabled";
export type OperationalState = "ok" | "degraded" | "offline" | "disabled" | "on_demand" | "loading";
export type DiagnosticReasonCode =
  | "NOT_INITIALIZED" | "CONFIG_DISABLED" | "FIRST_LOAD_PENDING" | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT" | "RATE_LIMITED" | "STALE_CACHE" | "STALE_DATASET" | "PARTIAL_DATA"
  | "NO_VALID_TIMES" | "NO_CATALOG" | "NO_USABLE_CACHE" | "LAST_REFRESH_FAILED";

export interface DiagnosticState {
  operationalState: OperationalState;
  reasonCode: DiagnosticReasonCode | null;
  reason: string | null;
}

export interface SystemStatusResponse {
  status: SystemStatus;
  checkedAt: string;
  application: {
    status: SystemStatus;
    name: "AirRadar";
    version: string | null;
    commit: string | null;
    buildTime: string | null;
    channel: string;
    uptimeSeconds: number;
    nodeVersion: string;
    nextVersion: string | null;
    environment: "production" | "development";
    timezone: string;
    startedAt: string;
  };
  receiver: {
    status: SystemStatus;
    readsb: {
      status: "ok" | "offline" | "demo";
      online: boolean;
      provider: string;
      sourceStatus: "live" | "demo" | "offline";
      aircraftCount: number;
      messagesPerSecond: number | null;
      lastSnapshot: string | null;
      snapshotAgeSeconds: number | null;
      quality?: ReceiverQuality;
    };
  };
  localAdsb?: Record<string, unknown>;
  adsbLol: {
    status: SystemStatus;
    enabled: boolean;
    endpoint: "Combined feeds" | "Public API" | "Raw BEAST + SBS/MLAT" | "SBS/30003";
    license: "ODbL 1.0";
    radiusNm: number;
    pollIntervalMs: number;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    latencyMs: number | null;
    aircraftCount: number;
    positionedAircraftCount: number;
    mlatAircraftCount: number;
    consecutiveFailures: number;
    rateLimited: boolean;
    retryAfterMs: number | null;
    selectedSource?: "mixed" | "adsbhub" | "adsblol-raw" | "adsblol-http" | "raw" | "http-fallback" | "unavailable";
    beastConnected?: boolean;
    mlatConnected?: boolean;
    beastFramesReceived?: number;
    beastFramesDecoded?: number;
    beastDecodeErrors?: number;
    mlatLinesReceived?: number;
    mlatLinesParsed?: number;
    mlatParseErrors?: number;
    activeInternalTracks?: number;
    publishedAircraftCount?: number;
    adsbPositionCount?: number;
    mlatPositionCount?: number;
    droppedTracks?: number;
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
  };
  adsbdb: {
    status: SystemStatus;
    diagnostic: DiagnosticState;
    enabled: boolean;
    providerStatus: "online" | "degraded" | "offline" | "unknown";
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    consecutiveFailures: number;
    memory: { metadataEntries: number; routeEntries: number };
    persistence: AdsbDbPersistenceDiagnostics;
    hits: { memory: number; persistent: number; live: number; staleFallback: number };
  };
  ogn: {
    status: SystemStatus;
    enabled: boolean;
    providerStatus: OgnProviderStatus;
    host: string;
    port: number;
    radiusKm: number;
    connectedAt: string | null;
    lastActivityAt: string | null;
    lastPacketAt: string | null;
    lastAircraftPacketAt: string | null;
    loginAcknowledged: boolean;
    packets: number;
    positionPackets: number;
    canonicalPositionUpdates: number;
    duplicatePackets: number;
    malformed: number;
    droppedAdsb: number;
    droppedGroundStatus: number;
    droppedStatus: number;
    droppedDelayed: number;
    droppedPrivacy: number;
    droppedDdbUnresolved: number;
    ddbUnresolvable: number;
    droppedStale: number;
    droppedCapacity: number;
    unknownTocall: number;
    sourceCounts: Record<string, number>;
    unknownTocalls: Array<{ tocall: string; count: number }>;
    activeTargets: number;
    freshTargets: number;
    staleTargets: number;
    reconnects: number;
    configurationError: string | null;
    ddb: {
      source: "live" | "cache" | "softrf" | "unavailable";
      status: OgnProviderDiagnostics["ddb"]["status"];
      strategy: OgnProviderDiagnostics["ddb"]["strategy"];
      representation: OgnProviderDiagnostics["ddb"]["representation"];
      mode: OgnProviderDiagnostics["ddb"]["mode"];
      endpoint: string;
      entries: number;
      cacheEntries: number;
      positiveEntries: number;
      negativeEntries: number;
      pendingKeys: number;
      queuedIds: number;
      inFlight: boolean;
      requests: number;
      successfulRequests: number;
      failedRequests: number;
      batchCount: number;
      lastBatchSize: number | null;
      cacheHits: number;
      cacheMisses: number;
      evictions: number;
      unexpectedRecords: number;
      conflictingRecords: number;
      lastAttemptAt: string | null;
      lastRefreshAt: string | null;
      lastSuccessAt: string | null;
      lastPrimarySuccessAt: string | null;
      lastPrimaryError: string | null;
      lastHttpStatus: number | null;
      ageMs: number | null;
      failures: number;
      fallbackCount: number;
      fallbackUsed: boolean;
      rateLimited: boolean;
      retryAfterMs: number | null;
      nextRetryAt: string | null;
      aircraftTypeAvailable: boolean;
      stale: boolean;
      persistence: OgnDdbPersistenceDiagnostics;
      softRf: {
        enabled: boolean;
        valid: boolean;
        recordCount: number;
        ageMs: number | null;
        lastLoadAt: string | null;
        lastLoadError: string | null;
      };
    };
  };
  database: {
    status: "ok" | "offline" | "disabled";
    connected: boolean;
    history: {
      status: SystemStatus;
      lastSuccessfulWrite: string | null;
      retention?: {
        lastRunAt: string | null;
        cutoff: string | null;
        durationMs: number | null;
        rowsDeleted: number;
        batches: number;
        completed: boolean | null;
        failureCount: number;
      };
    };
    statistics: {
      status: SystemStatus;
      lastSuccessfulWrite: string | null;
    };
  };
  statistics: {
    status: SystemStatus;
    date: string;
    timezone: string;
    uniqueAircraftToday: number;
    maxConcurrentToday: number;
    maxDistanceTodayKm: number;
    coverageBucketCount: number;
    coverageBucketsWithData: number;
    coverageStatus: "ok" | "empty";
  };
  atc: {
    status: SystemStatus;
    configured: boolean;
    freshness: "current" | "stale" | "disabled" | "unavailable";
    source: string | null;
    effectiveDate: string | null;
    lastVerifiedAt: string | null;
    sectorCount: number;
    relevantFrequencyCount: number;
    comparison: {
      matching: number | null;
      missing: number | null;
      extra: number | null;
      blocking: number | null;
    };
  };
  weather: {
    status: SystemStatus;
    diagnostic: DiagnosticState;
    providerStatus: AviationWeatherDiagnostics["status"];
    enabled: boolean;
    provider: "AviationWeather";
    cache: {
      status: "warm" | "empty";
      entries: number;
      airports: number;
      memoryEntries: number;
      persistentEnabled: boolean;
      persistentPath: string;
      loadedFromDisk: boolean;
      lastLoadAt: string | null;
      lastLoadError: string | null;
      lastSaveAt: string | null;
      lastSaveError: string | null;
    };
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    latencyMs: number | null;
    requests: number;
    failures: number;
    consecutiveFailures: number;
    cacheHits: number;
    cacheMisses: number;
    activeSigmets: number;
    sigmetStale: boolean;
    sigmetSnapshotAgeMs: number | null;
    sigmet: {
      overallStatus: "online" | "degraded" | "offline";
      international: SigmetDatasetDiagnostics;
      airsigmet: SigmetDatasetDiagnostics;
    };
    metar: { entries: number; staleEntries: number };
    taf: { entries: number; staleEntries: number };
    persistence: AviationWeatherPersistenceDiagnostics;
    retryAfterMs: number | null;
    lastProviderError: null;
  };
  alerts: {
    status: SystemStatus;
    enabled: boolean;
    notifier: string;
    ruleCount: number;
  };
  airportData: {
    status: SystemStatus;
    source: "database" | "fallback" | "unavailable";
    rowCount: number | null;
    fallbackRowCount: number | null;
    bounded: true;
    rowCountIsLowerBound: boolean;
  };
  mapLayers: {
    airports: { state: SystemStatus; count: number; lastSuccessAt: string | null };
    atc: { state: SystemStatus; sectorCount: number; transmitterCount: number; source: string | null; effectiveDate: string | null };
    ats: { state: SystemStatus; routeCount: number; pointCount: number; segmentCount: number; effectiveDate: string | null };
    airspaceActivity: { state: "on_demand"; stale: boolean };
    radar: { state: SystemStatus; diagnostic: DiagnosticState; latestFrameId: string | null; latestObservedAt: string | null; ageMs: number | null; cachedFrames: number; failures: number; consecutiveFailures: number };
    metar: { state: SystemStatus; stations: number; lastSuccessAt: string | null; cacheAgeMs: number | null };
    wind: { state: SystemStatus; diagnostic: DiagnosticState; model: string; modelRun: string | null; availableValidTimes: number; cacheEntries: number; lastSuccessAt: string | null };
    historicalContext: {
      radar: { oldest: string | null; latest: string | null; frames: number; diskBytes: number | null; status: string };
      metar: { oldest: string | null; latest: string | null; entries: number; fileBytes: number | null };
      wind: { oldest: string | null; latest: string | null; entries: number; fileBytes: number | null };
      aup: { oldest: string | null; latest: string | null; entries: number; fileBytes: number | null };
    };
  };
  dataSources: {
    adsbdb: SystemDataSourceStatus;
    aircraftPhotos: SystemDataSourceStatus;
    ourAirports: SystemDataSourceStatus;
  };
  runtime: RuntimeDiagnostics;
}

export interface SystemDataSourceStatus {
  status: SystemStatus;
  diagnostic?: DiagnosticState;
  enabled: boolean;
  provider: string;
  lastSuccessAt: string | null;
  lastError: null;
}

export interface SystemStatusBuildInput {
  snapshot: StateSnapshot;
  statistics: ReceiverStatisticsResponse;
  database: {
    status: "ok" | "offline" | "disabled";
    connected: boolean;
  };
  history: HistoryPersistenceStatus;
  statisticsPersistence: ReceiverStatisticsPersistenceStatus;
  atc: AtcDataResponse;
  alerts: AlertStatus;
  airportData: {
    rowCount: number | null;
    fallbackRowCount: number | null;
    rowCountIsLowerBound?: boolean;
  };
  atsData?: {
    available: boolean;
    routeCount: number;
    pointCount: number;
    segmentCount: number;
    effectiveDate: string | null;
  };
  weather?: Partial<AviationWeatherDiagnostics> & { entries?: number; airports?: number };
  mapContext?: { radar?: WeatherRadarDiagnostics; wind?: ReturnType<typeof defaultWindAloftProvider.diagnostics>; archive?: Awaited<ReturnType<typeof defaultMapContextArchive.diagnostics>>; radarArchive?: Awaited<ReturnType<typeof defaultWeatherRadarArchive.diagnostics>>; };
  adsbLol?: NetworkProviderDiagnostics;
  localAdsb?: Record<string, unknown>;
  adsbdb?: {
    providerStatus: "online" | "degraded" | "offline" | "unknown";
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    consecutiveFailures: number;
    hasAttempted?: boolean;
    memory: { metadataEntries: number; routeEntries: number };
    persistence: AdsbDbPersistenceDiagnostics;
    hits: { memory: number; persistent: number; live: number; staleFallback: number };
  };
  ogn?: OgnProviderDiagnostics;
  now?: Date;
  runtime?: Partial<Pick<SystemStatusResponse["application"], "version" | "commit" | "buildTime" | "channel" | "nodeVersion" | "nextVersion" | "environment" | "timezone">> & {
    uptimeSeconds?: number;
    startedAt?: string;
    diagnostics?: Partial<RuntimeDiagnostics>;
  };
}

export interface SystemStatusServiceLike {
  waitForReady(): Promise<void>;
  getSnapshot(): StateSnapshot;
  getStatistics(): ReceiverStatisticsResponse;
  getStatisticsPersistenceStatus(): ReceiverStatisticsPersistenceStatus;
  getAlertStatus(): AlertStatus;
  getNetworkDiagnostics?(): NetworkProviderDiagnostics;
}
