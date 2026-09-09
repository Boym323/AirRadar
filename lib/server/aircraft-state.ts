import type { Aircraft, AircraftEnrichment, CoverageMode, ProviderSnapshot, ReceiverStatisticsRange, ReceiverStatisticsRangeResponse, ReceiverStatisticsResponse, StateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import {
  getAircraftStaleAfterMs,
  getAdsbLolStaleAfterMs,
  getHistorySampleIntervalMs,
  getMaxProviderRetryIntervalMs,
  getPollIntervalMs,
  getReceiverPosition,
} from "@/lib/server/config";
import { recordAircraftSnapshot } from "@/lib/server/history";
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

type Listener = { callback: (snapshot: StateSnapshot) => void; coverage: CoverageMode };

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
  if (aircraft.lat === null || aircraft.lon === null) return null;
  return `${aircraft.lat.toFixed(2)}:${aircraft.lon.toFixed(2)}:${aircraft.altitude === null ? "unknown" : Math.round(aircraft.altitude / 1000)}`;
}

export class AircraftStateService {
  private readonly provider: AircraftProvider;
  private readonly networkProvider: NetworkAircraftProvider;
  private readonly localAircraft = new Map<string, Aircraft>();
  /** Compatibility alias for local-only internals and existing tests. */
  private readonly aircraft = this.localAircraft;
  private readonly networkAircraft = new Map<string, Aircraft>();
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
  private readonly statistics: ReceiverStatistics;
  private readonly atcResolutionKeys = new Map<string, string>();
  private lifetimeReceptionRecord: ReceiverDailyReceptionRecord | null = null;
  private lifetimeReceptionRecordLoaded = false;
  private lastEvaluatedDailyReceptionRecord: ReceiverDailyReceptionRecord | null = null;
  private receptionEvaluationPending = false;
  private networkStopPromise: Promise<void> | null = null;

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
    this.networkProvider.start();
    this.statisticsReady = this.statistics.load()
      .catch((error) => {
        // Statistics are optional; a load failure must not prevent the first
        // live provider refresh.
        console.error("AirRadar statistics startup failed", error);
      })
      .then(() => {
        this.lastEvaluatedDailyReceptionRecord = this.statistics.getDailyReceptionRecord();
        this.scheduleReceptionRecordEvaluation();
      });
    void this.loadLifetimeReceptionRecord();
    const refresh = this.refresh();
    this.initialRefresh = Promise.all([this.statisticsReady, refresh]).then(() => undefined);
    void this.refreshNetwork();
  }

  async waitForReady(): Promise<void> {
    this.start();
    await this.initialRefresh;
  }

  async stop(options: { deadline?: number; closeStatistics?: boolean; closeProvider?: boolean } = {}): Promise<void> {
    this.shuttingDown = true;
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
    if (options.closeStatistics !== false) await this.awaitUntil(this.statistics.close(), deadline);
    if (options.closeProvider !== false) await this.awaitUntil(this.closeProviders(), deadline);
  }

  async closeStatistics(): Promise<void> { await this.statistics.close(); }

  async closeProvider(): Promise<void> { await this.closeProviders(); }

  private async closeProviders(): Promise<void> {
    try {
      await this.provider.close?.();
    } finally {
      await this.stopNetworkProvider();
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
    const aircraft = (coverage === "extended"
      ? mergeAircraftMaps(this.localAircraft, this.networkAircraft, this.currentReceiver, {
          localStaleAfterMs: getAircraftStaleAfterMs(),
          networkStaleAfterMs: getAdsbLolStaleAfterMs(),
        })
      : Array.from(this.localAircraft.values()))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .map((item) => {
        if (options.includeTrails) return { ...item, trail: item.trail.slice() };
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
    };
  }

  getProviderName(): string {
    return this.provider.name;
  }

  getDiagnostics(): {
    aircraftCount: number;
    listenerCount: number;
    running: boolean;
    enrichment: ReturnType<EnrichmentService["getDiagnostics"]>;
    network: ReturnType<NetworkAircraftProvider["getDiagnostics"]>;
  } {
    return {
      aircraftCount: this.aircraft.size,
      listenerCount: this.listeners.size,
      running: this.running,
      enrichment: this.enrichment.getDiagnostics(),
      network: this.networkProvider.getDiagnostics(),
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
    }).find((item) => item.icaoHex === normalized) ?? null;
  }

  getNetworkDiagnostics() {
    return this.networkProvider.getDiagnostics();
  }

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
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : "Unknown aircraft provider error";
        this.messagesPerSecond = null;
        this.consecutiveFailures += 1;
        this.removeStaleAircraft();
      }

      if (!this.running) return;
      this.notify();
      if (localSnapshot && this.running) {
        this.queueHistory(localSnapshot);
        void this.enrichSnapshot(localSnapshot);
        void this.resolveAtc(localSnapshot).catch((error) => {
          // ATC is optional enrichment; a provider failure must never affect live tracking.
          console.error("AirRadar ATC resolution failed", error);
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

  private async refreshNetwork(): Promise<void> {
    if (!this.running || this.networkRefreshing) return;
    this.networkRefreshing = true;
    try {
      const networkSnapshot = await this.networkProvider.getSnapshot();
      // stop() may have happened while the provider request was pending. The
      // result is deliberately discarded so shutdown cannot publish a state.
      if (!this.running) return;
      this.applyNetworkSnapshot(networkSnapshot);
      this.notify();
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
    const currentHexes = new Set<string>();
    for (const incoming of snapshot.aircraft) {
      if (Date.parse(incoming.lastSeen) < Date.now() - getAircraftStaleAfterMs()) continue;
      currentHexes.add(incoming.icaoHex);
      const localIncoming = { ...incoming, origin: "local" as const };
      const previous = this.localAircraft.get(incoming.icaoHex);
      const trail = this.updateTrail(previous, localIncoming);
      const sameCallsign = previous?.callsign === incoming.callsign;
      const enrichment = mergeEnrichment(previous?.enrichment, incoming.enrichment, sameCallsign);
      // ATC is assigned from position/altitude, not callsign. Preserve a
      // still-valid estimate across an observation callsign change.
      const atc = previous?.atc ?? incoming.atc;
      this.localAircraft.set(incoming.icaoHex, { ...localIncoming, ...(enrichment ? { enrichment } : {}), ...(atc !== undefined ? { atc } : {}), trail });
    }
    for (const hex of this.localAircraft.keys()) {
      if (!currentHexes.has(hex)) this.removeAircraft(hex);
    }
    this.messagesPerSecond = snapshot.messagesPerSecond ?? null;
    if (!this.shuttingDown) this.statistics.observe([...this.localAircraft.values()], this.currentReceiver, new Date());
    this.scheduleReceptionRecordEvaluation();
    this.alerts.observe(previousAircraft, this.localAircraft);
  }

  private applyNetworkSnapshot(snapshot: NetworkAircraftSnapshot): void {
    const currentHexes = new Set<string>();
    for (const incoming of snapshot.aircraft) {
      currentHexes.add(incoming.icaoHex);
      const networkIncoming = { ...incoming, origin: "adsblol" as const };
      const previous = this.networkAircraft.get(incoming.icaoHex);
      const trail = this.updateTrail(previous, networkIncoming, 120);
      this.networkAircraft.set(incoming.icaoHex, { ...networkIncoming, trail });
    }
    for (const hex of this.networkAircraft.keys()) {
      if (!currentHexes.has(hex)) this.networkAircraft.delete(hex);
    }
  }

  private removeStaleAircraft(): void {
    const cutoff = Date.now() - getAircraftStaleAfterMs();
    for (const [hex, item] of this.aircraft) {
      if (Date.parse(item.lastSeen) < cutoff) this.removeAircraft(hex);
    }
  }

  private removeAircraft(hex: string): void {
    this.aircraft.delete(hex);
    this.atcResolutionKeys.delete(hex);
  }

  private updateTrail(previous: Aircraft | undefined, incoming: Aircraft, limit = 80): TrailPoint[] {
    const previousTrail = previous?.trail ?? [];
    const last = previousTrail[previousTrail.length - 1];
    const canAppend = incoming.lat !== null && incoming.lon !== null &&
      (!last || Math.abs(last.lat - incoming.lat) > 0.00001 || Math.abs(last.lon - incoming.lon) > 0.00001);
    const next = canAppend && incoming.lat !== null && incoming.lon !== null
      ? [...previousTrail, {
          lat: incoming.lat,
          lon: incoming.lon,
          recordedAt: incoming.lastSeen,
          altitude: incoming.altitude,
          groundSpeed: incoming.groundSpeed,
          track: incoming.track,
        }]
      : previousTrail;
    return next.slice(-limit);
  }

  private async persistHistory(snapshot: ProviderSnapshot): Promise<void> {
    const sampledAt = Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(sampledAt)) {
      console.error("AirRadar history snapshot skipped: invalid fetchedAt");
      return;
    }

    const now = Date.now();
    const due = snapshot.aircraft
      .map((item) => historyAircraftForSnapshot(item, this.aircraft.get(item.icaoHex)))
      .filter((item) => item.lat !== null && item.lon !== null)
      .filter((item) => {
        const previous = this.lastHistorySample.get(item.icaoHex);
        return previous === undefined || sampledAt - previous >= getHistorySampleIntervalMs();
      });
    if (due.length) {
      try {
        const result = await recordAircraftSnapshot(due, new Date(sampledAt));
        for (const icaoHex of result.succeeded) this.lastHistorySample.set(icaoHex, sampledAt);
        for (const icaoHex of result.newAircraft ?? []) {
          const current = this.aircraft.get(icaoHex);
          if (current) this.alerts.observeNewAircraft(current);
        }
        if (result.failed.length) {
          console.error(`AirRadar history persistence failed for ${result.failed.length} aircraft`);
        }
      } catch (error) {
        // History is best-effort and must never make a healthy receiver look offline.
        console.error("AirRadar history persistence failed", error);
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
          console.error("AirRadar history queue failed", error);
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
    if (failures.length) console.error(`AirRadar ATC resolution failed for ${failures.length} aircraft`);
    let changed = false;
    for (const result of results) {
      const current = this.aircraft.get(result.incoming.icaoHex);
      // A slower lookup from an older position must never overwrite a newer
      // result. The coarse key is intentional throttling; a changed key is a
      // new resolution generation.
      if (!result.resolved || !current || current.callsign !== result.incoming.callsign || atcResolutionKey(current) !== result.key) continue;
      if (JSON.stringify(current.atc) === JSON.stringify(result.assignment)) continue;
      this.aircraft.set(current.icaoHex, { ...current, atc: result.assignment });
      changed = true;
    }
    if (changed && !this.shuttingDown) this.notify();
  }
}

const globalForState = globalThis as unknown as { aircraftState?: AircraftStateService };

export function getAircraftStateService(): AircraftStateService {
  globalForState.aircraftState ??= new AircraftStateService();
  return globalForState.aircraftState;
}
