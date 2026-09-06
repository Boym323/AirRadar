import type { Aircraft, ProviderSnapshot, RadarStats, StateSnapshot, TrailPoint } from "@/lib/aircraft/types";
import { getHistorySampleIntervalMs, getPollIntervalMs, getReceiverPosition } from "@/lib/server/config";
import { recordAircraftSnapshot } from "@/lib/server/history";
import { createAircraftProvider } from "@/lib/server/providers";
import type { AircraftProvider } from "@/lib/server/provider";

type Listener = (snapshot: StateSnapshot) => void;

function emptyStats(): RadarStats {
  return { currentAircraft: 0, uniqueAircraftToday: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0 };
}

export class AircraftStateService {
  private readonly provider: AircraftProvider;
  private readonly aircraft = new Map<string, Aircraft>();
  private readonly seenToday = new Map<string, string>();
  private readonly lastHistorySample = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private stats = emptyStats();
  private lastReadsbUpdate: string | null = null;
  private lastError: string | null = null;
  private running = false;
  private refreshing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private initialRefresh: Promise<void> | null = null;

  constructor(provider: AircraftProvider = createAircraftProvider()) {
    this.provider = provider;
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

  subscribe(listener: Listener): () => void {
    this.start();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): StateSnapshot {
    return {
      aircraft: Array.from(this.aircraft.values()).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)),
      receiver: this.currentReceiver,
      fetchedAt: this.lastReadsbUpdate ?? new Date().toISOString(),
      provider: this.provider.name,
      readsbOnline: this.lastReadsbUpdate !== null && this.lastError === null,
      lastReadsbUpdate: this.lastReadsbUpdate,
      lastError: this.lastError,
      stats: { ...this.stats, currentAircraft: this.aircraft.size },
    };
  }

  getProviderName(): "readsb" | "mock" {
    return this.provider.name;
  }

  private currentReceiver = getReceiverPosition();

  private async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const snapshot = await this.provider.getSnapshot();
      this.applySnapshot(snapshot);
      this.lastReadsbUpdate = snapshot.fetchedAt;
      this.lastError = null;
      this.notify();
      void this.persistHistory(snapshot);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown readsb error";
      this.notify();
    } finally {
      this.refreshing = false;
      if (this.running) this.timer = setTimeout(() => void this.refresh(), getPollIntervalMs());
    }
  }

  private applySnapshot(snapshot: ProviderSnapshot): void {
    this.currentReceiver = snapshot.receiver;
    const currentHexes = new Set<string>();
    for (const incoming of snapshot.aircraft) {
      currentHexes.add(incoming.icaoHex);
      const previous = this.aircraft.get(incoming.icaoHex);
      const trail = this.updateTrail(previous, incoming);
      this.aircraft.set(incoming.icaoHex, { ...incoming, trail });
      this.seenToday.set(incoming.icaoHex, new Date().toISOString().slice(0, 10));
      if ((incoming.distanceKm ?? 0) > this.stats.maxDistanceKm) {
        this.stats.maxDistanceKm = incoming.distanceKm ?? this.stats.maxDistanceKm;
      }
    }
    for (const hex of this.aircraft.keys()) {
      if (!currentHexes.has(hex)) this.aircraft.delete(hex);
    }
    this.stats.currentAircraft = this.aircraft.size;
    this.stats.uniqueAircraftToday = Array.from(this.seenToday.values()).filter(
      (date) => date === new Date().toISOString().slice(0, 10),
    ).length;
    this.stats.maxConcurrentAircraft = Math.max(this.stats.maxConcurrentAircraft, this.aircraft.size);
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
    const due = snapshot.aircraft.filter((item) => {
      const previous = this.lastHistorySample.get(item.icaoHex) ?? 0;
      if (now - previous < getHistorySampleIntervalMs()) return false;
      this.lastHistorySample.set(item.icaoHex, now);
      return true;
    });
    if (!due.length) return;
    try {
      await recordAircraftSnapshot(due, new Date(snapshot.fetchedAt));
    } catch (error) {
      // History is best-effort and must never make a healthy receiver look offline.
      console.error("AirRadar history persistence failed", error);
    }
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

const globalForState = globalThis as unknown as { aircraftState?: AircraftStateService };

export function getAircraftStateService(): AircraftStateService {
  globalForState.aircraftState ??= new AircraftStateService();
  return globalForState.aircraftState;
}
