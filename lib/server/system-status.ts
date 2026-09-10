import nextPackage from "next/package.json" with { type: "json" };
import type { AtcDataResponse } from "@/lib/atc/types";
import type { NetworkProviderDiagnostics, ReceiverStatisticsResponse, StateSnapshot } from "@/lib/aircraft/types";
import { getAppTimezone, isAdsbDbEnabled, isAircraftPhotosEnabled, isAviationWeatherEnabled } from "@/lib/server/config";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getHistoryPersistenceStatus, type HistoryPersistenceStatus } from "@/lib/server/history";
import { getAtcData } from "@/lib/server/providers";
import { getPrisma, isDatabaseConfigured } from "@/lib/server/db";
import { defaultAviationWeatherProvider, type AviationWeatherDiagnostics } from "@/lib/server/aviation-weather-provider";
import type { AlertStatus } from "@/lib/server/alert-engine";
import type { ReceiverStatisticsPersistenceStatus } from "@/lib/server/statistics";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getBuildMetadata } from "@/lib/server/version";
import { readRuntimeDiagnostics, type RuntimeDiagnostics } from "@/lib/server/runtime-diagnostics";

export type SystemStatus = "ok" | "degraded" | "offline" | "disabled";

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
    };
  };
  adsbLol: {
    status: SystemStatus;
    enabled: boolean;
    endpoint: "Public API";
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
  };
  database: {
    status: "ok" | "offline" | "disabled";
    connected: boolean;
    history: {
      status: SystemStatus;
      lastSuccessfulWrite: string | null;
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
    enabled: boolean;
    provider: "AviationWeather";
    cache: {
      status: "warm" | "empty";
      entries: number;
      airports: number;
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
  dataSources: {
    adsbdb: SystemDataSourceStatus;
    aircraftPhotos: SystemDataSourceStatus;
    ourAirports: SystemDataSourceStatus;
  };
  runtime: RuntimeDiagnostics;
}

export interface SystemDataSourceStatus {
  status: SystemStatus;
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
  weather?: Partial<AviationWeatherDiagnostics> & { entries?: number; airports?: number };
  adsbLol?: NetworkProviderDiagnostics;
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

interface DatabaseProbe {
  status: "ok" | "offline" | "disabled";
  connected: boolean;
  airportRowCount: number | null;
  airportRowCountIsLowerBound: boolean;
}

export const AIRPORT_STATUS_QUERY_LIMIT = 10_000;
export const ATC_STATUS_STALE_AFTER_MS = 90 * 24 * 60 * 60_000;

function nonNegativeInteger(value: number, maximum = Number.MAX_SAFE_INTEGER): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.trunc(value))) : 0;
}

function nonNegativeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 80 && /^[a-z0-9_+.-]+$/i.test(trimmed) ? trimmed : fallback;
}

function safeCommitValue(value: string | null | undefined): string | null {
  return value && /^[0-9a-f]{7,64}$/i.test(value.trim()) ? value.trim() : null;
}

function safeVersion(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 32 && /^[a-z0-9._+-]+$/i.test(trimmed) ? trimmed : null;
}

function safeTimezone(value: string | null | undefined, fallback = getAppTimezone()): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 80 || /[\r\n]/.test(trimmed)) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format();
    return trimmed;
  } catch {
    return fallback;
  }
}

function safeDateKey(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "unknown";
}

function applicationRuntime(now: Date, runtime: SystemStatusBuildInput["runtime"]): SystemStatusResponse["application"] {
  const build = getBuildMetadata();
  const uptimeSeconds = nonNegativeNumber(runtime?.uptimeSeconds ?? process.uptime());
  const startedAt = safeTimestamp(runtime?.startedAt) ?? new Date(now.getTime() - uptimeSeconds * 1000).toISOString();
  const version = runtime?.version === undefined ? build.version : runtime.version;
  const commit = runtime?.commit === undefined ? build.shortCommit ?? build.commit : runtime.commit;
  const buildTime = runtime?.buildTime === undefined ? build.buildTime : runtime.buildTime;
  const nextVersion = runtime?.nextVersion === undefined ? (typeof nextPackage.version === "string" ? nextPackage.version : null) : runtime.nextVersion;
  return {
    status: "ok",
    name: "AirRadar",
    version: safeVersion(version),
    commit: safeCommitValue(commit),
    buildTime: safeTimestamp(buildTime),
    channel: safeLabel(runtime?.channel, build.channel),
    uptimeSeconds: Math.min(uptimeSeconds, 31_536_000_000),
    nodeVersion: safeLabel(runtime?.nodeVersion, process.version),
    nextVersion: safeVersion(nextVersion),
    environment: runtime?.environment ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
    timezone: safeTimezone(runtime?.timezone),
    startedAt,
  };
}

