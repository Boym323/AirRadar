import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { applyOgnPrivacy, targetWithPrivacy } from "@/lib/ogn/privacy";
import { toPublicOgnTarget } from "@/lib/ogn/public-serialization";
import type { OgnConfig } from "@/lib/server/config";
import { getOgnConfig, getReceiverPosition } from "@/lib/server/config";
import { ddbDeviceTypeForAddressType, OgnDdb } from "@/lib/ogn/ddb";
import { OgnProvider } from "@/lib/server/ogn-provider";
import type { OgnPosition, OgnProviderDiagnostics, OgnStateSnapshot, OgnTarget } from "@/lib/ogn/types";

type OgnListener = (snapshot: OgnStateSnapshot) => void;

export interface OgnStateOptions {
  config?: OgnConfig;
  provider?: OgnProvider;
  ddb?: OgnDdb;
  receiver?: { lat: number; lon: number; name: string };
  now?: () => number;
  cleanupIntervalMs?: number;
  broadcastIntervalMs?: number;
}

export class OgnStateService {
  private readonly config: OgnConfig;
  private readonly receiver: { lat: number; lon: number; name: string };
  private readonly provider: OgnProvider;
  private readonly ddb: OgnDdb;
  private readonly now: () => number;
  private readonly cleanupIntervalMs: number;
  private readonly broadcastIntervalMs: number;
  private readonly targets = new Map<string, OgnTarget>();
  private readonly positions = new Map<string, OgnPosition>();
  private readonly listeners = new Set<OgnListener>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private shuttingDown = false;
  private publicIdSequence = 0;
  private canonicalPositionUpdates = 0;
  private duplicatePackets = 0;
  private droppedPrivacy = 0;
  private droppedDdbUnresolved = 0;
  private ddbUnresolvable = 0;
  private droppedStale = 0;
  private droppedCapacity = 0;

  constructor(options: OgnStateOptions = {}) {
    this.config = options.config ?? getOgnConfig();
    this.receiver = options.receiver ?? getReceiverPosition();
    this.now = options.now ?? Date.now;
    this.cleanupIntervalMs = Math.max(1_000, options.cleanupIntervalMs ?? 5_000);
    this.broadcastIntervalMs = Math.max(250, options.broadcastIntervalMs ?? 500);
    this.ddb = options.ddb ?? new OgnDdb({
      url: this.config.ddbUrl,
      refreshMs: this.config.ddbRefreshMs,
      maxStaleMs: this.config.ddbMaxStaleMs,
      batchSize: this.config.ddbBatchSize,
      batchDelayMs: this.config.ddbBatchDelayMs,
      minRequestIntervalMs: this.config.ddbMinRequestIntervalMs,
      negativeTtlMs: this.config.ddbNegativeTtlMs,
      cacheMaxEntries: this.config.ddbCacheMaxEntries,
      maxPendingKeys: this.config.maxTargets,
      persistCache: this.config.enabled && this.config.ddbPersistCache,
      cacheFile: this.config.ddbCacheFile,
      softrfEnabled: this.config.enabled && this.config.softrfDdbEnabled,
      softrfPath: this.config.softrfDdbPath,
      softrfMaxAgeHours: this.config.softrfDdbMaxAgeHours,
    });
    this.provider = options.provider ?? new OgnProvider({
      config: this.config,
      receiver: this.receiver,
      onPosition: (position) => this.ingest(position),
    });
    this.ddb.subscribe(() => this.reapplyPrivacy());
  }

  start(): void {
    if (this.running || this.shuttingDown || !this.config.enabled || this.config.configurationError) return;
    this.running = true;
    this.ddb.start();
    this.provider.start();
    this.cleanupTimer = setInterval(() => this.removeExpired(), this.cleanupIntervalMs);
  }

  async waitForReady(): Promise<void> {
    this.start();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.running = false;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = null;
    await Promise.allSettled([this.provider.stop(), this.ddb.stop()]);
    this.listeners.clear();
  }

