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
  isTrackFusionShadowEnabled,
  isTrackFusionDigitalTwinEnabled,
} from "@/lib/server/config";
import { recordAircraftSnapshot } from "@/lib/server/history";
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
import { coverageStats, mergeAircraftMaps } from "@/lib/aircraft/source-merge";
import { computeLocalCoverageRatioFromSources, computeSourceStats } from "@/lib/aircraft/source-awareness";
import { getFlightIntelligenceService, type FlightIntelligenceService } from "@/lib/server/flight-intelligence";
import { getAlertDeliveryWorker } from "@/lib/server/alert-delivery-worker";
import { haversineDistanceKm } from "@/lib/geo";
import { logger } from "@/lib/server/logger";
import { classifyAtcPrediction, getAtcPredictionValidation } from "@/lib/server/atc-prediction-validation";
import { computeAtcContext, inputFromAircraft, loadAtcContextDataset } from "@/lib/atc-context/engine";
import { ReceiverCoverageAnalytics, type CoverageResponse } from "@/lib/server/receiver-coverage-analytics";
import { appendTrailPoint, trailPointFromAircraft } from "@/lib/aircraft/trail";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { getAltitudeDiagnostics } from "@/lib/aircraft/altitude-provenance";
import { aircraftIconNeedsInitialMetadata } from "@/lib/aircraft/icon-classification";
import { flushAircraftWeatherPersistence, persistAircraftWeatherObservations } from "@/lib/server/aircraft-weather";
import { getNavigationIntegrityService } from "@/lib/server/navigation-integrity";
import { getDestinationProvenanceDiagnostics } from "@/lib/server/destination-provenance";
import { flightPositionPersistenceShadow } from "@/lib/server/flight-position-persistence-shadow";
import {
  PredictiveStateStore,
  buildPublicEtaAdvisory,
  buildPublicRunwayChangeAdvisory,
  getPredictiveGraduationPolicy,
} from "@/lib/predictive-intelligence";
import { enforcePredictiveReadiness, readPredictiveReadinessReport } from "@/lib/server/predictive-readiness";
import type { FlightPhase } from "@/lib/intelligence/types";
import type { PredictionSample, PredictiveFlightState, PredictiveInput } from "@/lib/predictive-intelligence/types";
import type { Airport } from "@/lib/airports/types";
import { TrackFusionOutcomeValidator, TrackFusionReadinessMonitor, TrackFusionShadow } from "@/lib/track-fusion";
import { OperationalTwinEventOutcomeValidator, OperationalTwinOutcomeValidator, OperationalTwinTruthFirstValidator, type OperationalTwinEventOutcomeCaptureContext, type OperationalTwinSituation } from "@/lib/operational-twin";

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

  // Keep the aircraft attached to its last credible position while retaining
  // the rest of the newest observation (altitude, track, callsign, etc.).
  return {
    ...incoming,
    lat: previousPoint.lat,
    lon: previousPoint.lon,
    seenPosSeconds: null,
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

export function predictivePhase(aircraft: Aircraft, destination: Airport | null): FlightPhase {
  if (aircraft.onGround) return "GROUND";
  const destinationDistanceKm = destination && aircraft.lat !== null && aircraft.lon !== null
    ? haversineDistanceKm(aircraft.lat, aircraft.lon, destination.latitude, destination.longitude)
    : null;
  if (aircraft.targetState?.approachMode || (destinationDistanceKm !== null && destinationDistanceKm <= 35 && aircraft.verticalRate !== null && aircraft.verticalRate < -150)) return "APPROACH";
  if (aircraft.verticalRate !== null && aircraft.verticalRate > 250) return "CLIMB";
  if (aircraft.verticalRate !== null && aircraft.verticalRate < -250) return "DESCENT";
  if (aircraft.groundSpeed !== null && aircraft.groundSpeed > 120) return "CRUISE";
  return "UNKNOWN";
}

export function isAirportProximity(aircraft: Aircraft): boolean {
  if (aircraft.targetState?.approachMode) return true;
  const destination = aircraft.enrichment?.route?.destinationAirport;
  if (!destination || aircraft.lat === null || aircraft.lon === null) return false;
  return haversineDistanceKm(aircraft.lat, aircraft.lon, destination.latitude, destination.longitude) <= 15;
}

export function buildPredictiveShadowInput(aircraft: Aircraft, now: number, runways: PredictiveInput["runways"] = []): PredictiveInput | null {
  if (!Number.isFinite(now) || aircraft.lat === null || aircraft.lon === null) return null;
  const route = aircraft.enrichment?.route;
  const destination = route?.destinationAirport;
  const samples: PredictionSample[] = aircraft.trail.slice(-24).map((point) => ({ observedAt: Date.parse(point.recordedAt), lat: point.lat, lon: point.lon, altitudeFt: point.altitude, groundSpeedKt: point.groundSpeed, verticalRateFpm: null, trackDeg: point.track })).filter((point) => Number.isFinite(point.observedAt));
  samples.push({ observedAt: now, lat: aircraft.lat, lon: aircraft.lon, altitudeFt: aircraft.altitude, groundSpeedKt: aircraft.groundSpeed, verticalRateFpm: aircraft.verticalRate, trackDeg: aircraft.track });
  return {
    flightState: { aircraftIcao: aircraft.icaoHex, timestamp: now, phase: predictivePhase(aircraft, destination ?? null), sample: samples.at(-1)!, destination: route?.destination ?? null, destinationStatus: destination ? "KNOWN" : "UNKNOWN" },
    recentSamples: samples,
    destinationAirport: destination ? { icao: destination.icaoCode, lat: destination.latitude, lon: destination.longitude, elevationFt: destination.elevationFt } : null,
    runways,
    now,
  };
}

function historyAircraftForSnapshot(snapshotItem: Aircraft, current: Aircraft | undefined): Aircraft {
  if (!current) return snapshotItem;

  const sameCallsign = current.callsign === snapshotItem.callsign;
  const metadata = snapshotItem.enrichment?.metadata ?? current.enrichment?.metadata;
  const route = snapshotItem.enrichment?.route ?? (sameCallsign ? current.enrichment?.route : undefined);
  const flightPlan = snapshotItem.enrichment?.flightPlan ?? (sameCallsign ? current.enrichment?.flightPlan : undefined);
  const enrichment: AircraftEnrichment = {};
  if (metadata) enrichment.metadata = metadata;
  if (route) enrichment.route = route;
  if (flightPlan) enrichment.flightPlan = flightPlan;

  return {
    ...snapshotItem,
    registration: snapshotItem.registration ?? current.registration,
    aircraftType: snapshotItem.aircraftType ?? current.aircraftType,
    aircraftDescription: snapshotItem.aircraftDescription ?? current.aircraftDescription,
    ...(Object.keys(enrichment).length ? { enrichment } : {}),
  };
}

function atcResolutionKey(aircraft: Pick<Aircraft, "lat" | "lon" | "altitude">): string | null {
  const lat = aircraft.lat;
  const lon = aircraft.lon;
  if (typeof lat !== "number" || !Number.isFinite(lat) || typeof lon !== "number" || !Number.isFinite(lon)) return null;
  const altitude = typeof aircraft.altitude === "number" && Number.isFinite(aircraft.altitude) ? aircraft.altitude : null;
  return `${lat.toFixed(2)}:${lon.toFixed(2)}:${altitude === null ? "unknown" : Math.round(altitude / 1000)}`;
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
  /** Shadow-only multi-source state estimator. It never mutates canonical live aircraft. */
  private readonly trackFusionShadow = new TrackFusionShadow(isTrackFusionShadowEnabled());
  /** Process-local bounded readiness evidence. Restart intentionally resets readiness to WAIT. */
  private readonly trackFusionReadiness = new TrackFusionReadinessMonitor();
  /** Prospective canonical-vs-fused outcome validation against future LOCAL observations. */
  private readonly trackFusionOutcome = new TrackFusionOutcomeValidator();
  /** Request-driven Operational Digital Twin calibration against future LOCAL receiver truth. */
  private readonly operationalTwinOutcome = new OperationalTwinOutcomeValidator();
  /** Predicted Digital Twin event timing/precision validation against independent live evidence. */
  private readonly operationalTwinEventOutcome = new OperationalTwinEventOutcomeValidator();
  /** Truth-first terminal recall validation from independent Flight Intelligence LANDING events. */
  private readonly operationalTwinTruthFirst = new OperationalTwinTruthFirstValidator();
  private readonly lastHistorySample = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private messagesPerSecond: number | null = null;
  private lastSourceUpdate: string | null = null;
  private lastError: string | null = null;
  private running = false;
  private refreshing = false;
  private networkRefreshing = false;
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
  private readonly predictiveEvaluatedAt = new Map<string, number>();
  private predictiveAlertEvaluationInFlight = false;
  private readonly statistics: ReceiverStatistics;
  private readonly receiverCoverage = new ReceiverCoverageAnalytics();
  private readonly navigationIntegrity = getNavigationIntegrityService();
  private readonly atcResolutionKeys = new Map<string, string>();
  private readonly atcShadowPredictionKeys = new Map<string, string>();
  private readonly atcShadowPredictionInFlight = new Set<string>();
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
    const refresh = this.refresh();
    this.initialRefresh = Promise.all([this.statisticsReady, refresh]).then(() => undefined);
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
    this.snapshotBuildCounts[coverage] += 1;
    const aircraft = (coverage === "extended"
      ? mergeAircraftMaps(this.localAircraft, this.networkAircraft, this.currentReceiver, {
          localStaleAfterMs: getAircraftStaleAfterMs(),
          networkStaleAfterMs: getAdsbLolStaleAfterMs(),
          sourcePreferences: this.sourcePreferences,
        })
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
    trailEstimatedBytes: number;
    listenerCount: number;
    running: boolean;
    enrichment: ReturnType<EnrichmentService["getDiagnostics"]>;
    network: ReturnType<NetworkAircraftProvider["getDiagnostics"]>;
    local: ReturnType<NonNullable<AircraftProvider["getDiagnostics"]>> | null;
    coverageAnalytics: ReturnType<ReceiverCoverageAnalytics["getDiagnostics"]>;
    altitudeDiagnostics: ReturnType<typeof getAltitudeDiagnostics>;
    flightPositionPersistenceShadow: ReturnType<typeof flightPositionPersistenceShadow.diagnostics>;
    predictiveIntelligence: ReturnType<PredictiveStateStore["diagnostics"]>;
    flightIntelligence: ReturnType<FlightIntelligenceService["getDiagnostics"]>;
    destinationProvenance: ReturnType<typeof getDestinationProvenanceDiagnostics>;
    continuity: ReturnType<AircraftContinuityGuard["diagnostics"]>;
    trackFusionShadow: ReturnType<TrackFusionShadow["diagnostics"]>;
    trackFusionReadiness: ReturnType<TrackFusionReadinessMonitor["report"]>;
    trackFusionOutcome: ReturnType<TrackFusionOutcomeValidator["report"]>;
    operationalTwinOutcome: ReturnType<OperationalTwinOutcomeValidator["report"]>;
    operationalTwinEventOutcome: ReturnType<OperationalTwinEventOutcomeValidator["report"]>;
  } {
    return {
      aircraftCount: this.aircraft.size,
      localTrailAircraftCount: this.localAircraft.size,
      networkTrailAircraftCount: this.networkAircraft.size,
      localTrailPointCount: [...this.localAircraft.values()].reduce((total, aircraft) => total + aircraft.trail.length, 0),
      networkTrailPointCount: [...this.networkAircraft.values()].reduce((total, aircraft) => total + aircraft.trail.length, 0),
      // Practical estimate for one retained TrailPoint including V8 object/array overhead.
      trailEstimatedBytes: ([...this.localAircraft.values(), ...this.networkAircraft.values()]
        .reduce((total, aircraft) => total + aircraft.trail.length, 0)) * 96,
      listenerCount: this.listeners.size,
      running: this.running,
      enrichment: this.enrichment.getDiagnostics(),
      network: this.networkProvider.getDiagnostics(),
      local: "getDiagnostics" in this.provider && typeof this.provider.getDiagnostics === "function" ? this.provider.getDiagnostics() : null,
      coverageAnalytics: this.receiverCoverage.getDiagnostics(),
      altitudeDiagnostics: getAltitudeDiagnostics(),
      flightPositionPersistenceShadow: flightPositionPersistenceShadow.diagnostics(),
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
      trackFusionShadow: this.trackFusionShadow.diagnostics(),
      trackFusionReadiness: this.getTrackFusionReadinessReport(),
      trackFusionOutcome: this.getTrackFusionOutcomeReport(),
      operationalTwinOutcome: this.getOperationalTwinOutcomeReport(),
      operationalTwinEventOutcome: this.getOperationalTwinEventOutcomeReport(),
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
    return mergeAircraftMaps(this.localAircraft, this.networkAircraft, this.currentReceiver, {
      localStaleAfterMs: getAircraftStaleAfterMs(),
      networkStaleAfterMs: getAdsbLolStaleAfterMs(),
      sourcePreferences: this.sourcePreferences,
    }).find((item) => item.icaoHex === normalized) ?? null;
  }

  /** Read the last bounded live prediction; the API must never recompute it. */
  getPredictiveState(icaoHex: string) {
    return this.predictive.get(icaoHex);
  }

  getPredictiveDiagnostics() {
    return this.predictive.diagnostics();
  }

  /** Shadow-only fused state for admin validation; never used by SSE or persistence. */
  getTrackFusionShadowTrack(icaoHex: string) {
    return this.trackFusionShadow.getTrack(icaoHex);
  }

  getTrackFusionShadowDiagnostics() {
    return this.trackFusionShadow.diagnostics();
  }

  getTrackFusionReadinessReport(now = new Date()) {
    return this.trackFusionReadiness.report(isTrackFusionShadowEnabled(), {
      now,
      digitalTwinConfigured: isTrackFusionDigitalTwinEnabled(),
    });
  }

  getTrackFusionOutcomeReport(now = new Date()) {
    return this.trackFusionOutcome.report(now);
  }

  captureOperationalTwinOutcome(situation: OperationalTwinSituation): void {
    this.operationalTwinOutcome.capture(situation);
  }

  getOperationalTwinOutcomeReport(now = new Date()) {
    return this.operationalTwinOutcome.report(now);
  }

  captureOperationalTwinEventOutcome(
    situation: OperationalTwinSituation,
    context: OperationalTwinEventOutcomeCaptureContext,
  ): void {
    this.operationalTwinEventOutcome.capture(situation, context);
    this.operationalTwinTruthFirst.capture(situation, context);
  }

  getOperationalTwinEventOutcomeReport(now = new Date()) {
    return {
      ...this.operationalTwinEventOutcome.report(now),
      truthFirst: this.operationalTwinTruthFirst.report(now),
    };
  }

  getNetworkDiagnostics() {
    return this.networkProvider.getDiagnostics();
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
        void this.hydrateInitialIconMetadata(localSnapshot.aircraft)
          .then((aircraft) => {
            if (!this.running) return;
            this.applyInitialMetadata(aircraft);
          })
          .catch((error) => {
            logger.debug({ error }, "AirRadar local metadata hydration skipped");
          });
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
        this.observeTrackFusionShadow(now);
        this.invalidateSnapshotCache();
      }

      if (!this.running) return;
      this.notify();
      if (localSnapshot && this.running) {
        this.queueHistory(localSnapshot);
        void this.enrichSnapshot(localSnapshot);
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

  private async hydrateInitialIconMetadata<T extends ProviderSnapshot["aircraft"]>(aircraft: T): Promise<T> {
    if (!this.enrichment.hasInitialMetadataProvider) return aircraft;

    const candidates = aircraft.filter((item) => {
      if (this.localAircraft.get(item.icaoHex)?.enrichment?.metadata) return false;
      return aircraftIconNeedsInitialMetadata(item);
    });
    if (candidates.length === 0) return aircraft;

    const results = await Promise.all(candidates.map(async (item) => ({
      icaoHex: item.icaoHex,
      metadata: await this.enrichment.getInitialAircraftMetadata(item.icaoHex),
    })));
    const metadataByHex = new Map(results
      .filter((result) => result.metadata !== null)
      .map((result) => [result.icaoHex, result.metadata!]));
    if (metadataByHex.size === 0) return aircraft;

    return aircraft.map((item) => {
        const metadata = metadataByHex.get(item.icaoHex);
        if (!metadata) return item;
        return {
          ...item,
          enrichment: {
            ...(item.enrichment ?? {}),
            metadata,
          },
        };
    }) as T;
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

      // Network-only aircraft should still receive the same initial metadata
      // lookup as local aircraft, but enrichment is deliberately best-effort.
      try {
        const aircraft = await this.hydrateInitialIconMetadata(networkSnapshot.aircraft);
        if (!this.running) return;
        this.applyNetworkSnapshot({ ...networkSnapshot, aircraft });
        this.notify();
      } catch (error) {
        logger.debug({ error }, "AirRadar network metadata hydration skipped");
      }
    } catch {
      // The optional provider owns its bounded stale state and diagnostics.
      // A network failure must never change local receiver health.
    } finally {
      this.networkRefreshing = false;
      if (this.running && this.networkProvider.getDiagnostics().enabled) {
        const delay = this.networkProvider.getNextPollDelayMs?.() ?? this.networkProvider.getDiagnostics().pollIntervalMs;
        this.networkTimer = setTimeout(() => {
          this.networkTimer = null;
          void this.refreshNetwork();
        }, Number.isFinite(delay) && delay >= 0 ? delay : getAdsbLolStaleAfterMs());
      }
    }
  }

  private applySnapshot(snapshot: ProviderSnapshot): void {
    this.currentReceiver = snapshot.receiver;
    const previousAircraft = new Map(this.localAircraft);
    const previousObservedHexes = this.localObservedHexes;
    const currentHexes = new Set<string>();
    const now = Date.now();
    for (const incoming of snapshot.aircraft) {
      if (Date.parse(incoming.lastSeen) < now - getAircraftStaleAfterMs()) continue;
      currentHexes.add(incoming.icaoHex);
      this.continuity.recordObservation("local", incoming.icaoHex, now, getAircraftReappearWindowMs());
      this.sourcePreferences.set(incoming.icaoHex, this.sourcePreferences.get(incoming.icaoHex) ?? "local");
      const previous = this.localAircraft.get(incoming.icaoHex);
      const localIncoming = plausiblePosition(previous, { ...incoming, origin: "local" as const });
      const trail = this.updateTrail(previous, localIncoming);
      const sameCallsign = previous?.callsign === incoming.callsign;
      const enrichment = mergeEnrichment(previous?.enrichment, incoming.enrichment, sameCallsign);
      // ATC is assigned from position/altitude, not callsign. Preserve a
      // still-valid estimate across an observation callsign change.
      const atc = previous?.atc ?? incoming.atc;
      this.localAircraft.set(incoming.icaoHex, { ...localIncoming, ...(enrichment ? { enrichment } : {}), ...(atc !== undefined ? { atc } : {}), trail });
    }
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
    this.reconcileSourcePreferences(now);
    if (!massDrop.deferPrune) this.pruneMissingAircraft("local", currentHexes, getAircraftStaleAfterMs(), now);
    this.reconcileSourcePreferences(now);
    this.observeTrackFusionShadow(now);
    this.operationalTwinOutcome.observeTruth(this.localAircraft, now);
    this.operationalTwinEventOutcome.observeLocal(this.localAircraft, now);
    const activeHexes = new Set(this.localAircraft.keys());
    this.messagesPerSecond = snapshot.messagesPerSecond ?? null;
    if (!this.shuttingDown) this.statistics.observe([...this.localAircraft.values()], this.currentReceiver, new Date());
    this.scheduleReceptionRecordEvaluation();
    this.alerts.observe(previousAircraft, this.localAircraft);
    this.intelligence.cleanup(activeHexes);
    const predictiveAlertCandidates: Array<{ aircraft: Aircraft; prediction: PredictiveFlightState }> = [];
    const snapshotAt = Date.parse(snapshot.fetchedAt);
    for (const current of this.localAircraft.values()) {
      const events = this.intelligence.observe(previousAircraft.get(current.icaoHex), current, snapshotAt);
      this.operationalTwinEventOutcome.observeIntelligence(events, snapshotAt);
      this.operationalTwinTruthFirst.observeIntelligence(events, snapshotAt);
      for (const event of events) this.alerts.observeIntelligenceEvent(current, event);
      const prediction = this.evaluatePredictiveShadow(current, snapshotAt);
      if (prediction) predictiveAlertCandidates.push({ aircraft: current, prediction });
    }
    if (predictiveAlertCandidates.length && this.alerts.hasPredictiveRules()) {
      this.schedulePredictiveWatchlistAlerts(predictiveAlertCandidates);
    }
    for (const hex of this.predictiveEvaluatedAt.keys()) if (!activeHexes.has(hex)) { this.predictiveEvaluatedAt.delete(hex); this.predictive.forget(hex); }
    this.navigationIntegrity.observe([...this.localAircraft.values()], new Date(snapshot.fetchedAt));
    this.invalidateSnapshotCache();
  }

  private evaluatePredictiveShadow(aircraft: Aircraft, now: number): PredictiveFlightState | null {
    if (!Number.isFinite(now) || aircraft.lat === null || aircraft.lon === null) return null;
    const previousAt = this.predictiveEvaluatedAt.get(aircraft.icaoHex) ?? 0;
    if (now - previousAt < 10_000) return null;
    this.predictiveEvaluatedAt.set(aircraft.icaoHex, now);
    const destination = aircraft.enrichment?.route?.destinationAirport;
    const input = buildPredictiveShadowInput(aircraft, now, destination ? this.intelligence.getRunways(destination.icaoCode) : []);
    if (!input) return null;
    input.flightState.lifecycleKey = this.intelligence.getLifecycleKey(aircraft.icaoHex);
    input.flightState.flightId = null;
    input.aircraft = aircraft;
    return this.predictive.evaluate(input);
  }

  private schedulePredictiveWatchlistAlerts(
    candidates: Array<{ aircraft: Aircraft; prediction: PredictiveFlightState }>,
  ): void {
    if (this.predictiveAlertEvaluationInFlight || this.shuttingDown) return;
    const configuredPolicy = getPredictiveGraduationPolicy();
    if (configuredPolicy.ETA !== "PUBLIC" && configuredPolicy.RUNWAY_CHANGE !== "PUBLIC") return;

    this.predictiveAlertEvaluationInFlight = true;
    void (async () => {
      const readiness = await readPredictiveReadinessReport();
      if (this.shuttingDown) return;
      const effectivePolicy = enforcePredictiveReadiness(configuredPolicy, {
        thresholdVersion: readiness.thresholds.version,
        capabilities: readiness.capabilities,
      });
      const now = Date.now();

      for (const candidate of candidates) {
        const current = this.localAircraft.get(candidate.aircraft.icaoHex);
        if (!current || current.callsign !== candidate.aircraft.callsign) continue;
        const etaAdvisory = buildPublicEtaAdvisory(
          candidate.prediction,
          effectivePolicy,
          readiness.capabilities.ETA,
          now,
        );
        const runwayChangeAdvisory = buildPublicRunwayChangeAdvisory(
          candidate.prediction,
          effectivePolicy,
          readiness.capabilities.RUNWAY_CHANGE,
          now,
        );
        this.alerts.observePredictiveAdvisories(current, {
          destinationIcao: current.enrichment?.route?.destinationAirport?.icaoCode ?? null,
          etaAdvisory,
          runwayChangeAdvisory,
        });
      }
    })().catch((error) => {
      logger.debug({ error }, "AirRadar predictive watchlist alert evaluation skipped");
    }).finally(() => {
      this.predictiveAlertEvaluationInFlight = false;
    });
  }

  private applyNetworkSnapshot(snapshot: NetworkAircraftSnapshot): void {
    const previousObservedHexes = this.networkObservedHexes;
    const currentHexes = new Set<string>();
    const now = Date.now();
    const cutoff = now - getAdsbLolStaleAfterMs();
    for (const incoming of snapshot.aircraft) {
      const lastSeen = Date.parse(incoming.lastSeen);
      if (!Number.isFinite(lastSeen) || lastSeen < cutoff) continue;
      currentHexes.add(incoming.icaoHex);
      this.continuity.recordObservation("network", incoming.icaoHex, now, getAircraftReappearWindowMs());
      this.sourcePreferences.set(incoming.icaoHex, this.sourcePreferences.get(incoming.icaoHex) ?? "network");
      const previous = this.networkAircraft.get(incoming.icaoHex);
      const networkIncoming = plausiblePosition(previous, { ...incoming, origin: incoming.origin ?? "adsblol" });
      const trail = this.updateTrail(previous, networkIncoming);
      this.networkAircraft.set(incoming.icaoHex, { ...networkIncoming, trail });
    }
    this.continuity.observeMembership("network", previousObservedHexes, currentHexes, now);
    const massDrop = this.continuity.evaluateMassDrop("network", previousObservedHexes, currentHexes, now, {
      enabled: isAircraftMassDropGuardEnabled(),
      minBaseline: getAircraftMassDropMinBaseline(),
      dropRatio: getAircraftMassDropRatio(),
    });
    this.logMassDropDecision("network", massDrop);
    this.networkObservedHexes = currentHexes;
    this.reconcileSourcePreferences(now);
    if (!massDrop.deferPrune) this.pruneMissingAircraft("network", currentHexes, getAdsbLolStaleAfterMs(), now);
    this.reconcileSourcePreferences(now);
    this.observeTrackFusionShadow(now);
    this.navigationIntegrity.observe([...this.networkAircraft.values()], new Date(snapshot.fetchedAt ?? new Date().toISOString()));
    this.invalidateSnapshotCache();
  }

  private observeTrackFusionShadow(now = Date.now()): void {
    const evaluatedTracks = this.trackFusionShadow.observe({
      local: this.localAircraft,
      network: this.networkAircraft,
      receiver: this.currentReceiver,
      localStaleAfterMs: getAircraftStaleAfterMs(),
      networkStaleAfterMs: getAdsbLolStaleAfterMs(),
      sourcePreferences: this.sourcePreferences,
      now,
    });
    this.trackFusionReadiness.observe(this.trackFusionShadow.diagnostics(), now);
    this.trackFusionOutcome.observe({
      local: this.localAircraft,
      network: this.networkAircraft,
      evaluatedTracks,
      receiver: this.currentReceiver,
      localStaleAfterMs: getAircraftStaleAfterMs(),
      networkStaleAfterMs: getAdsbLolStaleAfterMs(),
      sourcePreferences: this.sourcePreferences,
      now,
    });
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
    getAtcPredictionValidation().remove(hex);
  }

  private updateTrail(previous: Aircraft | undefined, incoming: Aircraft): TrailPoint[] {
    const previousTrail = previous?.trail ?? [];
    const sourceChanged = Boolean(previous?.provenance?.positionOrigin && incoming.provenance?.positionOrigin
      && (previous.provenance.positionOrigin !== incoming.provenance.positionOrigin
        || previous.provenance.positionSource !== incoming.provenance.positionSource));
    const base = sourceChanged ? [] : previousTrail;
    const point = trailPointFromAircraft(incoming);
    const next = point ? appendTrailPoint(base, point) : base;
    if (incoming.origin !== "local") {
      const cutoff = Date.parse(incoming.lastSeen) - getNetworkTrailMaxAgeMs();
      const bounded = next.filter((point) => {
        const recordedAt = Date.parse(point.recordedAt);
        return !Number.isFinite(cutoff) || (Number.isFinite(recordedAt) && recordedAt >= cutoff);
      });
      return bounded.slice(-getNetworkTrailMaxPoints());
    }
    return next;
  }

  private async persistHistory(snapshot: ProviderSnapshot): Promise<void> {
    const sampledAt = Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(sampledAt)) {
      logger.error("AirRadar history snapshot skipped: invalid fetchedAt");
      return;
    }

    const now = Date.now();
    const activeHexes = snapshot.aircraft.map((item) => item.icaoHex);
    for (const item of snapshot.aircraft) {
      if (item.lat === null || item.lon === null) continue;
      const previous = this.lastHistorySample.get(item.icaoHex);
      const currentPersist = previous === undefined || sampledAt - previous >= getHistorySampleIntervalMs();
      flightPositionPersistenceShadow.observe({
        aircraftHex: item.icaoHex,
        currentPersist,
        candidate: {
          recordedAtMs: sampledAt, lat: item.lat, lon: item.lon, altitudeFt: item.altitude,
          trackDeg: item.track, groundSpeedKt: item.groundSpeed, verticalRateFpm: item.verticalRate,
          onGround: item.onGround, source: item.provenance?.positionSource ?? item.source,
          airportProximity: isAirportProximity(item),
          phase: item.onGround ? "airport" : item.targetState?.approachMode ? "approach" : item.verticalRate !== null && item.verticalRate >= 250 ? "climb" : item.verticalRate !== null && item.verticalRate <= -250 ? "descent" : item.groundSpeed !== null && item.groundSpeed > 120 ? "cruise" : "unknown",
        },
        nowMs: now,
      });
    }
    flightPositionPersistenceShadow.cleanup(activeHexes, now);
    const due = snapshot.aircraft
      .map((item) => historyAircraftForSnapshot(item, this.aircraft.get(item.icaoHex)))
      .filter((item) => item.lat !== null && item.lon !== null)
      .filter((item) => {
        const previous = this.lastHistorySample.get(item.icaoHex);
        return previous === undefined || sampledAt - previous >= getHistorySampleIntervalMs();
      });
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
    });
  }

  private queueHistory(snapshot: ProviderSnapshot): void {
    if (!this.running) return;
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
    if (!this.enrichment.hasProviders) return;
    const candidates = snapshot.aircraft.filter((item) => {
      const current = this.aircraft.get(item.icaoHex);
      return this.enrichment.needsEnrichment(item, current?.enrichment);
    });
    const results = await Promise.allSettled(candidates.map(async (item) => ({
      item,
      enrichment: await this.enrichment.enrich(item, new Date(snapshot.fetchedAt)),
    })));
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
    const failures: string[] = [];
    const results = await Promise.all(snapshot.aircraft.map(async (incoming) => {
      const key = atcResolutionKey(incoming);
      if (!key || !this.aircraft.has(incoming.icaoHex)) return { incoming, key, assignment: null, resolved: false };
      if (this.atcResolutionKeys.get(incoming.icaoHex) === key) return { incoming, key, assignment: this.aircraft.get(incoming.icaoHex)?.atc ?? null, resolved: true };
      this.atcResolutionKeys.set(incoming.icaoHex, key);
      try {
        const match = await this.atc.lookup({ latitude: incoming.lat!, longitude: incoming.lon!, altitudeFt: incoming.altitude, observedAt: new Date(snapshot.fetchedAt) });
        if (!this.aircraft.has(incoming.icaoHex)) {
          if (this.atcResolutionKeys.get(incoming.icaoHex) === key) this.atcResolutionKeys.delete(incoming.icaoHex);
          return { incoming, key, assignment: null, resolved: false };
        }
        return { incoming, key, assignment: match ? assignmentFromMatch(match) : null, resolved: true };
      } catch {
        // Do not permanently memoize a transient ATC/database failure. The
        // next snapshot must be allowed to retry this aircraft.
        if (this.atcResolutionKeys.get(incoming.icaoHex) === key) this.atcResolutionKeys.delete(incoming.icaoHex);
        failures.push(incoming.icaoHex);
        return { incoming, key, assignment: null, resolved: false };
      }
    }));
    if (this.shuttingDown) return;
    if (failures.length) logger.error({ failedAircraft: failures.length }, "AirRadar ATC resolution failed");
    let changed = false;
    for (const result of results) {
      const current = this.aircraft.get(result.incoming.icaoHex);
      // A slower lookup from an older position must never overwrite a newer
      // result. The coarse key is intentional throttling; a changed key is a
      // new resolution generation.
      const resolutionKey = result.key;
      if (!result.resolved || !resolutionKey || !current || current.callsign !== result.incoming.callsign || atcResolutionKey(current) !== resolutionKey) continue;
      const validation = getAtcPredictionValidation();
      validation.observeCurrentSector(current.icaoHex, result.assignment?.sectorId ?? null, Date.parse(current.lastSeen));
      void this.evaluateShadowPrediction(current, result.assignment?.sectorId ?? null, resolutionKey);
      if (JSON.stringify(current.atc) === JSON.stringify(result.assignment)) continue;
      this.aircraft.set(current.icaoHex, { ...current, atc: result.assignment });
      changed = true;
    }
    if (changed && !this.shuttingDown) {
      this.invalidateSnapshotCache();
      this.notify();
    }
  }

  private async evaluateShadowPrediction(aircraft: Aircraft, currentSector: string | null, resolutionKey: string): Promise<void> {
    if (this.atcShadowPredictionInFlight.has(aircraft.icaoHex) || this.atcShadowPredictionKeys.get(aircraft.icaoHex) === resolutionKey) return;
    this.atcShadowPredictionKeys.set(aircraft.icaoHex, resolutionKey);
    this.atcShadowPredictionInFlight.add(aircraft.icaoHex);
    try {
      const input = inputFromAircraft(aircraft);
      const dataset = input ? await loadAtcContextDataset() : null;
      if (!input || !dataset || !this.aircraft.has(aircraft.icaoHex)) {
        if (!dataset && this.atcShadowPredictionKeys.get(aircraft.icaoHex) === resolutionKey) this.atcShadowPredictionKeys.delete(aircraft.icaoHex);
        return;
      }
      const result = computeAtcContext(input, dataset);
      const observedAtMs = Date.parse(aircraft.lastSeen);
      const reason = classifyAtcPrediction({
        currentSector,
        hasNextSector: result.nextSector !== null,
        onGround: aircraft.onGround,
        observedAtMs,
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
    } catch (error) {
      if (this.atcShadowPredictionKeys.get(aircraft.icaoHex) === resolutionKey) this.atcShadowPredictionKeys.delete(aircraft.icaoHex);
      logger.debug({ error, hex: aircraft.icaoHex }, "AirRadar ATC shadow prediction skipped");
    } finally {
      this.atcShadowPredictionInFlight.delete(aircraft.icaoHex);
    }
  }
}

const globalForState = globalThis as unknown as { aircraftState?: AircraftStateService };

export function getAircraftStateService(): AircraftStateService {
  globalForState.aircraftState ??= new AircraftStateService();
  return globalForState.aircraftState;
}