function ageSeconds(timestamp: string | null, now: Date): number | null {
  if (!timestamp) return null;
  return nonNegativeInteger((now.getTime() - Date.parse(timestamp)) / 1000, 31_536_000_000);
}

function persistenceStatus(
  databaseStatus: SystemStatusBuildInput["database"]["status"],
  failureCount: number,
  configuredStatus: "ok" | "degraded" | "disabled",
): SystemStatus {
  if (databaseStatus === "offline") return "offline";
  if (databaseStatus === "disabled") return "disabled";
  return failureCount || configuredStatus === "degraded" ? "degraded" : "ok";
}

function atcStatus(
  metadata: AtcDataResponse["metadata"],
  databaseStatus: SystemStatusBuildInput["database"]["status"],
  now: Date,
): Pick<SystemStatusResponse["atc"], "status" | "configured" | "freshness"> {
  const configured = metadata.status === "sample" || metadata.status === "configured";
  if (!configured) {
    return {
      status: metadata.status === "unavailable" && databaseStatus === "offline" ? "offline" : "disabled",
      configured: false,
      freshness: metadata.status === "unavailable" && databaseStatus === "offline" ? "unavailable" : "disabled",
    };
  }
  if (metadata.status === "sample") return { status: "ok", configured: true, freshness: "current" };
  const lastVerified = metadata.lastVerifiedAt ? Date.parse(metadata.lastVerifiedAt) : Number.NaN;
  const current = Number.isFinite(lastVerified) && now.getTime() - lastVerified <= ATC_STATUS_STALE_AFTER_MS;
  return { status: current ? "ok" : "degraded", configured: true, freshness: current ? "current" : "stale" };
}

function configuredSource(enabled: boolean, provider: string, status: SystemStatus = enabled ? "ok" : "disabled"): SystemDataSourceStatus {
  return { status, enabled, provider, lastSuccessAt: null, lastError: null };
}

function adsbLolStatus(diagnostics: NetworkProviderDiagnostics | undefined): SystemStatus {
  if (!diagnostics?.enabled) return "disabled";
  return diagnostics.status === "online" ? "ok" : "degraded";
}

function adsbLolResponse(diagnostics: NetworkProviderDiagnostics | undefined): SystemStatusResponse["adsbLol"] {
  const value = diagnostics ?? {
    enabled: false,
    status: "disabled" as const,
    lastAttemptAt: null,
    lastSuccessAt: null,
    latencyMs: null,
    consecutiveFailures: 0,
    aircraftCount: 0,
    positionedAircraftCount: 0,
    mlatAircraftCount: 0,
    radiusNm: 0,
    pollIntervalMs: 0,
    retryAfterMs: null,
  };
  return {
    status: adsbLolStatus(value),
    enabled: value.enabled,
    endpoint: "Public API",
    license: "ODbL 1.0",
    radiusNm: nonNegativeInteger(value.radiusNm, 250),
    pollIntervalMs: nonNegativeInteger(value.pollIntervalMs, 86_400_000),
    lastAttemptAt: safeTimestamp(value.lastAttemptAt),
    lastSuccessAt: safeTimestamp(value.lastSuccessAt),
    latencyMs: value.latencyMs === null ? null : nonNegativeInteger(value.latencyMs, 86_400_000),
    aircraftCount: nonNegativeInteger(value.aircraftCount, 10_000),
    positionedAircraftCount: nonNegativeInteger(value.positionedAircraftCount, 10_000),
    mlatAircraftCount: nonNegativeInteger(value.mlatAircraftCount, 10_000),
    consecutiveFailures: nonNegativeInteger(value.consecutiveFailures, 1_000_000),
    rateLimited: value.status === "rate_limited",
    retryAfterMs: value.retryAfterMs === null ? null : nonNegativeInteger(value.retryAfterMs, 86_400_000),
  };
}

