import type { Aircraft, AircraftEnrichment, ProviderSnapshot, RadarStats, StateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import {
  getAircraftStaleAfterMs,
  getHistorySampleIntervalMs,
  getMaxProviderRetryIntervalMs,
  getPollIntervalMs,
  getReceiverPosition,
} from "@/lib/server/config";
import { recordAircraftSnapshot } from "@/lib/server/history";
import { createAircraftProvider, createEnrichmentService } from "@/lib/server/providers";
import type { EnrichmentService } from "@/lib/server/enrichment-cache";
import type { AircraftProvider } from "@/lib/server/provider";
import { assignmentFromMatch, AtcSectorService } from "@/lib/server/atc-sector-service";
import { createAtcSectorProvider } from "@/lib/server/providers";

type Listener = (snapshot: StateSnapshot) => void;

function emptyStats(): RadarStats {
  return {
    currentAircraft: 0,
    aircraftSeenToday: 0,
    uniqueAircraftToday: 0,
    maxConcurrentAircraft: 0,
    maxDistanceKm: 0,
    aircraftTypes: [],
    airlines: [],
    messagesPerSecond: null,
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

export class AircraftStateService {
  private readonly provider: AircraftProvider;
  private readonly aircraft = new Map<string, Aircraft>();
  private readonly seenToday = new Map<string, string>();
  private readonly lastHistorySample = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private stats = emptyStats();
  private lastSourceUpdate: string | null = null;
  private lastError: string | null = null;
  private running = false;
  private refreshing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private initialRefresh: Promise<void> | null = null;
  private consecutiveFailures = 0;
  private historyWriteActive = false;
  private pendingHistorySnapshot: ProviderSnapshot | null = null;
  private readonly enrichment: EnrichmentService;
  private readonly atc: AtcSectorService;
  private readonly atcResolutionKeys = new Map<string, string>();
  private observationDate = new Date().toISOString().slice(0, 10);

  constructor(
    provider: AircraftProvider = createAircraftProvider(),
    enrichment: EnrichmentService = createEnrichmentService(),
    atc: AtcSectorService = new AtcSectorService(createAtcSectorProvider()),
  ) {
    this.provider = provider;
    this.enrichment = enrichment;
    this.atc = atc;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.initialRefresh = this.refresh();
  }

  async waitForReady(): Promise<void> {
    this.start();
    await this.initialRefresh;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.initialRefresh;
    await this.provider.close?.();
  }

  subscribe(listener: Listener): () => void {
    this.start();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(options: { includeTrails?: boolean } = {}): StateSnapshot {
    const aircraft = Array.from(this.aircraft.values())
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .map((item) => {
        if (options.includeTrails) return { ...item, trail: item.trail.slice() };
        return { ...item, trail: undefined };
      });
    return {
      aircraft,
      receiver: this.currentReceiver,
      fetchedAt: this.lastSourceUpdate ?? new Date().toISOString(),
      provider: this.provider.name,
      sourceOnline: this.lastSourceUpdate !== null && this.lastError === null,
      lastSourceUpdate: this.lastSourceUpdate,
      sourceError: this.lastError,
      readsbOnline: this.lastSourceUpdate !== null && this.lastError === null,
      lastReadsbUpdate: this.lastSourceUpdate,
      lastError: this.lastError,
      stats: { ...this.stats, currentAircraft: this.aircraft.size },
    };
  }

  getProviderName(): string {
    return this.provider.name;
  }

  getAircraft(icaoHex: string): Aircraft | null {
    return this.aircraft.get(icaoHex.toUpperCase()) ?? null;
  }

  private currentReceiver = getReceiverPosition();

  private async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const snapshot = await this.provider.getSnapshot();
      this.applySnapshot(snapshot);
      this.lastSourceUpdate = snapshot.fetchedAt;
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.notify();
      this.queueHistory(snapshot);
      void this.enrichSnapshot(snapshot);
      void this.resolveAtc(snapshot);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown aircraft provider error";
      this.consecutiveFailures += 1;
      this.removeStaleAircraft();
      this.notify();
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

  private applySnapshot(snapshot: ProviderSnapshot): void {
    this.currentReceiver = snapshot.receiver;
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.observationDate) {
      this.observationDate = today;
      this.seenToday.clear();
      this.stats.maxDistanceKm = 0;
      this.stats.maxConcurrentAircraft = 0;
    }
    const currentHexes = new Set<string>();
    for (const incoming of snapshot.aircraft) {
      if (Date.parse(incoming.lastSeen) < Date.now() - getAircraftStaleAfterMs()) continue;
      currentHexes.add(incoming.icaoHex);
      const previous = this.aircraft.get(incoming.icaoHex);
      const trail = this.updateTrail(previous, incoming);
      const sameCallsign = previous?.callsign === incoming.callsign;
      const enrichment = mergeEnrichment(previous?.enrichment, incoming.enrichment, sameCallsign);
      const atc = previous?.callsign === incoming.callsign ? previous.atc : incoming.atc;
      this.aircraft.set(incoming.icaoHex, { ...incoming, ...(enrichment ? { enrichment } : {}), ...(atc !== undefined ? { atc } : {}), trail });
      this.seenToday.set(incoming.icaoHex, today);
      if ((incoming.distanceKm ?? 0) > this.stats.maxDistanceKm) {
        this.stats.maxDistanceKm = incoming.distanceKm ?? this.stats.maxDistanceKm;
      }
    }
    for (const hex of this.aircraft.keys()) {
      if (!currentHexes.has(hex)) this.removeAircraft(hex);
    }
    this.stats.currentAircraft = this.aircraft.size;
    for (const [hex, date] of this.seenToday) {
      if (date !== today && !this.aircraft.has(hex)) this.seenToday.delete(hex);
    }
    this.stats.uniqueAircraftToday = this.seenToday.size;
    this.stats.aircraftSeenToday = this.seenToday.size;
    this.stats.maxConcurrentAircraft = Math.max(this.stats.maxConcurrentAircraft, this.aircraft.size);
    this.stats.messagesPerSecond = snapshot.messagesPerSecond ?? this.stats.messagesPerSecond;
    const typeCounts = new Map<string, number>();
    const airlineCounts = new Map<string, number>();
    for (const item of this.aircraft.values()) {
      const type = item.enrichment?.metadata?.icaoTypeCode ?? item.aircraftType;
      if (type) typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      const airline = item.enrichment?.route?.airline;
      if (airline) airlineCounts.set(airline, (airlineCounts.get(airline) ?? 0) + 1);
    }
    this.stats.aircraftTypes = [...typeCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    this.stats.airlines = [...airlineCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  private removeStaleAircraft(): void {
    const cutoff = Date.now() - getAircraftStaleAfterMs();
    for (const [hex, item] of this.aircraft) {
      if (Date.parse(item.lastSeen) < cutoff) this.removeAircraft(hex);
    }
    this.stats.currentAircraft = this.aircraft.size;
  }

  private removeAircraft(hex: string): void {
    this.aircraft.delete(hex);
    this.atcResolutionKeys.delete(hex);
    this.lastHistorySample.delete(hex);
  }

  private updateTrail(previous: Aircraft | undefined, incoming: Aircraft): TrailPoint[] {
    const previousTrail = previous?.trail ?? [];
    const last = previousTrail[previousTrail.length - 1];
    const canAppend = incoming.lat !== null && incoming.lon !== null &&
      (!last || Math.abs(last.lat - incoming.lat) > 0.00001 || Math.abs(last.lon - incoming.lon) > 0.00001);
    const next = canAppend && incoming.lat !== null && incoming.lon !== null
      ? [...previousTrail, { lat: incoming.lat, lon: incoming.lon, recordedAt: incoming.lastSeen }]
      : previousTrail;
    return next.slice(-80);
  }

  private async persistHistory(snapshot: ProviderSnapshot): Promise<void> {
    const now = Date.now();
    const due = snapshot.aircraft.map((item) => this.aircraft.get(item.icaoHex) ?? item).filter((item) => {
      const previous = this.lastHistorySample.get(item.icaoHex) ?? 0;
      return now - previous >= getHistorySampleIntervalMs();
    });
    if (due.length) {
      try {
        await recordAircraftSnapshot(due, new Date(snapshot.fetchedAt));
        for (const item of due) this.lastHistorySample.set(item.icaoHex, now);
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

  private queueHistory(snapshot: ProviderSnapshot): void {
    this.pendingHistorySnapshot = snapshot;
    if (this.historyWriteActive) return;
    this.historyWriteActive = true;
    void this.drainHistoryQueue();
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
      if (this.pendingHistorySnapshot) this.queueHistory(this.pendingHistorySnapshot);
    }
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
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
    let changed = false;
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value.enrichment) continue;
      const current = this.aircraft.get(result.value.item.icaoHex);
      if (!current || current.callsign !== result.value.item.callsign) continue;
      const enrichment = mergeEnrichment(current.enrichment, result.value.enrichment, true);
      if (!enrichment) continue;
      this.aircraft.set(current.icaoHex, { ...current, enrichment });
      changed = true;
    }
    if (changed) {
      this.recalculateBreakdowns();
      this.notify();
    }
  }

  private recalculateBreakdowns(): void {
    const typeCounts = new Map<string, number>();
    const airlineCounts = new Map<string, number>();
    for (const item of this.aircraft.values()) {
      const type = item.enrichment?.metadata?.icaoTypeCode ?? item.aircraftType;
      if (type) typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      const airline = item.enrichment?.route?.airline;
      if (airline) airlineCounts.set(airline, (airlineCounts.get(airline) ?? 0) + 1);
    }
    this.stats.aircraftTypes = [...typeCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    this.stats.airlines = [...airlineCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  private async resolveAtc(snapshot: ProviderSnapshot): Promise<void> {
    const results = await Promise.all(snapshot.aircraft.map(async (incoming) => {
      if (incoming.lat === null || incoming.lon === null) return { incoming, assignment: null };
      if (!this.aircraft.has(incoming.icaoHex)) return { incoming, assignment: null };
      const key = `${incoming.lat.toFixed(2)}:${incoming.lon.toFixed(2)}:${incoming.altitude === null ? "unknown" : Math.round(incoming.altitude / 1000)}`;
      if (this.atcResolutionKeys.get(incoming.icaoHex) === key) return { incoming, assignment: this.aircraft.get(incoming.icaoHex)?.atc ?? null };
      this.atcResolutionKeys.set(incoming.icaoHex, key);
      const match = await this.atc.lookup({ latitude: incoming.lat, longitude: incoming.lon, altitudeFt: incoming.altitude, observedAt: new Date(snapshot.fetchedAt) });
      if (!this.aircraft.has(incoming.icaoHex)) {
        this.atcResolutionKeys.delete(incoming.icaoHex);
        return { incoming, assignment: null };
      }
      return { incoming, assignment: match ? assignmentFromMatch(match) : null };
    }));
    let changed = false;
    for (const result of results) {
      const current = this.aircraft.get(result.incoming.icaoHex);
      if (!current || current.callsign !== result.incoming.callsign) continue;
      if (JSON.stringify(current.atc) === JSON.stringify(result.assignment)) continue;
      this.aircraft.set(current.icaoHex, { ...current, atc: result.assignment });
      changed = true;
    }
    if (changed) this.notify();
  }
}

const globalForState = globalThis as unknown as { aircraftState?: AircraftStateService };

export function getAircraftStateService(): AircraftStateService {
  globalForState.aircraftState ??= new AircraftStateService();
  return globalForState.aircraftState;
}