  subscribe(listener: OgnListener): () => void {
    this.start();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ingest(position: OgnPosition): void {
    if (this.shuttingDown || !this.config.enabled || this.config.configurationError) return;
    const key = `${position.id.addressType}:${position.id.address}`;
    const existing = this.targets.get(key);
    const previous = this.positions.get(key);
    if (previous) {
      const previousObserved = Date.parse(previous.observedAt);
      const incomingObserved = Date.parse(position.observedAt);
      if (!Number.isFinite(incomingObserved) || incomingObserved < previousObserved) {
        this.duplicatePackets += 1;
        return;
      }
      if (incomingObserved === previousObserved) {
        this.duplicatePackets += 1;
        if (existing) this.updateReceiverProvenance(existing, position.lastReceiver);
        this.scheduleBroadcast();
        return;
      }
    }
    if (!previous && this.positions.size >= this.config.maxTargets && !this.removePositionCapacityVictim()) {
      this.droppedCapacity += 1;
      return;
    }
    this.positions.set(key, position);
    // Packet-level no-tracking is authoritative and must not enqueue a DDB
    // lookup just to decide an already-known drop.
    const ddbResolution = position.id.noTracking
      ? { status: "unresolved" } as const
      : this.resolveDdb(position, true);
    const decision = applyOgnPrivacy({ position, ddbResolution });
    if (decision.action === "drop") {
      if (decision.reason === "ddb-unresolved") this.droppedDdbUnresolved += 1;
      else this.droppedPrivacy += 1;
      this.targets.delete(key);
      this.scheduleBroadcast();
      return;
    }
    const next = this.buildTarget(key, position, decision, existing);
    if (!next) return;
    if (!existing && this.targets.size >= this.config.maxTargets) {
      this.removeCapacityVictim();
      if (this.targets.size >= this.config.maxTargets) {
        this.droppedCapacity += 1;
        return;
      }
    }
    this.targets.set(key, next);
    this.canonicalPositionUpdates += 1;
    this.scheduleBroadcast();
  }

  getSnapshot(): OgnStateSnapshot {
    const fetchedAt = new Date(this.now()).toISOString();
    const status = this.provider.getDiagnostics().status;
    if (!this.config.enabled) return { enabled: false, status: "disabled", fetchedAt, targets: [] };
    if (this.config.configurationError) return { enabled: true, status, fetchedAt, targets: [] };
    const targets = [...this.targets.values()]
      .map((target) => this.withLiveMetrics(target, this.now()))
      .filter((target) => this.isPrivacyUsable(target.id))
      .filter((target) => this.now() - Date.parse(target.receivedAt) <= this.config.removeAfterMs)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .map(toPublicOgnTarget);
    return { enabled: true, status, fetchedAt, targets };
  }

  getDiagnostics(): OgnProviderDiagnostics {
    const provider = this.provider.getDiagnostics();
    const now = this.now();
    let freshTargets = 0;
    let staleTargets = 0;
    for (const target of this.targets.values()) {
      if (!this.isPrivacyUsable(target.id)) continue;
      if (now - Date.parse(target.receivedAt) > this.config.removeAfterMs) continue;
      if (now - Date.parse(target.receivedAt) >= this.config.staleAfterMs) staleTargets += 1;
      else freshTargets += 1;
    }
    return {
      ...provider,
      canonicalPositionUpdates: this.canonicalPositionUpdates,
      duplicatePackets: this.duplicatePackets,
      droppedPrivacy: this.droppedPrivacy,
      droppedDdbUnresolved: this.droppedDdbUnresolved,
      ddbUnresolvable: this.ddbUnresolvable,
      droppedStale: this.droppedStale,
      droppedCapacity: this.droppedCapacity,
      activeTargets: freshTargets + staleTargets,
      freshTargets,
      staleTargets,
      ddb: this.ddb.getDiagnostics(),
    };
  }

  private resolveDdb(position: OgnPosition, enqueue: boolean) {
    const type = ddbDeviceTypeForAddressType(position.id.addressTypeCode);
    if (!type) {
      if (enqueue) this.ddbUnresolvable += 1;
      return { status: "unresolved" } as const;
    }
    if (enqueue) this.ddb.ensure(type, position.id.address);
    return this.ddb.getResolution(type, position.id.address);
  }

  private isPrivacyUsable(key: string): boolean {
    const position = this.positions.get(key);
    if (!position) return false;
    return applyOgnPrivacy({
      position,
      ddbResolution: position.id.noTracking ? { status: "unresolved" } : this.resolveDdb(position, false),
    }).action !== "drop";
  }

  private buildTarget(key: string, position: OgnPosition, decision: Parameters<typeof targetWithPrivacy>[1], existing: OgnTarget | undefined): OgnTarget | null {
    const publicId = existing?.publicId ?? `anonymous-${++this.publicIdSequence}`;
    const distanceKm = haversineDistanceKm(this.receiver.lat, this.receiver.lon, position.latitude, position.longitude);
    const bearing = initialBearing(this.receiver.lat, this.receiver.lon, position.latitude, position.longitude);
    return targetWithPrivacy(position, decision, existing, key, publicId, distanceKm, bearing, false);
  }

  private updateReceiverProvenance(target: OgnTarget, receiver: string | null): void {
    if (!receiver) return;
    const recentReceivers = target.recentReceivers.includes(receiver)
      ? target.recentReceivers
      : [...target.recentReceivers, receiver].slice(-8);
    this.targets.set(target.id, { ...target, lastReceiver: receiver, recentReceivers, receiverCount: Math.max(target.receiverCount, recentReceivers.length) });
  }

  private removeExpired(): void {
    const cutoff = this.now() - this.config.removeAfterMs;
    let changed = false;
    for (const [key, position] of this.positions) {
      if (Date.parse(position.receivedAt) >= cutoff) continue;
      this.positions.delete(key);
      this.targets.delete(key);
      this.droppedStale += 1;
      changed = true;
    }
    for (const [key, target] of this.targets) {
      if (Date.parse(target.receivedAt) < cutoff) {
        this.targets.delete(key);
        changed = true;
      }
    }
    if (changed) this.scheduleBroadcast();
  }

  private removeCapacityVictim(): void {
    let victim: [string, OgnTarget] | null = null;
    for (const entry of this.targets) {
      if (!victim || Date.parse(entry[1].receivedAt) < Date.parse(victim[1].receivedAt)) victim = entry;
    }
    if (victim) {
      this.targets.delete(victim[0]);
      this.positions.delete(victim[0]);
    }
  }

  private removePositionCapacityVictim(): boolean {
    let victim: [string, OgnPosition] | null = null;
    for (const entry of this.positions) {
      if (!victim) {
        victim = entry;
        continue;
      }
      const entryAt = Date.parse(entry[1].receivedAt);
      const victimAt = Date.parse(victim[1].receivedAt);
      if (entryAt < victimAt || (entryAt === victimAt && entry[0] < victim[0])) victim = entry;
    }
    if (!victim) return false;
    this.positions.delete(victim[0]);
    this.targets.delete(victim[0]);
    return true;
  }

  private reapplyPrivacy(): void {
    if (this.shuttingDown || !this.config.enabled) return;
    let changed = false;
    for (const [key, position] of this.positions) {
      const decision = applyOgnPrivacy({
        position,
        ddbResolution: position.id.noTracking ? { status: "unresolved" } : this.resolveDdb(position, true),
      });
      const existing = this.targets.get(key);
      if (decision.action === "drop") {
        if (existing) { this.targets.delete(key); changed = true; }
        continue;
      }
      const rebuilt = this.buildTarget(key, position, decision, existing);
      const next = rebuilt && existing ? {
        ...rebuilt,
        // A DDB refresh must not roll back receiver provenance accumulated
        // from equal-timestamp duplicates since the canonical packet.
        lastReceiver: existing.lastReceiver,
        recentReceivers: existing.recentReceivers,
        receiverCount: existing.receiverCount,
      } : rebuilt;
      if (next && JSON.stringify(next) !== JSON.stringify(existing)) {
        if (!existing && this.targets.size >= this.config.maxTargets) {
          this.removeCapacityVictim();
          if (this.targets.size >= this.config.maxTargets) {
            this.droppedCapacity += 1;
            continue;
          }
        }
        this.targets.set(key, next);
        changed = true;
      }
    }
    if (changed) this.scheduleBroadcast();
  }

  private withLiveMetrics(target: OgnTarget, now: number): OgnTarget {
    const age = now - Date.parse(target.receivedAt);
    return {
      ...target,
      stale: age >= this.config.staleAfterMs,
      distanceKm: haversineDistanceKm(this.receiver.lat, this.receiver.lon, target.latitude, target.longitude),
      bearing: initialBearing(this.receiver.lat, this.receiver.lon, target.latitude, target.longitude),
    };
  }

  private scheduleBroadcast(): void {
    if (!this.running || this.shuttingDown || this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      const snapshot = this.getSnapshot();
      for (const listener of this.listeners) {
        try { listener(snapshot); } catch { this.listeners.delete(listener); }
      }
    }, this.broadcastIntervalMs);
  }
}

const globalForOgn = globalThis as unknown as { ognStateService?: OgnStateService };

export function getOgnStateService(): OgnStateService {
  globalForOgn.ognStateService ??= new OgnStateService();
  return globalForOgn.ognStateService;
}