function weatherStatus(value: SystemStatusBuildInput["weather"]): SystemStatus {
  if (!value) return "disabled";
  if (value?.status === "disabled" || value?.enabled === false) return "disabled";
  if (value?.status === "offline") return "offline";
  if (value?.status === "degraded" || value?.status === "rate_limited") return "degraded";
  return "ok";
}

export function buildSystemStatus(input: SystemStatusBuildInput): SystemStatusResponse {
  const now = input.now ?? new Date();
  const application = applicationRuntime(now, input.runtime);
  const lastSnapshot = safeTimestamp(input.snapshot.lastReadsbUpdate ?? input.snapshot.lastSourceUpdate);
  const provider = safeLabel(input.snapshot.provider, "unknown");
  const isDemo = input.snapshot.provider === "mock";
  const sourceStatus = isDemo ? "demo" : input.snapshot.readsbOnline ? "live" : "offline";
  const receiverStatus: SystemStatus = isDemo || input.snapshot.readsbOnline ? "ok" : "offline";
  const atcFreshness = atcStatus(input.atc.metadata, input.database.status, now);
  const weatherEntries = nonNegativeInteger(input.weather?.entries ?? (input.weather?.metarEntries ?? 0) + (input.weather?.tafEntries ?? 0), 512);
  const weatherAirports = nonNegativeInteger(input.weather?.airports ?? 0, 256);
  const weatherEnabled = input.weather?.enabled ?? input.weather?.entries !== undefined;
  const weatherState = weatherStatus(input.weather);
  const airportRowCount = input.airportData.rowCount === null ? null : nonNegativeInteger(input.airportData.rowCount, AIRPORT_STATUS_QUERY_LIMIT);
  const fallbackRowCount = input.airportData.fallbackRowCount === null ? null : nonNegativeInteger(input.airportData.fallbackRowCount, AIRPORT_STATUS_QUERY_LIMIT);
  const usingDatabaseAirports = airportRowCount !== null && airportRowCount > 0 && !input.airportData.rowCountIsLowerBound;
  const airportSource = usingDatabaseAirports ? "database" : fallbackRowCount !== null ? "fallback" : "unavailable";
  const airportStatus: SystemStatus = airportSource === "unavailable"
    ? "offline"
    : input.database.status === "ok" && airportSource === "fallback" ? "degraded" : "ok";
  const coverageBucketsWithData = input.statistics.coverage.filter((bucket) => Number.isFinite(bucket.maxDistanceKm) && bucket.maxDistanceKm > 0).length;
  const alertsStatus: SystemStatus = input.alerts.status === "ok" ? "ok" : input.alerts.status === "disabled" ? "disabled" : "degraded";
  const historyStatus = persistenceStatus(input.database.status, input.history.failureCount, "ok");
  const statisticsPersistenceStatus = persistenceStatus(input.database.status, input.statisticsPersistence.failureCount, input.statisticsPersistence.status);
  const topLevelStatus: SystemStatus = receiverStatus === "offline"
    || input.database.status === "offline"
    || historyStatus === "degraded"
    || statisticsPersistenceStatus === "degraded"
    || atcFreshness.status === "degraded"
    || airportStatus === "degraded"
    ? "degraded"
    : "ok";

  return {
    status: topLevelStatus,
    checkedAt: now.toISOString(),
    application,
    receiver: {
      status: receiverStatus,
      readsb: {
        status: isDemo ? "demo" : input.snapshot.readsbOnline ? "ok" : "offline",
        online: input.snapshot.readsbOnline && !isDemo,
        provider,
        sourceStatus,
        aircraftCount: nonNegativeInteger(input.snapshot.aircraft.length, 10_000),
        messagesPerSecond: input.snapshot.stats.messagesPerSecond !== null && Number.isFinite(input.snapshot.stats.messagesPerSecond)
          ? nonNegativeNumber(input.snapshot.stats.messagesPerSecond)
          : null,
        lastSnapshot,
        snapshotAgeSeconds: ageSeconds(lastSnapshot, now),
      },
    },
    adsbLol: adsbLolResponse(input.adsbLol),
    database: {
      status: input.database.status,
      connected: input.database.connected,
      history: { status: historyStatus, lastSuccessfulWrite: safeTimestamp(input.history.lastSuccessfulWriteAt) },
      statistics: { status: statisticsPersistenceStatus, lastSuccessfulWrite: safeTimestamp(input.statisticsPersistence.lastSuccessfulWriteAt) },
    },
    statistics: {
      status: input.statisticsPersistence.status === "degraded" ? "degraded" : "ok",
      date: safeDateKey(input.statistics.date),
      timezone: safeTimezone(input.statistics.timezone),
      uniqueAircraftToday: nonNegativeInteger(input.statistics.daily.uniqueAircraft),
      maxConcurrentToday: nonNegativeInteger(input.statistics.daily.maxConcurrentAircraft),
      maxDistanceTodayKm: nonNegativeNumber(input.statistics.daily.maxDistanceKm),
      coverageBucketCount: input.statistics.coverage.length,
      coverageBucketsWithData,
      coverageStatus: coverageBucketsWithData ? "ok" : "empty",
    },
    atc: {
      ...atcFreshness,
      source: input.atc.metadata.source && input.atc.metadata.source.length <= 120 && !/[/:\\=]|password|secret|DATABASE_URL/i.test(input.atc.metadata.source)
        ? input.atc.metadata.source
        : null,
      effectiveDate: safeTimestamp(input.atc.metadata.effectiveDate),
      lastVerifiedAt: safeTimestamp(input.atc.metadata.lastVerifiedAt),
      sectorCount: nonNegativeInteger(input.atc.metadata.sectorCount, 2_000),
      relevantFrequencyCount: nonNegativeInteger(input.snapshot.relevantAtcFrequencies.length, 2_000),
      comparison: { matching: null, missing: null, extra: null, blocking: null },
    },
    weather: {
      status: weatherState,
      enabled: weatherEnabled,
      provider: "AviationWeather",
      cache: { status: weatherEntries ? "warm" : "empty", entries: weatherEntries, airports: weatherAirports },
      lastAttemptAt: safeTimestamp(input.weather?.lastAttemptAt),
      lastSuccessAt: safeTimestamp(input.weather?.lastSuccessAt),
      latencyMs: input.weather?.lastLatencyMs === undefined || input.weather.lastLatencyMs === null ? null : nonNegativeInteger(input.weather.lastLatencyMs, 86_400_000),
      requests: nonNegativeInteger(input.weather?.requests ?? 0, 10_000_000),
      failures: nonNegativeInteger(input.weather?.failures ?? 0, 10_000_000),
      consecutiveFailures: nonNegativeInteger(input.weather?.consecutiveFailures ?? 0, 1_000_000),
      cacheHits: nonNegativeInteger(input.weather?.cacheHits ?? 0, 10_000_000),
      cacheMisses: nonNegativeInteger(input.weather?.cacheMisses ?? 0, 10_000_000),
      activeSigmets: nonNegativeInteger(input.weather?.activeSigmets ?? 0, 10_000),
      sigmetStale: Boolean(input.weather?.sigmetStale),
      retryAfterMs: input.weather?.retryAfterMs === undefined || input.weather.retryAfterMs === null ? null : nonNegativeInteger(input.weather.retryAfterMs, 86_400_000),
      lastProviderError: null,
    },
    alerts: {
      status: alertsStatus,
      enabled: input.alerts.enabled,
      notifier: safeLabel(input.alerts.notifier, "noop"),
      ruleCount: nonNegativeInteger(input.alerts.ruleCount, 10_000),
    },
    airportData: {
      status: airportStatus,
      source: airportSource,
      rowCount: airportRowCount,
      fallbackRowCount,
      bounded: true,
      rowCountIsLowerBound: Boolean(input.airportData.rowCountIsLowerBound),
    },
    dataSources: {
      // These are configuration-safe states. Opening /system never probes an
      // optional upstream provider and therefore exposes no raw error detail.
      adsbdb: configuredSource(isAdsbDbEnabled(), "ADSBDB enrichment"),
      aircraftPhotos: configuredSource(isAircraftPhotosEnabled(), "Planespotters photos"),
      ourAirports: configuredSource(airportSource !== "unavailable", "OurAirports / bundled catalog", airportStatus),
    },
    runtime: readRuntimeDiagnostics(input.runtime?.diagnostics),
  };
}

