import type { Aircraft, AircraftEnrichment, CoverageMode, ProviderSnapshot, ReceiverStatisticsRange, ReceiverStatisticsRangeResponse, ReceiverStatisticsResponse, StateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import {
  getAircraftStaleAfterMs,
  getAdsbLolStaleAfterMs,
  getAircraftMassDropMinBaseline,
  getAircraftMassDropRatio,
  getAircraftReappearWindowMs,
  getHistorySampleIntervalMs,
  getMaxProviderRetryIntervalMs,
  getPollIntervalMs,
  getReceiverPosition,
  getNetworkTrailMaxAgeMs,
  getNetworkTrailMaxPoints,
  getReceiverComparisonRadiusNm,
  getSourceAffinityFailoverGraceMs,
  isAircraftMassDropGuardEnabled,
  isAtcResolutionEnabled,
  isAtcShadowPredictionEnabled,
} from "@/lib/server/config";
import { recordAircraftSnapshot } from "@/lib/server/history";
export { predictivePhase, isAirportProximity, buildPredictiveShadowInput } from "@/lib/server/aircraft-predictive-projection";
import { AircraftContinuityGuard, type AircraftContinuityOrigin, type AircraftMassDropDecision } from "@/lib/server/aircraft-continuity";
import { createAircraftProvider, createEnrichmentService, createNetworkAircraftProvider } from "@/lib/server/providers";
import type { EnrichmentService } from "@/lib/server/enrichment-cache";
import type { AircraftProvider, NetworkAircraftProvider, NetworkAircraftSnapshot } from "@/lib/server/provider";
import { assignmentFromMatch, AtcSectorService, summarizeRelevantAtcFrequencies } from "@/lib/server/atc-sector-service";
import { createAtcSectorProvider } from "@/lib/server/providers";
import { AlertEngine } from "@/lib/server/alert-engine";
import type { AlertStatus } from "@/lib/server/alert-engine";
import { loadAlertConfig } from "@/lib/server/alert-config";
import { ReceiverStatistics, type ReceiverDailyReceptionRecord, type ReceiverStatisticsPersistenceStatus } from "@/lib/server/statistics";
import { getReceptionRecords } from "@/lib/server/reception-records";
import { coverageStats, mergeAircraftMaps, mergeAircraftObservations } from "@/lib/aircraft/source-merge";
import { computeLocalCoverageRatioFromSources, computeSourceStats } from "@/lib/aircraft/source-awareness";
import { getFlightIntelligenceService, type FlightIntelligenceService } from "@/lib/server/flight-intelligence";
import { getAlertDeliveryWorker } from "@/lib/server/alert-delivery-worker";
import { haversineDistanceKm } from "@/lib/geo";
import { logger } from "@/lib/server/logger";
import { getRuntimePerformanceDiagnostics, measureRuntime, measureRuntimeAsync } from "@/lib/server/runtime-performance";
import { classifyAtcPrediction, getAtcPredictionValidation } from "@/lib/server/atc-prediction-validation";
import { computeAtcContext, inputFromAircraft, loadAtcContextDataset } from "@/lib/atc-context/engine";
import { ReceiverCoverageAnalytics, type CoverageResponse } from "@/lib/server/receiver-coverage-analytics";
import { appendBoundedNetworkTrailPoint, appendBoundedServerTrailPoint, trailPointFromAircraft, SERVER_LOCAL_TRAIL_MAX_POINTS } from "@/lib/aircraft/trail";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { getAltitudeDiagnostics } from "@/lib/aircraft/altitude-provenance";
import { aircraftIconNeedsInitialMetadata } from "@/lib/aircraft/icon-classification";
import { flushAircraftWeatherPersistence, persistAircraftWeatherObservations } from "@/lib/server/aircraft-weather";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { getDestinationProvenanceDiagnostics } from "@/lib/server/destination-provenance";
import { PredictiveStateStore } from "@/lib/predictive-intelligence";
import { OperationalTwinEventOutcomeValidator, OperationalTwinOutcomeValidator, OperationalTwinTrajectoryQualityOutcomeValidator, OperationalTwinTrajectoryQualityOutcomeV2Validator, OperationalTwinTruthFirstValidator, RegionalAttentionOutcomeValidator, buildOperationalTwinTrajectoryQualityGraduation, buildOperationalTwinTrajectoryQualityV3Graduation, buildRegionalAttentionGraduation, type OperationalTwinEventOutcomeCaptureContext, type OperationalTwinSituation, type OperationalTwinTruthObservationContext } from "@/lib/operational-twin";
import type { OperationalAttentionSummary } from "@/lib/operational-twin/operational-attention";
import { AircraftOperationalFocusOutcomeValidator } from "@/lib/operational-twin/aircraft-operational-focus-outcome";
import { OperationalTwinCalibrationPersistence } from "@/lib/server/operational-twin-calibration-persistence";
import { getMemoryRetentionDiagnostics, type MemoryRetentionDiagnostics } from "@/lib/server/memory-retention-diagnostics";
import { mapBounded, mapSettledBounded } from "@/lib/server/bounded-batch";
import { historyAircraftForSnapshot } from "@/lib/server/history-aircraft-payload";

type Listener = { callback: (snapshot: StateSnapshot) => void; coverage: CoverageMode };

// Receiver/MLAT glitches can report a valid-looking coordinate hundreds of
// kilometres away. Keep those points out of the live map and trail. The limit
// is intentionally generous for fast airliners and long polling gaps.
const MAX_PLAUSIBLE_GROUND_SPEED_KT = 900;
const MIN_POSITION_STEP_KM = 25;

function plausiblePosition(previous: Aircraft | undefined, incoming: Aircraft): Aircraft {
  if (!previous || incoming.lat === null || incoming.lon === null) return incoming;
  const previousPoint = previous.trail[previous.trail.length - 1];
  if (!previousPoint) return incoming;
  const incomingAt = positionObservedAt(incoming);
  const previousAt = Date.parse(previousPoint.recordedAt);
  if (incomingAt === null || !Number.isFinite(previousAt) || incomingAt <= previousAt) return incoming;
  const distanceKm = haversineDistanceKm(previousPoint.lat, previousPoint.lon, incoming.lat, incoming.lon);
  const elapsedHours = (incomingAt - previousAt) / 3_600_000;
  const maximumKm = Math.max(MIN_POSITION_STEP_KM, MAX_PLAUSIBLE_GROUND_SPEED_KT * 1.852 * elapsedHours * 1.5);
  if (distanceKm <= maximumKm) return incoming;

  // Do not publish an old coordinate as the newest observation. A rejected
  // point must be positionless until a subsequent credible position arrives;
  // retaining the previous latitude/longitude makes a stale marker look live.
  return {
    ...incoming,
    lat: null,
    lon: null,
    seenPosSeconds: null,
    distanceKm: null,
    bearing: null,
    provenance: {
      seenLocal: incoming.provenance?.seenLocal ?? incoming.origin === "local",
      seenNetwork: incoming.provenance?.seenNetwork ?? incoming.origin === "adsblol",
      lastLocalSeen: incoming.provenance?.lastLocalSeen ?? (incoming.origin === "local" ? incoming.lastSeen : null),
      lastNetworkSeen: incoming.provenance?.lastNetworkSeen ?? (incoming.origin === "adsblol" ? incoming.lastSeen : null),
      positionOrigin: null,
      positionSource: incoming.provenance?.positionSource ?? incoming.source,
    },
  };
}

function mergeEnrichment(
  previous: AircraftEnrichment | undefined,
  incoming: AircraftEnrichment | undefined,
  sameCallsign: boolean,
): AircraftEnrichment | undefined {
  const merged: AircraftEnrichment = {};
  const metadata = previous?.metadata ?? incoming?.metadata;
  const route = sameCallsign ? incoming?.route ?? previous?.route : incoming?.route;
  const flightPlan = sameCallsign ? incoming?.flightPlan ?? previous?.flightPlan : incoming?.flightPlan;
  if (metadata) merged.metadata = metadata;
  if (route) merged.route = route;
  if (flightPlan) merged.flightPlan = flightPlan;
  return Object.keys(merged).length ? merged : undefined;
}

function atcResolutionKey(aircraft: Pick<Aircraft, "lat" | "lon" | "altitude">): string | null {
  const lat = aircraft.lat;
  const lon = aircraft.lon;
  if (typeof lat !== "number" || !Number.isFinite(lat) || typeof lon !== "number" || !Number.isFinite(lon)) return null;
  const altitude = typeof aircraft.altitude === "number" && Number.isFinite(aircraft.altitude) ? aircraft.altitude : null;
  return `${lat.toFixed(2)}:${lon.toFixed(2)}:${altitude === null ? "unknown" : Math.round(altitude / 1000)}`;
}

const ATC_RESOLUTION_BATCH_SIZE = 12;
// Bounded tasks on top of the providers' own stricter HTTP/DB concurrency limits.
const ENRICHMENT_WORKER_LIMIT = 24;
const ATC_SHADOW_PREDICTION_CONCURRENCY = 2;
const ATC_SHADOW_PREDICTION_MAX_PENDING = 512;
type AtcShadowPredictionWork = {
  aircraft: Aircraft;
  currentSector: string | null;
  resolutionKey: string;
  generation: number;
};

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export class AircraftStateService {
  private readonly provider: AircraftProvider;
  private readonly networkProvider: NetworkAircraftProvider;
  private readonly localAircraft = new Map<string, Aircraft>();
  /** Compatibility alias for local-only internals and existing tests. */
  private readonly aircraft = this.localAircraft;
  private readonly networkAircraft = new Map<string, Aircraft>();
  /**
   * Latest successful provider membership per source. These sets deliberately
   * differ from the retained maps: a missing aircraft may remain visible for
   * its stale/grace window while source-affinity failover is already timing.
   */
  private localObservedHexes = new Set<string>();
  private networkObservedHexes = new Set<string>();
  /** Identity-level source affinity prevents local/network hand-offs for one ICAO. */
  private readonly sourcePreferences = new Map<string, "local" | "network">();
  /** Start of a preferred-source outage while the alternate observation remains live. */
  private readonly sourcePreferenceMissingSince = new Map<string, number>();
  private readonly continuity = new AircraftContinuityGuard();
  /** Request + bounded refresh-sampled Operational Digital Twin calibration against future LOCAL receiver truth. */
  private readonly operationalTwinOutcome = new OperationalTwinOutcomeValidator();
  /** Predicted Digital Twin event timing/precision validation against independent live evidence. */
  private readonly operationalTwinEventOutcome = new OperationalTwinEventOutcomeValidator();
  /** Canonical-vs-Trajectory Quality V2 vertical outcome validation against future LOCAL truth. */
  private readonly operationalTwinTrajectoryQualityOutcome = new OperationalTwinTrajectoryQualityOutcomeValidator();
  /** Triple-paired canonical-vs-V2-vs-V3 vertical outcome validation against the same future LOCAL truth. */
  private readonly operationalTwinTrajectoryQualityOutcomeV2 = new OperationalTwinTrajectoryQualityOutcomeV2Validator();
  /** Final Aircraft Operational Focus validation against later independent LOCAL SIGMET truth where scoreable. */
  private readonly operationalFocusOutcome = new AircraftOperationalFocusOutcomeValidator();
  /** Truth-first multi-domain recall validation from independent later observations. */
  private readonly operationalTwinTruthFirst = new OperationalTwinTruthFirstValidator();
  /** Prospective Regional Attention validation against future LOCAL pair state. */
  private readonly regionalAttentionOutcome = new RegionalAttentionOutcomeValidator();
  /** PostgreSQL persistence for anonymous completed five-minute calibration aggregates only. */
  private readonly operationalTwinCalibrationPersistence = new OperationalTwinCalibrationPersistence(
    this.operationalTwinOutcome,
    this.operationalTwinEventOutcome,
    this.operationalTwinTrajectoryQualityOutcome,
    this.operationalTwinTrajectoryQualityOutcomeV2,
    this.regionalAttentionOutcome,
  );
  private readonly lastHistorySample = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private messagesPerSecond: number | null = null;
  private lastSourceUpdate: string | null = null;
  private lastError: string | null = null;
  private running = false;
  private refreshing = false;
  private networkRefreshing = false;
  private networkMetadataRefreshing = false;
  // Optional provider work must not accumulate unbounded promises as local
  // snapshot polls continue. Ingest, history and flight positions never wait.
  private localMetadataRefreshing = false;
  private localEnrichmentRefreshing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private networkTimer: ReturnType<typeof setTimeout> | null = null;
  private initialRefresh: Promise<void> | null = null;
  private statisticsReady: Promise<void> | null = null;
  private consecutiveFailures = 0;
  private historyWriteActive = false;
  private pendingHistorySnapshot: ProviderSnapshot | null = null;
  private historyDrainPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private readonly enrichment: EnrichmentService;
  private readonly atc: AtcSectorService;
  private readonly alerts: AlertEngine;
  private readonly intelligence = getFlightIntelligenceService();
  /** Shadow-only predictive state; never serialized into radar SSE frames. */
  private readonly predictive = new PredictiveStateStore();
  private readonly statistics: ReceiverStatistics;
  private readonly receiverCoverage = new ReceiverCoverageAnalytics();
  private readonly navigationIntegrity = getNavigationIntegrityService();
  private readonly atcResolutionKeys = new Map<string, string>();
  private readonly atcShadowPredictionKeys = new Map<string, string>();
  private readonly atcShadowPredictionInFlight = new Set<string>();
  private readonly pendingAtcShadowPredictions = new Map<string, AtcShadowPredictionWork>();
  private readonly atcShadowPredictionGenerations = new Map<string, number>();
  private atcShadowPredictionRunning = 0;
  /** Tracks the last enabled state so disabled-mode cleanup is transition-based. */
  private atcResolutionStateActive = false;
  private atcResolutionInFlight = false;
  /** Latest-wins handoff. A slow resolution never creates a backlog of snapshots. */
  private pendingAtcResolutionSnapshot: ProviderSnapshot | null = null;
  private atcResolutionDrain: Promise<void> | null = null;
  private atcResolutionFirstCallSettled = false;
  private lifetimeReceptionRecord: ReceiverDailyReceptionRecord | null = null;
  private lifetimeReceptionRecordLoaded = false;
  private lastEvaluatedDailyReceptionRecord: ReceiverDailyReceptionRecord | null = null;
  private receptionEvaluationPending = false;
  private networkStopPromise: Promise<void> | null = null;
  private snapshotVersion = 0;
  private readonly snapshotCache = new Map<string, { version: number; snapshot: StateSnapshot }>();
  private readonly snapshotBuildCounts: Record<CoverageMode, number> = { local: 0, extended: 0 };

  constructor(
    provider: AircraftProvider = createAircraftProvider(),
    enrichment: EnrichmentService = createEnrichmentService(),
    atc: AtcSectorService = new AtcSectorService(createAtcSectorProvider()),
    alerts: AlertEngine = new AlertEngine(),
    statistics: ReceiverStatistics = new ReceiverStatistics(),
    networkProvider: NetworkAircraftProvider = createNetworkAircraftProvider(),
  ) {
    this.provider = provider;
    this.enrichment = enrichment;
    this.atc = atc;
    this.alerts = alerts;
    this.statistics = statistics;
    this.networkProvider = networkProvider;
  }

  start(): void {
    if (this.running || this.shuttingDown) return;
    this.running = true;
    getAlertDeliveryWorker().start();
    this.networkProvider.start();
    this.statisticsReady = this.statistics.load()
      .catch((error) => {
        // Statistics are optional; a load failure must not prevent the first
        // live provider refresh.
        logger.error({ error }, "AirRadar statistics startup failed");
      })
      .then(() => {
        this.lastEvaluatedDailyReceptionRecord = this.statistics.getDailyReceptionRecord();
        this.scheduleReceptionRecordEvaluation();
      });
    void this.loadLifetimeReceptionRecord();
    const calibrationReady = this.operationalTwinCalibrationPersistence.load()
      .catch((error) => {
        // Calibration persistence is optional; live radar and Digital Twin
        // must continue from fresh process-local evidence on any DB failure.
        logger.warn({ error }, "Operational Digital Twin calibration hydration skipped");
      });
    const refresh = calibrationReady.then(() => this.refresh());
    this.initialRefresh = Promise.all([this.statisticsReady, calibrationReady, refresh]).then(() => undefined);
    void this.refreshNetwork();
    this.receiverCoverage.start(() => ({
      network: [...this.networkAircraft.values()], local: this.localAircraft, receiver: this.currentReceiver,
      localHealthy: this.lastSourceUpdate !== null && this.lastError === null,
      providerDiagnostics: this.networkProvider.getDiagnostics(),
    }));
  }

  async waitForReady(): Promise<void> {
    this.start();
    await this.initialRefresh;
  }

  async stop(options: { deadline?: number; closeStatistics?: boolean; closeProvider?: boolean } = {}): Promise<void> {
    this.shuttingDown = true;
    this.pendingAtcShadowPredictions.clear();
    await getAlertDeliveryWorker().stop();
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.networkTimer) clearTimeout(this.networkTimer);
    this.networkTimer = null;
    this.provider.abort?.();
    const networkStop = this.stopNetworkProvider();
    const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
    await this.awaitUntil(this.initialRefresh, deadline);
    await this.awaitUntil(networkStop, deadline);
    await this.awaitUntil(this.drainHistory(), deadline);
    await this.awaitUntil(this.predictive.flushProspective(), deadline);
    await this.awaitUntil(this.operationalTwinCalibrationPersistence.stop(), deadline);
    // Weather coalescing is intentionally lossy on crashes, but a normal
    // restart gets a bounded best-effort flush of representative samples.
    await this.awaitUntil(flushAircraftWeatherPersistence(deadline), deadline);
    await this.awaitUntil(this.receiverCoverage.stop(), deadline);
    if (options.closeStatistics !== false) await this.awaitUntil(this.statistics.close(), deadline);
    if (options.closeProvider !== false) await this.awaitUntil(this.closeProviders(), deadline);
  }

  async closeStatistics(): Promise<void> { await this.statistics.close(); }

  async closeProvider(): Promise<void> { await this.closeProviders(); }

  private async closeProviders(): Promise<void> {
    try {
      await this.provider.close?.();
    } finally {
      try {
        await this.stopNetworkProvider();
      } finally {
        await this.enrichment.close();
      }
    }
  }

  private stopNetworkProvider(): Promise<void> {
    this.networkStopPromise ??= this.networkProvider.stop();
    return this.networkStopPromise;
  }

  private async awaitUntil<T>(promise: Promise<T> | void | null, deadline: number): Promise<void> {
    if (!promise) return;
    if (!Number.isFinite(deadline)) {
      await promise;
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        Promise.resolve(promise).then(() => undefined),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, remaining); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  subscribe(listener: (snapshot: StateSnapshot) => void, options: { coverage?: CoverageMode } = {}): () => void {
    this.start();
    const entry: Listener = { callback: listener, coverage: options.coverage ?? "local" };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  getSnapshot(options: { coverage?: CoverageMode; includeTrails?: boolean } = {}): StateSnapshot {
    const coverage = options.coverage ?? "local";
    const includeTrails = options.includeTrails === true;
    const cacheKey = `${coverage}:${includeTrails ? "trails" : "compact"}`;
    const cached = this.snapshotCache.get(cacheKey);
    if (cached?.version === this.snapshotVersion) return cached.snapshot;

    const snapshot = this.buildSnapshot(coverage, includeTrails);
    this.snapshotCache.set(cacheKey, { version: this.snapshotVersion, snapshot });
    return snapshot;
  }

  /**
   * Exposes bounded counters for diagnostics and performance tests. The
   * counters count snapshot construction, not callers of getSnapshot().
   */
  getSnapshotCacheDiagnostics(): {
    version: number;
    cachedSnapshots: number;
    builds: Record<CoverageMode, number>;
  } {
    return {
      version: this.snapshotVersion,
      cachedSnapshots: this.snapshotCache.size,
      builds: { ...this.snapshotBuildCounts },
    };
  }

  private buildSnapshot(coverage: CoverageMode, includeTrails: boolean): StateSnapshot {
    return measureRuntime("snapshot.serialization", coverage === "extended" ? this.localAircraft.size + this.networkAircraft.size : this.localAircraft.size, () => this.buildSnapshotCore(coverage, includeTrails));
  }

  private buildSnapshotCore(coverage: CoverageMode, includeTrails: boolean): StateSnapshot {
    this.snapshotBuildCounts[coverage] += 1;
    const aircraft = (coverage === "extended"
      ? measureRuntime("snapshot.source-merge", this.localAircraft.size + this.networkAircraft.size, () => mergeAircraftMaps(this.localAircraft, this.networkAircraft, this.currentReceiver, {
          localStaleAfterMs: getAircraftStaleAfterMs(),
          networkStaleAfterMs: getAdsbLolStaleAfterMs(),
          sourcePreferences: this.sourcePreferences,
        }))
      : Array.from(this.localAircraft.values()))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .map((item) => {
        if (includeTrails) return { ...item, trail: item.trail.slice() };
        return { ...item, trail: undefined };
      });
    const displayedCoverageStats = coverage === "extended"
      ? coverageStats(this.localAircraft, this.networkAircraft, aircraft.length)
      : {
          displayedAircraft: aircraft.length,
          localAircraft: this.localAircraft.size,
          networkAircraft: 0,
          networkOnlyAircraft: 0,
          seenByBoth: 0,
      };
    const sourceStats = computeSourceStats(aircraft);
    return {
      aircraft,
      relevantAtcFrequencies: summarizeRelevantAtcFrequencies(aircraft.map((item) => ({
        aircraftId: item.icaoHex,
        label: item.callsign ?? item.registration ?? item.icaoHex,
        assignment: item.atc,
      }))),
      receiver: this.currentReceiver,
      fetchedAt: this.lastSourceUpdate ?? new Date().toISOString(),
      provider: this.provider.name,
      sourceOnline: this.lastSourceUpdate !== null && this.lastError === null,
      lastSourceUpdate: this.lastSourceUpdate,
      sourceError: this.lastError,
      readsbOnline: this.lastSourceUpdate !== null && this.lastError === null,
      lastReadsbUpdate: this.lastSourceUpdate,
      lastError: this.lastError,
      stats: this.statistics.getRadarStats(this.localAircraft.size, this.messagesPerSecond),
      sources: {
        local: { online: this.lastSourceUpdate !== null && this.lastError === null },
        adsbLol: this.networkProvider.getDiagnostics(),
      },
      coverageStats: displayedCoverageStats,
      sourceStats,
      localCoverageRatio: coverage === "extended"
        ? computeLocalCoverageRatioFromSources(
            this.networkAircraft,
            this.localAircraft,
            this.currentReceiver,
            getReceiverComparisonRadiusNm(),
            Date.now(),
            getAdsbLolStaleAfterMs(),
            getAircraftStaleAfterMs(),
          )
        : undefined,
    };
  }

  private invalidateSnapshotCache(): void {
    this.snapshotVersion += 1;
    this.snapshotCache.clear();
  }

  getProviderName(): string {
    return this.provider.name;
  }

  getDiagnostics(): {
    aircraftCount: number;
    localTrailAircraftCount: number;
    networkTrailAircraftCount: number;
    localTrailPointCount: number;
    networkTrailPointCount: number;
    localTrailMaxPointsPerAircraft: number;
    networkTrailMaxPointsPerAircraft: number;
    localTrailAtLimitAircraftCount: number;
    networkTrailAtLimitAircraftCount: number;
    localTrailOverLimitAircraftCount: number;
    networkTrailOverLimitAircraftCount: number;
    trailEstimatedBytes: number;
    listenerCount: number;
    running: boolean;
    enrichment: ReturnType<EnrichmentService["getDiagnostics"]>;
    network: ReturnType<NetworkAircraftProvider["getDiagnostics"]>;
    local: ReturnType<NonNullable<AircraftProvider["getDiagnostics"]>> | null;
    coverageAnalytics: ReturnType<ReceiverCoverageAnalytics["getDiagnostics"]>;
    altitudeDiagnostics: ReturnType<typeof getAltitudeDiagnostics>;
    predictiveIntelligence: ReturnType<PredictiveStateStore["diagnostics"]>;
    flightIntelligence: ReturnType<FlightIntelligenceService["getDiagnostics"]>;
    destinationProvenance: ReturnType<typeof getDestinationProvenanceDiagnostics>;
    continuity: ReturnType<AircraftContinuityGuard["diagnostics"]>;
    operationalTwinOutcome: ReturnType<OperationalTwinOutcomeValidator["report"]>;
    operationalTwinEventOutcome: ReturnType<OperationalTwinEventOutcomeValidator["report"]>;
    operationalTwinTrajectoryQualityOutcome: ReturnType<OperationalTwinTrajectoryQualityOutcomeValidator["report"]>;
    operationalTwinTrajectoryQualityOutcomeV2: ReturnType<OperationalTwinTrajectoryQualityOutcomeV2Validator["report"]>;
    operationalTwinTrajectoryQualityGraduation: ReturnType<typeof buildOperationalTwinTrajectoryQualityGraduation>;
    operationalTwinTrajectoryQualityV3Graduation: ReturnType<typeof buildOperationalTwinTrajectoryQualityV3Graduation>;
    operationalFocusOutcome: ReturnType<AircraftOperationalFocusOutcomeValidator["report"]>;
    regionalAttentionOutcome: ReturnType<RegionalAttentionOutcomeValidator["report"]>;
    regionalAttentionGraduation: ReturnType<typeof buildRegionalAttentionGraduation>;
    operationalTwinCalibrationPersistence: ReturnType<OperationalTwinCalibrationPersistence["getStatus"]>;
    runtimePerformance: ReturnType<typeof getRuntimePerformanceDiagnostics>;
    retentionAttribution: MemoryRetentionDiagnostics;
  } {
    const now = new Date();
    // Reuse the same bounded outcome snapshot for each corresponding
    // graduation decision rather than aggregating three validators twice.
    const trajectoryOutcome = this.getOperationalTwinTrajectoryQualityOutcomeReport(now);
    const trajectoryOutcomeV2 = this.getOperationalTwinTrajectoryQualityOutcomeV2Report(now);
    const regionalAttentionOutcome = this.getRegionalAttentionOutcomeReport(now);
    const { limitCounters, ...retentionAttribution } = getMemoryRetentionDiagnostics({
        localAircraft: this.localAircraft,
        localTrailLimitPoints: SERVER_LOCAL_TRAIL_MAX_POINTS,
        networkAircraft: this.networkAircraft,
        networkTrailLimitPoints: getNetworkTrailMaxPoints(),
        localStaleAfterMs: getAircraftStaleAfterMs(),
        networkStaleAfterMs: getAdsbLolStaleAfterMs(),
        networkTrailMaxAgeMs: getNetworkTrailMaxAgeMs(),
        sourcePreferences: this.sourcePreferences,
        sourcePreferenceMissingSince: this.sourcePreferenceMissingSince,
        lastHistorySample: this.lastHistorySample,
        predictiveEvaluatedAt: new Map<string, number>(),
        atcResolutionKeys: this.atcResolutionKeys,
        atcShadowPredictionKeys: this.atcShadowPredictionKeys,
        snapshotCacheEntries: this.snapshotCache.size,
        listeners: this.listeners.size,
    });
    return {
      aircraftCount: this.aircraft.size,
      localTrailAircraftCount: this.localAircraft.size,
      networkTrailAircraftCount: this.networkAircraft.size,
      localTrailPointCount: retentionAttribution.trails.local.points,
      networkTrailPointCount: retentionAttribution.trails.network.points,
      localTrailMaxPointsPerAircraft: retentionAttribution.trails.local.maxPointsPerAircraft,
      networkTrailMaxPointsPerAircraft: retentionAttribution.trails.network.maxPointsPerAircraft,
      localTrailAtLimitAircraftCount: limitCounters?.local.atLimitAircraftCount ?? 0,
      networkTrailAtLimitAircraftCount: limitCounters?.network.atLimitAircraftCount ?? 0,
      localTrailOverLimitAircraftCount: limitCounters?.local.overLimitAircraftCount ?? 0,
      networkTrailOverLimitAircraftCount: limitCounters?.network.overLimitAircraftCount ?? 0,
      // Practical estimate for one retained TrailPoint including V8 object/array overhead.
      trailEstimatedBytes: (retentionAttribution.trails.local.points + retentionAttribution.trails.network.points) * 96,
      listenerCount: this.listeners.size,
      running: this.running,
      enrichment: this.enrichment.getDiagnostics(),
      network: this.networkProvider.getDiagnostics(),
      local: "getDiagnostics" in this.provider && typeof this.provider.getDiagnostics === "function" ? this.provider.getDiagnostics() : null,
      coverageAnalytics: this.receiverCoverage.getDiagnostics(),
      altitudeDiagnostics: getAltitudeDiagnostics(),
      predictiveIntelligence: this.predictive.diagnostics(),
      flightIntelligence: this.intelligence.getDiagnostics(),
      destinationProvenance: getDestinationProvenanceDiagnostics(),
      continuity: this.continuity.diagnostics({
        localObserved: this.localObservedHexes.size,
        localRetained: this.localAircraft.size,
        networkObserved: this.networkObservedHexes.size,
        networkRetained: this.networkAircraft.size,
        pendingAffinity: this.sourcePreferenceMissingSince.size,
      }),
      operationalTwinOutcome: this.getOperationalTwinOutcomeReport(),
      operationalTwinEventOutcome: this.getOperationalTwinEventOutcomeReport(),
      operationalTwinTrajectoryQualityOutcome: trajectoryOutcome,
      operationalTwinTrajectoryQualityOutcomeV2: trajectoryOutcomeV2,
      operationalTwinTrajectoryQualityGraduation: buildOperationalTwinTrajectoryQualityGraduation(trajectoryOutcome),
      operationalTwinTrajectoryQualityV3Graduation: buildOperationalTwinTrajectoryQualityV3Graduation(trajectoryOutcomeV2),
      operationalFocusOutcome: this.getOperationalFocusOutcomeReport(),
      regionalAttentionOutcome,
      regionalAttentionGraduation: buildRegionalAttentionGraduation(regionalAttentionOutcome),
      operationalTwinCalibrationPersistence: this.operationalTwinCalibrationPersistence.getStatus(),
      runtimePerformance: getRuntimePerformanceDiagnostics(),
      retentionAttribution,
    };
  }

  getAlertStatus(): AlertStatus {
    return this.alerts.getStatus();
  }

  reloadAlertConfig(): void {
    this.alerts.reload(loadAlertConfig());
  }

  getStatistics(): ReceiverStatisticsResponse {
    return this.statistics.getResponse(this.localAircraft.size, this.messagesPerSecond);
  }

  getStatisticsPersistenceStatus(): ReceiverStatisticsPersistenceStatus {
    return this.statistics.getPersistenceStatus();
  }

  getDailyReceptionRecord(): ReceiverDailyReceptionRecord | null {
    return this.statistics.getDailyReceptionRecord();
  }

  getStatisticsCurrentDaySnapshot() {
    return this.statistics.getCurrentDaySnapshot();
  }

  async getStatisticsRange(range: ReceiverStatisticsRange): Promise<ReceiverStatisticsRangeResponse> {
    return this.statistics.getRangeResponse(this.localAircraft.size, this.messagesPerSecond, range);
  }

  getAircraft(icaoHex: string, coverage: CoverageMode = "local"): Aircraft | null {
    const normalized = icaoHex.toUpperCase();
    if (coverage === "local") return this.localAircraft.get(normalized) ?? null;
    return mergeAircraftObservations(this.localAircraft.get(normalized), this.networkAircraft.get(normalized), this.currentReceiver, {
      localStaleAfterMs: getAircraftStaleAfterMs(),
      networkStaleAfterMs: getAdsbLolStaleAfterMs(),
      now: Date.now(),
      preferredOrigin: this.sourcePreferences.get(normalized),
    });
  }

  /** Read the last bounded live prediction; the API must never recompute it. */
  getPredictiveState(icaoHex: string) {
    return this.predictive.get(icaoHex);
  }

  getPredictiveDiagnostics() {
    return this.predictive.diagnostics();
  }

  captureOperationalTwinOutcome(situation: OperationalTwinSituation): void {
    this.operationalTwinOutcome.capture(situation);
    this.operationalTwinCalibrationPersistence.scheduleFlush();
  }

  getOperationalTwinOutcomeReport(now = new Date()) {
    return this.operationalTwinOutcome.report(now);
  }

  captureOperationalTwinTrajectoryQualityOutcome(situation: OperationalTwinSituation): void {
    this.operationalTwinTrajectoryQualityOutcome.capture(situation);
    this.operationalTwinCalibrationPersistence.scheduleFlush();
  }

  getOperationalTwinTrajectoryQualityOutcomeReport(now = new Date()) {
    return this.operationalTwinTrajectoryQualityOutcome.report(now);
  }

  captureOperationalTwinTrajectoryQualityOutcomeV2(situation: OperationalTwinSituation): void {
    this.operationalTwinTrajectoryQualityOutcomeV2.capture(situation);
    this.operationalTwinCalibrationPersistence.scheduleFlush();
  }

  getOperationalTwinTrajectoryQualityOutcomeV2Report(now = new Date()) {
    return this.operationalTwinTrajectoryQualityOutcomeV2.report(now);
  }

  getOperationalTwinTrajectoryQualityV3GraduationReport(now = new Date()) {
    return buildOperationalTwinTrajectoryQualityV3Graduation(
      this.operationalTwinTrajectoryQualityOutcomeV2.report(now),
    );
  }

  getOperationalTwinTrajectoryQualityGraduationReport(now = new Date()) {
    return buildOperationalTwinTrajectoryQualityGraduation(
      this.operationalTwinTrajectoryQualityOutcome.report(now),
    );
  }

  observeOperationalTwinTruthContext(
    context: OperationalTwinTruthObservationContext,
    now = Date.now(),
  ): void {
    this.operationalTwinTruthFirst.observeContext(context, now);
  }

  captureOperationalTwinEventOutcome(
    situation: OperationalTwinSituation,
    context: OperationalTwinEventOutcomeCaptureContext,
  ): void {
    this.operationalTwinEventOutcome.capture(situation, context);
    this.operationalTwinTruthFirst.capture(situation, context);
    this.operationalTwinCalibrationPersistence.scheduleFlush();
  }

  getOperationalTwinEventOutcomeReport(now = new Date()) {
    return {
      ...this.operationalTwinEventOutcome.report(now),
      truthFirst: this.operationalTwinTruthFirst.report(now),
      calibrationPersistence: this.operationalTwinCalibrationPersistence.getStatus(),
    };
  }

  captureOperationalFocusOutcome(
    situation: OperationalTwinSituation,
    sigmets: import("@/lib/weather/types").SigmetSnapshot | null,
  ): void {
    this.operationalFocusOutcome.capture(situation, sigmets);
  }

  getOperationalFocusOutcomeReport(now = new Date()) {
    return this.operationalFocusOutcome.report(now);
  }

  captureRegionalAttentionOutcome(summary: OperationalAttentionSummary): void {
    this.regionalAttentionOutcome.capture(summary);
    this.operationalTwinCalibrationPersistence.scheduleFlush();
  }

  getRegionalAttentionOutcomeReport(now = new Date()) {
    return {
      ...this.regionalAttentionOutcome.report(now),
      calibrationPersistence: this.operationalTwinCalibrationPersistence.getStatus(),
    };
  }

  getRegionalAttentionGraduationReport(now = new Date()) {
    return buildRegionalAttentionGraduation(this.regionalAttentionOutcome.report(now));
  }

  getNetworkDiagnostics() {
    return this.networkProvider.getDiagnostics();
  }

  getEnrichmentDiagnostics() {
    return this.enrichment.getDiagnostics();
  }

  /** Optional admin-only, identity-free source-value snapshot; no upstream I/O. */
  getNetworkSourceValueDiagnostics() {
    return this.networkProvider.getSourceValueDiagnostics?.() ?? null;
  }

  getReceiverCoverageDiagnostics() { return this.receiverCoverage.getDiagnostics(); }
  getLiveReceiverCoverage(): CoverageResponse { return this.receiverCoverage.getLive(); }

  private currentReceiver = getReceiverPosition();

  private async refresh(): Promise<void> {
    if (!this.running) return;
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      let localSnapshot: ProviderSnapshot | null = null;
      try {
        localSnapshot = await this.provider.getSnapshot();
        if (!this.running) return;
        this.applySnapshot(localSnapshot);
        this.lastSourceUpdate = localSnapshot.fetchedAt;
        this.lastError = null;
        this.consecutiveFailures = 0;

        // Publish the live receiver snapshot before optional catalog work. A
        // slow metadata provider must not stop the readsb polling loop.
        if (!this.localMetadataRefreshing && this.enrichment.hasInitialMetadataProvider) {
          this.localMetadataRefreshing = true;
          void this.hydrateInitialIconMetadata(localSnapshot.aircraft)
            .then((aircraft) => {
              if (this.running) this.applyInitialMetadata(aircraft);
            })
            .catch((error) => {
              logger.debug({ error }, "AirRadar local metadata hydration skipped");
            })
            .finally(() => {
              this.localMetadataRefreshing = false;
            });
        }
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : "Unknown aircraft provider error";
        this.messagesPerSecond = null;
        this.consecutiveFailures += 1;
        // A failed provider request supplies no current membership evidence.
        // Keep the last good observations through the stale/source-affinity
        // window so the map can fail over without a blank interval.
        const previousObserved = this.localObservedHexes;
        this.localObservedHexes = new Set();
        const now = Date.now();
        this.continuity.observeMembership("local", previousObserved, this.localObservedHexes, now);
        this.reconcileSourcePreferences(now);
        this.removeStaleAircraft(now);
        this.invalidateSnapshotCache();
      }

      if (!this.running) return;
      this.notify();
      if (localSnapshot && this.running) {
        this.queueHistory(localSnapshot);
        // Limit enrichment to one pending batch, just like network icon
        // metadata. Without this gate every poll can enqueue more provider
        // promises, even though ProviderCache coalesces individual keys.
        if (!this.localEnrichmentRefreshing && this.enrichment.hasProviders) {
          this.localEnrichmentRefreshing = true;
          void this.enrichSnapshot(localSnapshot)
            .catch((error) => {
              logger.debug({ error }, "AirRadar live enrichment skipped");
            })
            .finally(() => {
              this.localEnrichmentRefreshing = false;
            });
        }
        void this.resolveAtc(localSnapshot).catch((error) => {
          // ATC is optional enrichment; a provider failure must never affect live tracking.
          logger.error({ error }, "AirRadar ATC resolution failed");
        });
      }
    } finally {
      this.refreshing = false;
      if (this.running) {
        const delay = this.lastError
          ? Math.min(getMaxProviderRetryIntervalMs(), getPollIntervalMs() * 2 ** Math.min(this.consecutiveFailures - 1, 4))
          : getPollIntervalMs();
        this.timer = setTimeout(() => void this.refresh(), delay);
      }
    }
  }

  private async hydrateInitialIconMetadata(
    aircraft: ProviderSnapshot["aircraft"],
    existing: ReadonlyMap<string, Aircraft> = this.localAircraft,
  ): Promise<Aircraft[]> {
    // This is a patch list, not a second full snapshot: both consumers apply
    // metadata only to matching current aircraft and never replace positions.
    if (!this.enrichment.hasInitialMetadataProvider) return [];

    const candidates = aircraft.filter((item) => {
      if (existing.get(item.icaoHex)?.enrichment?.metadata) return false;
      return aircraftIconNeedsInitialMetadata(item);
    });
    if (candidates.length === 0) return [];

    const metadata = await mapBounded(candidates, ENRICHMENT_WORKER_LIMIT,
      (item) => this.enrichment.getInitialAircraftMetadata(item.icaoHex));
    const patches: Aircraft[] = [];
    for (let i = 0; i < metadata.length; i++) {
      const value = metadata[i];
      if (!value) continue;
      const item = candidates[i]!;
      patches.push({
        ...item,
        enrichment: { ...(item.enrichment ?? {}), metadata: value },
      });
    }
    return patches;
  }

  private applyInitialMetadata(aircraft: ProviderSnapshot["aircraft"]): void {
    let changed = false;
    for (const item of aircraft) {
      const metadata = item.enrichment?.metadata;
      const current = this.localAircraft.get(item.icaoHex);
      if (!metadata || !current || current.lastSeen !== item.lastSeen) continue;
      this.localAircraft.set(item.icaoHex, {
        ...current,
        enrichment: { ...(current.enrichment ?? {}), metadata },
      });
      changed = true;
    }
    if (changed) {
      this.invalidateSnapshotCache();
      this.notify();
    }
  }

  private applyNetworkInitialMetadata(aircraft: ProviderSnapshot["aircraft"]): void {
    let changed = false;
    for (const item of aircraft) {
      const metadata = item.enrichment?.metadata;
      const current = this.networkAircraft.get(item.icaoHex);
      if (!metadata || !current || current.lastSeen !== item.lastSeen) continue;
      if (current.enrichment?.metadata === metadata) continue;
      this.networkAircraft.set(item.icaoHex, {
        ...current,
        enrichment: { ...(current.enrichment ?? {}), metadata },
      });
      changed = true;
    }
    if (changed) {
      this.invalidateSnapshotCache();
      this.notify();
    }
  }

  private async refreshNetwork(): Promise<void> {
    if (!this.running || this.networkRefreshing) return;
    this.networkRefreshing = true;
    try {
      const networkSnapshot = await this.networkProvider.getSnapshot();
      // stop() may have happened while the provider request was pending. The
      // result is deliberately discarded so shutdown cannot publish a state.
      if (!this.running) return;
      // Publish the live network observation before optional metadata work.
      // A catalog/provider failure must never hide an otherwise valid network
      // snapshot from the extended radar.
      this.applyNetworkSnapshot(networkSnapshot);
      this.notify();

      // Metadata must not hold the ingest lock or delay its next poll.
      // One pending batch bounds work even if the catalog never settles.
      if (!this.networkMetadataRefreshing && this.enrichment.hasInitialMetadataProvider) {
        this.networkMetadataRefreshing = true;
        void this.hydrateInitialIconMetadata(networkSnapshot.aircraft, this.networkAircraft)
          .then((aircraft) => {
            if (this.running) this.applyNetworkInitialMetadata(aircraft);
          })
          .catch((error) => {
            logger.debug({ error }, "AirRadar network metadata hydration skipped");
          })
          .finally(() => {
            this.networkMetadataRefreshing = false;
          });
      }
    } catch {
      // The optional provider owns its bounded stale state and diagnostics.
      // A network failure must never change local receiver health.
    } finally {
      this.networkRefreshing = false;
      if (this.running) {
        const diagnostics = this.networkProvider.getDiagnostics();
        if (diagnostics.enabled) {
          const delay = this.networkProvider.getNextPollDelayMs?.() ?? diagnostics.pollIntervalMs;
        this.networkTimer = setTimeout(() => {
          this.networkTimer = null;
          void this.refreshNetwork();
          }, Number.isFinite(delay) && delay >= 0 ? delay : getAdsbLolStaleAfterMs());
        }
      }
    }
  }

  private applySnapshot(snapshot: ProviderSnapshot): void {
    measureRuntime("snapshot.apply.total", snapshot.aircraft.length, () => measureRuntime("snapshot.local", snapshot.aircraft.length, () => this.applySnapshotCore(snapshot)));
  }

  private applySnapshotCore(snapshot: ProviderSnapshot): void {
    this.currentReceiver = snapshot.receiver;
    const atcResolutionEnabled = isAtcResolutionEnabled();
    if (!atcResolutionEnabled) this.clearAtcResolutionState();
    const previousAircraft = new Map(this.localAircraft);
    const previousObservedHexes = this.localObservedHexes;
    const currentHexes = new Set<string>();
    let newObservedIdentity = false;
    const now = Date.now();
    const localStaleAfterMs = getAircraftStaleAfterMs();
    const reappearWindowMs = getAircraftReappearWindowMs();
    measureRuntime("snapshot.local.ingest", snapshot.aircraft.length, () => {
      for (const incoming of snapshot.aircraft) {
        if (Date.parse(incoming.lastSeen) < now - localStaleAfterMs) continue;
        currentHexes.add(incoming.icaoHex);
        if (!newObservedIdentity && !previousObservedHexes.has(incoming.icaoHex)) newObservedIdentity = true;
        this.continuity.recordObservation("local", incoming.icaoHex, now, reappearWindowMs);
        this.sourcePreferences.set(incoming.icaoHex, this.sourcePreferences.get(incoming.icaoHex) ?? "local");
        const previous = this.localAircraft.get(incoming.icaoHex);
        const localIncoming = plausiblePosition(previous, { ...incoming, origin: "local" as const });
        const trail = this.updateTrail(previous, localIncoming);
        const sameCallsign = previous?.callsign === incoming.callsign;
        const enrichment = mergeEnrichment(previous?.enrichment, incoming.enrichment, sameCallsign);
        // ATC is assigned from position/altitude, not callsign. Preserve a
        // still-valid estimate across an observation callsign change.
        const atc = atcResolutionEnabled ? previous?.atc ?? incoming.atc : undefined;
        this.localAircraft.set(incoming.icaoHex, { ...localIncoming, ...(enrichment ? { enrichment } : {}), ...(atc !== undefined ? { atc } : {}), trail });
      }
    });
    this.continuity.observeMembership("local", previousObservedHexes, currentHexes, now);
    const massDropBaseline = previousObservedHexes.size > 0 ? previousObservedHexes : new Set(this.localAircraft.keys());
    const massDrop = this.continuity.evaluateMassDrop("local", massDropBaseline, currentHexes, now, {
      enabled: isAircraftMassDropGuardEnabled(),
      minBaseline: getAircraftMassDropMinBaseline(),
      dropRatio: getAircraftMassDropRatio(),
    });
    this.logMassDropDecision("local", massDrop);
    this.localObservedHexes = currentHexes;
    // Start/advance source-affinity failover before pruning. This lets a
    // preferred source keep its last known position during the grace window,
    // then hand off directly to a live alternate source without disappearing.
    // When both sources have stable memberships and no failover grace timer
    // is pending, this O(all preferences) scan cannot change affinity.
    // Detect new keys during ingest, and removed keys from set cardinality.
    if (newObservedIdentity || currentHexes.size !== previousObservedHexes.size
      || this.sourcePreferenceMissingSince.size > 0) this.reconcileSourcePreferences(now);
    // pruneMissingAircraft performs the only post-prune affinity cleanup
    // needed for identities removed from the last retained source.
    if (!massDrop.deferPrune) this.pruneMissingAircraft("local", currentHexes, localStaleAfterMs, now);
    const activeAircraft = [...this.localAircraft.values()];
    this.messagesPerSecond = snapshot.messagesPerSecond ?? null;
    if (!this.shuttingDown) measureRuntime("snapshot.statistics", activeAircraft.length, () => this.statistics.observe(activeAircraft, this.currentReceiver, new Date()));
    this.scheduleReceptionRecordEvaluation();
    measureRuntime("snapshot.alerts", activeAircraft.length, () => this.alerts.observe(previousAircraft, this.localAircraft));
    // Rejected Flight Intelligence and predictive watchlist analytics never run
    // inside the live ADS-B snapshot loop. Alert delivery remains independent.
    measureRuntime("snapshot.navigationIntegrity", activeAircraft.length, () => this.navigationIntegrity.observe(activeAircraft, new Date(snapshot.fetchedAt), "local"));
    this.invalidateSnapshotCache();
  }

  private applyNetworkSnapshot(snapshot: NetworkAircraftSnapshot): void {
    measureRuntime("snapshot.network", snapshot.aircraft.length, () => this.applyNetworkSnapshotCore(snapshot));
  }

  private applyNetworkSnapshotCore(snapshot: NetworkAircraftSnapshot): void {
    const previousObservedHexes = this.networkObservedHexes;
    const currentHexes = new Set<string>();
    let newObservedIdentity = false;
    const now = Date.now();
    const networkStaleAfterMs = getAdsbLolStaleAfterMs();
    const reappearWindowMs = getAircraftReappearWindowMs();
    // These deployment settings are stable during one snapshot. Avoid parsing
    // process.env twice per aircraft across high-volume network updates.
    const trailMaxAgeMs = getNetworkTrailMaxAgeMs();
    const trailMaxPoints = getNetworkTrailMaxPoints();
    const cutoff = now - networkStaleAfterMs;
    measureRuntime("snapshot.network.ingest", snapshot.aircraft.length, () => {
      for (const incoming of snapshot.aircraft) {
        const lastSeen = Date.parse(incoming.lastSeen);
        if (!Number.isFinite(lastSeen) || lastSeen < cutoff) continue;
        currentHexes.add(incoming.icaoHex);
        if (!newObservedIdentity && !previousObservedHexes.has(incoming.icaoHex)) newObservedIdentity = true;
        this.continuity.recordObservation("network", incoming.icaoHex, now, reappearWindowMs);
        // Stable network identities already have an affinity. Avoid rewriting
        // the same Map entry for every aircraft on every network poll.
        if (!this.sourcePreferences.has(incoming.icaoHex)) {
          this.sourcePreferences.set(incoming.icaoHex, "network");
        }
        const previous = this.networkAircraft.get(incoming.icaoHex);
        // Most network adapters already provide the canonical origin. Reuse
        // their immutable observation instead of cloning thousands of objects
        // every poll solely to assign an existing field.
        const withOrigin = incoming.origin ? incoming : { ...incoming, origin: "adsblol" as const };
        const networkIncoming = plausiblePosition(previous, withOrigin);
        const trail = this.updateTrail(previous, networkIncoming, trailMaxAgeMs, trailMaxPoints, lastSeen);
        this.networkAircraft.set(incoming.icaoHex, { ...networkIncoming, trail });
      }
    });
    this.continuity.observeMembership("network", previousObservedHexes, currentHexes, now);
    const massDrop = this.continuity.evaluateMassDrop("network", previousObservedHexes, currentHexes, now, {
      enabled: isAircraftMassDropGuardEnabled(),
      minBaseline: getAircraftMassDropMinBaseline(),
      dropRatio: getAircraftMassDropRatio(),
    });
    this.logMassDropDecision("network", massDrop);
    this.networkObservedHexes = currentHexes;
    if (newObservedIdentity || currentHexes.size !== previousObservedHexes.size
      || this.sourcePreferenceMissingSince.size > 0) this.reconcileSourcePreferences(now);
    // Preserve the failover grace decision made before pruning, without a
    // second O(all source affinities) pass after every network snapshot.
    if (!massDrop.deferPrune) this.pruneMissingAircraft("network", currentHexes, networkStaleAfterMs, now);
    measureRuntime("snapshot.navigationIntegrity", this.networkAircraft.size, () => this.navigationIntegrity.observe(this.networkAircraft.values(), new Date(snapshot.fetchedAt ?? new Date().toISOString()), "network"));
    this.invalidateSnapshotCache();
  }

  private logMassDropDecision(origin: AircraftContinuityOrigin, decision: AircraftMassDropDecision): void {
    const details = {
      origin,
      baselineAircraft: decision.baselineCount,
      observedAircraft: decision.currentCount,
      dropRatio: Math.round(decision.dropRatio * 1_000) / 1_000,
    };
    if (decision.deferPrune) {
      logger.warn(details, "AirRadar continuity guard deferred suspicious mass disappearance");
    } else if (decision.confirmed) {
      logger.warn(details, "AirRadar continuity guard confirmed mass disappearance");
    } else if (decision.recovered) {
      logger.info(details, "AirRadar continuity guard recovered before confirmation");
    }
  }

  private reconcileSourcePreferences(now = Date.now()): void {
    const graceMs = getSourceAffinityFailoverGraceMs();
    for (const [hex, preferred] of this.sourcePreferences) {
      const alternate: "local" | "network" = preferred === "local" ? "network" : "local";
      const preferredObserved = preferred === "local" ? this.localObservedHexes.has(hex) : this.networkObservedHexes.has(hex);
      const alternateObserved = alternate === "local" ? this.localObservedHexes.has(hex) : this.networkObservedHexes.has(hex);
      const preferredRetained = preferred === "local" ? this.localAircraft.has(hex) : this.networkAircraft.has(hex);
      const alternateRetained = alternate === "local" ? this.localAircraft.has(hex) : this.networkAircraft.has(hex);

      if (preferredObserved) {
        this.sourcePreferenceMissingSince.delete(hex);
        continue;
      }

      // Do not switch to an alternate that is itself only stale-retained. If
      // neither source has any retained identity left, discard the affinity.
      if (!alternateObserved) {
        if (!preferredRetained && !alternateRetained) {
          this.sourcePreferences.delete(hex);
          this.sourcePreferenceMissingSince.delete(hex);
        }
        continue;
      }

      const missingSince = this.sourcePreferenceMissingSince.get(hex);
      if (missingSince === undefined) {
        this.sourcePreferenceMissingSince.set(hex, now);
        continue;
      }
      if (now - missingSince >= graceMs) {
        this.sourcePreferences.set(hex, alternate);
        this.sourcePreferenceMissingSince.delete(hex);
        this.continuity.recordFailover(preferred, alternate, now);
      }
    }
  }

  private pruneMissingAircraft(
    origin: "local" | "network",
    observedHexes: ReadonlySet<string>,
    staleAfterMs: number,
    now = Date.now(),
  ): void {
    const map = origin === "local" ? this.localAircraft : this.networkAircraft;
    const alternateObservedHexes = origin === "local" ? this.networkObservedHexes : this.localObservedHexes;
    const alternateRetained = origin === "local" ? this.networkAircraft : this.localAircraft;
    const cutoff = now - staleAfterMs;
    const graceMs = getSourceAffinityFailoverGraceMs();

    for (const [hex, item] of map) {
      if (observedHexes.has(hex)) continue;
      const lastSeen = Date.parse(item.lastSeen);
      const expired = !Number.isFinite(lastSeen) || lastSeen < cutoff;
      if (!expired) continue;

      // If this is still the preferred source and a live alternate exists,
      // retain the last known position until affinity can switch so the map
      // never has a positionless interval between data sources.
      const missingSince = this.sourcePreferenceMissingSince.get(hex);
      if (
        this.sourcePreferences.get(hex) === origin
        && alternateObservedHexes.has(hex)
        && missingSince !== undefined
        && now - missingSince < graceMs
      ) {
        continue;
      }

      this.continuity.recordRemoval(origin, hex, now);
      if (origin === "local") this.removeAircraft(hex);
      else this.networkAircraft.delete(hex);
      // Previously the second full reconcile pass removed affinities that
      // lost their final retained source *during* pruning. Only removed
      // identities need that cleanup; leave a live alternate and its grace
      // timer untouched. Also preserve the unusual observed-but-not-retained
      // case rather than changing its historical transition behavior.
      if (!alternateRetained.has(hex) && !alternateObservedHexes.has(hex)) {
        this.sourcePreferences.delete(hex);
        this.sourcePreferenceMissingSince.delete(hex);
      }
    }
  }

  private removeStaleAircraft(now = Date.now()): void {
    this.pruneMissingAircraft("local", this.localObservedHexes, getAircraftStaleAfterMs(), now);
    this.reconcileSourcePreferences(now);
  }

  private removeAircraft(hex: string): void {
    this.aircraft.delete(hex);
    this.atcResolutionKeys.delete(hex);
    this.atcShadowPredictionKeys.delete(hex);
    this.atcShadowPredictionInFlight.delete(hex);
    this.pendingAtcShadowPredictions.delete(hex);
    const generation = (this.atcShadowPredictionGenerations.get(hex) ?? 0) + 1;
    // Keep a tombstone only while old work can still complete. Once no work
    // references this ICAO, the stale checks also have no consumer left.
    if (this.atcShadowPredictionInFlight.has(hex) || this.pendingAtcShadowPredictions.has(hex)) {
      this.atcShadowPredictionGenerations.set(hex, generation);
    } else {
      this.atcShadowPredictionGenerations.delete(hex);
    }
    getAtcPredictionValidation().remove(hex);
  }

  private clearAtcResolutionState(): void {
    if (!this.atcResolutionStateActive
      && this.atcResolutionKeys.size === 0
      && this.atcShadowPredictionKeys.size === 0
      && this.atcShadowPredictionInFlight.size === 0
      && this.pendingAtcShadowPredictions.size === 0) return;
    for (const [hex, aircraft] of this.localAircraft) {
      if (aircraft.atc === undefined) continue;
      const withoutAtc = { ...aircraft };
      delete withoutAtc.atc;
      this.localAircraft.set(hex, withoutAtc);
    }
    this.atcResolutionKeys.clear();
    this.clearAtcShadowPredictionState();
    for (const hex of this.localAircraft.keys()) getAtcPredictionValidation().remove(hex);
    this.atcResolutionStateActive = false;
  }

  private clearAtcShadowPredictionState(): void {
    if (this.atcShadowPredictionKeys.size === 0
      && this.atcShadowPredictionInFlight.size === 0
      && this.pendingAtcShadowPredictions.size === 0) return;
    this.atcShadowPredictionKeys.clear();
    this.atcShadowPredictionInFlight.clear();
    this.pendingAtcShadowPredictions.clear();
    for (const [hex, generation] of this.atcShadowPredictionGenerations) {
      if (this.localAircraft.has(hex)) this.atcShadowPredictionGenerations.set(hex, generation + 1);
      else this.atcShadowPredictionGenerations.delete(hex);
    }
  }

  private updateTrail(
    previous: Aircraft | undefined,
    incoming: Aircraft,
    networkMaxAgeMs?: number,
    networkMaxPoints?: number,
    networkLastSeenAt?: number,
  ): TrailPoint[] {
    return measureRuntime("snapshot.trail-update", 1, () => {
      const previousTrail = previous?.trail ?? [];
      const sourceChanged = Boolean(previous?.provenance?.positionOrigin && incoming.provenance?.positionOrigin
        && (previous.provenance.positionOrigin !== incoming.provenance.positionOrigin
          || previous.provenance.positionSource !== incoming.provenance.positionSource));
      const base = sourceChanged ? [] : previousTrail;
      const point = trailPointFromAircraft(incoming);
      if (incoming.origin === "local") {
        const last = base.at(-1);
        if (point && last
          && last.recordedAt === point.recordedAt
          && last.lat === point.lat && last.lon === point.lon
          && (last.altitude ?? null) === (point.altitude ?? null)
          && (last.track ?? null) === (point.track ?? null)
          && (last.groundSpeed ?? null) === (point.groundSpeed ?? null)) {
          return base;
        }
        return point ? appendBoundedServerTrailPoint(base, point) : base;
      }
      // The network ingest already parsed and validated this same timestamp.
      // Keep direct/private callers compatible when it is not supplied.
      const cutoff = (networkLastSeenAt ?? Date.parse(incoming.lastSeen)) - (networkMaxAgeMs ?? getNetworkTrailMaxAgeMs());
      return appendBoundedNetworkTrailPoint(base, point, cutoff, networkMaxPoints ?? getNetworkTrailMaxPoints());
    });
  }

  private async persistHistory(snapshot: ProviderSnapshot): Promise<void> {
    // Keep the invalid-input fast path independent of the service receiver;
    // a few shutdown/test callers invoke this guard as a detached method.
    if (!Number.isFinite(Date.parse(snapshot.fetchedAt))) {
      await measureRuntimeAsync("history.persist", snapshot.aircraft.length, async () => {
        logger.error("AirRadar history snapshot skipped: invalid fetchedAt");
      });
      return;
    }
    await measureRuntimeAsync("history.persist", snapshot.aircraft.length, () => measureRuntimeAsync("history.transaction", snapshot.aircraft.length, () => this.persistHistoryCore(snapshot)));
  }

  private async persistHistoryCore(snapshot: ProviderSnapshot): Promise<void> {
    const sampledAt = Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(sampledAt)) {
      logger.error("AirRadar history snapshot skipped: invalid fetchedAt");
      return;
    }

    const now = Date.now();
    const sampleIntervalMs = getHistorySampleIntervalMs();
    const due: Aircraft[] = [];
    for (const item of snapshot.aircraft) {
      if (item.lat === null || item.lon === null) continue;
      const previous = this.lastHistorySample.get(item.icaoHex);
      const currentPersist = previous === undefined || sampledAt - previous >= sampleIntervalMs;
      // Preserve the established time-sampled history persistence decision.
      if (currentPersist) due.push(historyAircraftForSnapshot(item, this.aircraft.get(item.icaoHex)));
    }
    if (due.length) {
      // Weather is a separate sparse lane. It is intentionally fire-and-forget
      // so a database hiccup cannot add latency to the live Beast/SSE loop.
      void persistAircraftWeatherObservations(due, new Date(sampledAt), snapshot.provider).catch((error) => {
        logger.debug({ error }, "AirRadar aircraft weather persistence skipped");
      });
      try {
        const result = await recordAircraftSnapshot(due, new Date(sampledAt));
        for (const icaoHex of result.succeeded) this.lastHistorySample.set(icaoHex, sampledAt);
        for (const icaoHex of result.newAircraft ?? []) {
          const current = this.aircraft.get(icaoHex);
          if (current) this.alerts.observeNewAircraft(current);
        }
        if (result.failed.length) {
          logger.error({ failedAircraft: result.failed.length }, "AirRadar history persistence failed");
        }
      } catch (error) {
        // History is best-effort and must never make a healthy receiver look offline.
        logger.error({ error }, "AirRadar history persistence failed");
      }
    } else {
      // Let the throttled history maintenance run even when no position sample
      // is due (for example while every aircraft is out of range).
      await recordAircraftSnapshot([], new Date(snapshot.fetchedAt));
    }
    const cleanupBefore = now - Math.max(getHistorySampleIntervalMs() * 2, 60 * 60_000);
    for (const [hex, sampledAt] of this.lastHistorySample) {
      if (sampledAt < cleanupBefore && !this.aircraft.has(hex)) this.lastHistorySample.delete(hex);
    }
  }

  private async loadLifetimeReceptionRecord(): Promise<void> {
    try {
      const records = await getReceptionRecords(null);
      this.lifetimeReceptionRecord = records.lifetime;
      this.lifetimeReceptionRecordLoaded = true;
      this.scheduleReceptionRecordEvaluation();
    } catch {
      // Reception records are optional and must never affect live refresh.
      this.lifetimeReceptionRecordLoaded = true;
      this.scheduleReceptionRecordEvaluation();
    }
  }

  private scheduleReceptionRecordEvaluation(): void {
    this.receptionEvaluationPending = true;
    const ready = this.statisticsReady;
    if (!ready) return;
    void ready.then(() => {
      if (!this.receptionEvaluationPending) return;
      this.receptionEvaluationPending = false;
      const current = this.statistics.getDailyReceptionRecord();
      const previousDaily = this.lastEvaluatedDailyReceptionRecord;
      if (current && (!previousDaily || current.date !== previousDaily.date || current.distanceKm > previousDaily.distanceKm)) {
        this.alerts.observeReceptionRecord("daily", current, previousDaily?.date === current.date ? previousDaily : null);
      }
      this.lastEvaluatedDailyReceptionRecord = current;
      if (current && this.lifetimeReceptionRecordLoaded
        && (!this.lifetimeReceptionRecord || current.distanceKm > this.lifetimeReceptionRecord.distanceKm)) {
        const previousLifetime = this.lifetimeReceptionRecord;
        this.lifetimeReceptionRecord = current;
        this.alerts.observeReceptionRecord("lifetime", current, previousLifetime);
      }
    }).catch((error) => {
      // This callback is intentionally fire-and-forget. Never let an
      // optional alert/record side effect become a process-level rejection.
      logger.debug({ error }, "AirRadar reception-record evaluation skipped");
    });
  }

  private queueHistory(snapshot: ProviderSnapshot): void {
    if (!this.running) return;
    // Sampling remains per ICAO so first sightings and failed-write retries
    // are processed on the next live poll.
    this.pendingHistorySnapshot = snapshot;
    if (this.historyWriteActive) return;
    this.historyWriteActive = true;
    this.historyDrainPromise = this.drainHistoryQueue();
  }

  private async drainHistoryQueue(): Promise<void> {
    try {
      while (this.pendingHistorySnapshot) {
        const snapshot = this.pendingHistorySnapshot;
        this.pendingHistorySnapshot = null;
        try {
          await this.persistHistory(snapshot);
        } catch (error) {
          logger.error({ error }, "AirRadar history queue failed");
        }
      }
    } finally {
      this.historyWriteActive = false;
      if (this.pendingHistorySnapshot && this.running) this.queueHistory(this.pendingHistorySnapshot);
    }
  }

  private drainHistory(): Promise<void> {
    return this.historyDrainPromise ?? Promise.resolve();
  }

  private notify(): void {
    measureRuntime("snapshot.notify", this.listeners.size, () => this.notifyCore());
  }

  private notifyCore(): void {
    for (const listener of this.listeners) {
      try {
        listener.callback(this.getSnapshot({ coverage: listener.coverage }));
      } catch {
        // A disconnected SSE client must not break the polling loop for everyone else.
        this.listeners.delete(listener);
      }
    }
  }

  private async enrichSnapshot(snapshot: ProviderSnapshot): Promise<void> {
    await measureRuntimeAsync("network.metadata", snapshot.aircraft.length, () => this.enrichSnapshotCore(snapshot));
  }

  private async enrichSnapshotCore(snapshot: ProviderSnapshot): Promise<void> {
    if (!this.enrichment.hasProviders) return;
    const candidates = snapshot.aircraft.filter((item) => {
      const current = this.aircraft.get(item.icaoHex);
      return this.enrichment.needsEnrichment(item, current?.enrichment);
    });
    const observedAt = new Date(snapshot.fetchedAt);
    const results = await mapSettledBounded(candidates, ENRICHMENT_WORKER_LIMIT, async (item) => ({
      item,
      enrichment: await this.enrichment.enrich(item, observedAt, this.aircraft.get(item.icaoHex)?.enrichment),
    }));
    if (this.shuttingDown) return;
    let changed = false;
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value.enrichment) continue;
      const current = this.aircraft.get(result.value.item.icaoHex);
      // A slow provider response belongs to one observation. Do not attach it
      // to a newer observation of the same callsign/hex.
      if (!current || current.callsign !== result.value.item.callsign || current.lastSeen !== result.value.item.lastSeen) continue;
      const enrichment = mergeEnrichment(current.enrichment, result.value.enrichment, true);
      if (!enrichment) continue;
      const updated = { ...current, enrichment };
      this.aircraft.set(current.icaoHex, updated);
      this.alerts.observe(new Map([[current.icaoHex, current]]), [updated]);
      changed = true;
    }
    if (changed && !this.shuttingDown) {
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.enrichment) continue;
        const updated = this.aircraft.get(result.value.item.icaoHex);
        if (updated && !this.shuttingDown) this.statistics.observe([updated], this.currentReceiver, new Date());
      }
      this.invalidateSnapshotCache();
      this.notify();
    }
  }

  private async resolveAtc(snapshot: ProviderSnapshot): Promise<void> {
    if (!isAtcResolutionEnabled()) {
      this.clearAtcResolutionState();
      return;
    }
    this.atcResolutionStateActive = true;
    // Shadow cleanup is performed only when the mode transitions off (or the
    // assignment lane is disabled), never once per provider snapshot.
    if (isAtcShadowPredictionEnabled() === false && this.atcShadowPredictionKeys.size > 0) {
      this.clearAtcShadowPredictionState();
    }
    // Keep only the newest observation. This makes the ATC lane bounded even
    // when the provider poll interval is shorter than a database lookup.
    this.pendingAtcResolutionSnapshot = snapshot;
    // A caller arriving while a lookup is pending only replaces the queued
    // snapshot. Waiting here would make the normal poller retain promises
    // behind a slow provider and would also make callers wait for newer work.
    if (this.atcResolutionDrain) {
      if (!this.atcResolutionFirstCallSettled) return;
      await this.atcResolutionDrain;
      return;
    }
    this.pendingAtcResolutionSnapshot = null;
    this.atcResolutionInFlight = true;
    const firstResolution = measureRuntimeAsync("atc.resolve", snapshot.aircraft.length, () => this.resolveAtcCore(snapshot));
    this.atcResolutionDrain = (async () => {
      let resolution = firstResolution;
      while (true) {
        try {
          await resolution;
        } catch (error) {
          // A failed optional lookup must release the lane, but the newest
          // queued snapshot still deserves one bounded attempt.
          logger.error({ error }, "AirRadar ATC resolution drain failed");
        }
        this.atcResolutionFirstCallSettled = true;
        this.atcResolutionInFlight = false;
        if (!this.pendingAtcResolutionSnapshot || this.shuttingDown) break;
        const next = this.pendingAtcResolutionSnapshot;
        this.pendingAtcResolutionSnapshot = null;
        this.atcResolutionInFlight = true;
        resolution = measureRuntimeAsync("atc.resolve", next.aircraft.length, () => this.resolveAtcCore(next));
      }
    })().finally(() => {
      this.atcResolutionInFlight = false;
      this.atcResolutionDrain = null;
      this.atcResolutionFirstCallSettled = false;
    });
    await firstResolution;
  }

  private async resolveAtcCore(snapshot: ProviderSnapshot): Promise<void> {
    const failures: string[] = [];
    // In the steady state most aircraft retain the same coarse ATC key. Do
    // not allocate a promise or enter the resolver for those observations.
    const candidates = snapshot.aircraft.filter((incoming) => {
      const key = atcResolutionKey(incoming);
      return Boolean(key) && this.atcResolutionKeys.get(incoming.icaoHex) !== key;
    });
    let changed = false;
    for (let offset = 0; offset < candidates.length; offset += ATC_RESOLUTION_BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + ATC_RESOLUTION_BATCH_SIZE);
      const results = await Promise.all(batch.map(async (incoming) => {
        const key = atcResolutionKey(incoming);
        if (!key || !this.aircraft.has(incoming.icaoHex)) return { incoming, key, assignment: null, resolved: false };
        this.atcResolutionKeys.set(incoming.icaoHex, key);
        try {
          const match = await this.atc.lookup({ latitude: incoming.lat!, longitude: incoming.lon!, altitudeFt: incoming.altitude, observedAt: new Date(snapshot.fetchedAt) });
          if (!this.aircraft.has(incoming.icaoHex)) {
            if (this.atcResolutionKeys.get(incoming.icaoHex) === key) this.atcResolutionKeys.delete(incoming.icaoHex);
            return { incoming, key, assignment: null, resolved: false };
          }
          const assignment = match
            ? measureRuntime("atc.assignment.construction", 1, () => assignmentFromMatch(match))
            : null;
          return { incoming, key, assignment, resolved: true };
        } catch {
          if (this.atcResolutionKeys.get(incoming.icaoHex) === key) this.atcResolutionKeys.delete(incoming.icaoHex);
          failures.push(incoming.icaoHex);
          return { incoming, key, assignment: null, resolved: false };
        }
      }));
      for (const result of results) {
        const current = this.aircraft.get(result.incoming.icaoHex);
        const resolutionKey = result.key;
        if (!result.resolved || !resolutionKey || !current || current.callsign !== result.incoming.callsign || atcResolutionKey(current) !== resolutionKey) continue;
        const validation = getAtcPredictionValidation();
        validation.observeCurrentSector(current.icaoHex, result.assignment?.sectorId ?? null, Date.parse(current.lastSeen));
        if (JSON.stringify(current.atc) === JSON.stringify(result.assignment)) continue;
        const updated = measureRuntime("atc.assignment.application", 1, () => ({ ...current, atc: result.assignment }));
        this.aircraft.set(current.icaoHex, updated);
        changed = true;
      }
      if (offset + ATC_RESOLUTION_BATCH_SIZE < candidates.length) await yieldToEventLoop();
    }
    if (isAtcShadowPredictionEnabled()) {
      // Assignment keys are deliberately coarse. Requeue the current
      // assignment once per resolve, never once per ATC batch.
      const seen = new Set<string>();
      for (const incoming of snapshot.aircraft) {
        const current = this.aircraft.get(incoming.icaoHex);
        const key = current ? atcResolutionKey(current) : null;
        if (!current?.atc || !key || seen.has(current.icaoHex)) continue;
        seen.add(current.icaoHex);
        this.enqueueShadowPrediction(current, current.atc.sectorId, key);
      }
    }
    if (this.shuttingDown) return;
    if (failures.length) logger.error({ failedAircraft: failures.length }, "AirRadar ATC resolution failed");
    if (changed && !this.shuttingDown) {
      this.invalidateSnapshotCache();
      this.notify();
    }
  }

  private enqueueShadowPrediction(aircraft: Aircraft, currentSector: string | null, resolutionKey: string): void {
    if (!isAtcResolutionEnabled() || !isAtcShadowPredictionEnabled() || this.shuttingDown) return;
    const hex = aircraft.icaoHex;
    // Include the observation timestamp and exact position. The assignment
    // key is intentionally coarse, while shadow prediction must refresh when
    // an aircraft moves inside the same assignment bucket.
    const workKey = `${resolutionKey}:${aircraft.lastSeen}:${aircraft.lat}:${aircraft.lon}:${aircraft.altitude ?? "unknown"}`;
    if (this.atcShadowPredictionKeys.get(hex) === workKey) return;
    const generation = (this.atcShadowPredictionGenerations.get(hex) ?? 0) + 1;
    this.atcShadowPredictionGenerations.set(hex, generation);
    this.atcShadowPredictionKeys.set(hex, workKey);
    this.pendingAtcShadowPredictions.set(hex, { aircraft, currentSector, resolutionKey: workKey, generation });
    // The map is latest-wins per ICAO. It is bounded by the live aircraft cap;
    // the hard cap is a second safety net for malformed provider snapshots.
    while (this.pendingAtcShadowPredictions.size > ATC_SHADOW_PREDICTION_MAX_PENDING) {
      const oldest = this.pendingAtcShadowPredictions.keys().next().value;
      if (typeof oldest !== "string") break;
      this.pendingAtcShadowPredictions.delete(oldest);
      this.atcShadowPredictionKeys.delete(oldest);
    }
    this.pumpShadowPredictions();
  }

  private pumpShadowPredictions(): void {
    while (
      this.atcShadowPredictionRunning < ATC_SHADOW_PREDICTION_CONCURRENCY
      && this.pendingAtcShadowPredictions.size > 0
      && !this.shuttingDown
    ) {
      const next = this.pendingAtcShadowPredictions.entries().next().value as [string, AtcShadowPredictionWork] | undefined;
      if (!next) return;
      const [hex, work] = next;
      this.pendingAtcShadowPredictions.delete(hex);
      this.atcShadowPredictionRunning += 1;
      this.atcShadowPredictionInFlight.add(hex);
      void this.runShadowPrediction(work)
        .catch((error) => {
          if (this.atcShadowPredictionKeys.get(hex) === work.resolutionKey) this.atcShadowPredictionKeys.delete(hex);
          logger.debug({ error, hex }, "AirRadar ATC shadow prediction worker failed");
        })
        .finally(() => {
          this.atcShadowPredictionRunning = Math.max(0, this.atcShadowPredictionRunning - 1);
          this.atcShadowPredictionInFlight.delete(hex);
          if (!this.aircraft.has(hex)
            && !this.atcShadowPredictionInFlight.has(hex)
            && !this.pendingAtcShadowPredictions.has(hex)) {
            this.atcShadowPredictionGenerations.delete(hex);
          }
          this.pumpShadowPredictions();
        }).catch((error) => logger.debug({ error, hex }, "AirRadar ATC shadow prediction cleanup failed"));
    }
  }

  private async runShadowPrediction(work: AtcShadowPredictionWork): Promise<void> {
    const { aircraft, currentSector, resolutionKey, generation } = work;
    const input = inputFromAircraft(aircraft);
    const dataset = input ? await loadAtcContextDataset() : null;
    if (!input) return;
    if (!dataset) {
      if (this.atcShadowPredictionKeys.get(aircraft.icaoHex) === resolutionKey) this.atcShadowPredictionKeys.delete(aircraft.icaoHex);
      return;
    }
    if (!this.isCurrentShadowPrediction(aircraft, resolutionKey, generation)) return;
    await yieldToEventLoop();
    const result = computeAtcContext(input, dataset);
    if (!this.isCurrentShadowPrediction(aircraft, resolutionKey, generation) || !isAtcShadowPredictionEnabled()) return;
    const reason = classifyAtcPrediction({
        currentSector,
        hasNextSector: result.nextSector !== null,
        onGround: aircraft.onGround,
        observedAtMs: Date.parse(aircraft.lastSeen),
        seenPosSeconds: aircraft.seenPosSeconds,
        lat: aircraft.lat,
        lon: aircraft.lon,
        track: aircraft.track,
        groundSpeed: aircraft.groundSpeed,
        currentAirspaces: result.currentAirspaces.length,
    });
    getAtcPredictionValidation().observePrediction({
        hex: aircraft.icaoHex,
        currentSector,
        predictedSector: result.nextSector?.airspace.id ?? null,
        predictedEtaSeconds: result.nextSector?.estimatedSeconds ?? null,
        suppressionReason: reason,
    });
  }

  private isCurrentShadowPrediction(aircraft: Aircraft, resolutionKey: string, generation: number): boolean {
    const current = this.aircraft.get(aircraft.icaoHex);
    return !this.shuttingDown
      && this.atcShadowPredictionGenerations.get(aircraft.icaoHex) === generation
      && this.atcShadowPredictionKeys.get(aircraft.icaoHex) === resolutionKey
      && current?.callsign === aircraft.callsign
      && current.lastSeen === aircraft.lastSeen
      && current.lat === aircraft.lat
      && current.lon === aircraft.lon
      && current.altitude === aircraft.altitude;
  }
}

const globalForState = globalThis as unknown as { aircraftState?: AircraftStateService };

export function getAircraftStateService(): AircraftStateService {
  globalForState.aircraftState ??= new AircraftStateService();
  return globalForState.aircraftState;
}