async function inspectDatabase(): Promise<DatabaseProbe> {
  if (!isDatabaseConfigured()) {
    return { status: "disabled", connected: false, airportRowCount: null, airportRowCountIsLowerBound: false };
  }
  const database = getPrisma();
  if (!database) return { status: "offline", connected: false, airportRowCount: null, airportRowCountIsLowerBound: false };

  try {
    await database.orm.public.Aircraft.select("id").limit(1).all();
  } catch {
    return { status: "offline", connected: false, airportRowCount: null, airportRowCountIsLowerBound: false };
  }

  try {
    const airports = await database.orm.public.Airport.select("id").limit(AIRPORT_STATUS_QUERY_LIMIT + 1).all();
    const lowerBound = airports.length > AIRPORT_STATUS_QUERY_LIMIT;
    return {
      status: "ok",
      connected: true,
      airportRowCount: Math.min(airports.length, AIRPORT_STATUS_QUERY_LIMIT),
      airportRowCountIsLowerBound: lowerBound,
    };
  } catch {
    return { status: "ok", connected: true, airportRowCount: null, airportRowCountIsLowerBound: false };
  }
}

const unavailableAtcData: AtcDataResponse = {
  sectors: [],
  transmitters: [],
  metadata: { status: "unavailable", source: null, sourceReference: null, effectiveDate: null, lastVerifiedAt: null, sectorCount: 0, transmitterCount: 0 },
};

export async function readSystemStatus(service: SystemStatusServiceLike = getAircraftStateService()): Promise<SystemStatusResponse> {
  await service.waitForReady();
  const snapshot = service.getSnapshot();
  const database = await inspectDatabase();
  const atc = database.status === "ok" || snapshot.provider === "mock"
    ? await getAtcData().catch(() => unavailableAtcData)
    : unavailableAtcData;
  const providerWeather = defaultAviationWeatherProvider.getDiagnostics();
  const weather = isAviationWeatherEnabled()
    ? providerWeather
    : { ...providerWeather, enabled: false, status: "disabled" as const };
  const serviceDiagnostics = "getDiagnostics" in service && typeof service.getDiagnostics === "function" ? service.getDiagnostics() : null;
  return buildSystemStatus({
    snapshot,
    statistics: service.getStatistics(),
    database: { status: database.status, connected: database.connected },
    history: getHistoryPersistenceStatus(),
    statisticsPersistence: service.getStatisticsPersistenceStatus(),
    atc,
    alerts: service.getAlertStatus(),
    airportData: {
      rowCount: database.airportRowCount,
      fallbackRowCount: SAMPLE_AIRPORTS.length,
      rowCountIsLowerBound: database.airportRowCountIsLowerBound,
    },
    weather,
    adsbLol: service.getNetworkDiagnostics?.(),
    runtime: {
      diagnostics: serviceDiagnostics ? {
        aircraftCount: serviceDiagnostics.aircraftCount,
        listenerCount: serviceDiagnostics.listenerCount,
        metadataHotCacheSize: serviceDiagnostics.enrichment.metadata?.hotCacheSize ?? null,
        metadataHotCacheLimit: serviceDiagnostics.enrichment.metadata?.hotCacheLimit ?? null,
        metadataCatalogRecordCount: serviceDiagnostics.enrichment.metadata?.catalogRecordCount ?? null,
        metadataFallbackCacheSize: serviceDiagnostics.enrichment.metadata?.fallbackCacheSize ?? null,
        metadataFallbackCacheLimit: serviceDiagnostics.enrichment.metadata?.fallbackCacheLimit ?? null,
        metadataFallbackCacheBytes: serviceDiagnostics.enrichment.metadata?.fallbackCacheBytes ?? null,
        metadataFallbackCacheBytesLimit: serviceDiagnostics.enrichment.metadata?.fallbackCacheBytesLimit ?? null,
        providerCacheEntries: serviceDiagnostics.enrichment.providerCacheEntries,
        providerCacheLimit: serviceDiagnostics.enrichment.providerCacheLimit,
      } : undefined,
    },
  });
}
