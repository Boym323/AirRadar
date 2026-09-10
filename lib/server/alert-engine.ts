import type { Aircraft } from "@/lib/aircraft/types";
import { matchesAircraftRule } from "@/lib/aircraft/watchlist";
import { loadAlertConfig, type AlertRule } from "@/lib/server/alert-config";
import { getAlertCooldownMs, isEmergencyAlertEnabled } from "@/lib/server/config";
import { createAlertNotifier, type AlertNotifier, type AircraftAlert } from "@/lib/server/alert-notifier";
import { createAlertHistoryStore, type AlertHistoryReason, type AlertHistoryRecordValue, type AlertHistoryEventType, type JsonlAlertHistoryStore } from "@/lib/server/alert-history";
import { createAlertStateStore, type AlertStateStore } from "@/lib/server/alert-state";
import type { ReceiverDailyReceptionRecord } from "@/lib/server/statistics";

const MAX_DEDUP_ENTRIES = 10_000;
const MAX_PENDING_ALERTS = 32;
const MAX_CONCURRENT_DELIVERIES = 2;
const EMERGENCY_SQUAWKS = new Set(["7500", "7600", "7700"]);

export interface AlertStatus {
  status: "ok" | "disabled" | "error";
  enabled: boolean;
  notifier: string;
  ruleCount: number;
}

export interface AlertEngineOptions {
  rules?: AlertRule[];
  configErrors?: string[];
  notifier?: AlertNotifier;
  cooldownMs?: number;
  now?: () => number;
  history?: Pick<JsonlAlertHistoryStore, "recordDetected" | "recordNotification">;
  state?: AlertStateStore;
}

function aircraftMap(value: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>): ReadonlyMap<string, Aircraft> {
  if (!Array.isArray(value)) return value as ReadonlyMap<string, Aircraft>;
  return new Map(value.map((aircraft: Aircraft) => [aircraft.icaoHex, aircraft]));
}

function isEmergency(aircraft: Aircraft | undefined): boolean {
  return Boolean(aircraft?.emergency);
}

function emergencySquawk(aircraft: Aircraft | undefined): "7500" | "7600" | "7700" | null {
  const value = aircraft?.squawk?.trim();
  return value && EMERGENCY_SQUAWKS.has(value) ? value as "7500" | "7600" | "7700" : null;
}

function emergencyEvent(squawk: "7500" | "7600" | "7700"): { type: AlertHistoryEventType; reason: AlertHistoryReason } {
  if (squawk === "7500") return { type: "emergency_7500", reason: "squawk_7500" };
  if (squawk === "7600") return { type: "emergency_7600", reason: "squawk_7600" };
  return { type: "emergency_7700", reason: "squawk_7700" };
}

function matchesRuleIgnoringDistance(aircraft: Aircraft, rule: AlertRule): boolean {
  return matchesAircraftRule(aircraft, { type: rule.type, value: rule.value });
}

function watchlistEvent(
  prior: Aircraft | undefined,
  aircraft: Aircraft,
  rules: AlertRule[],
): { type: AlertHistoryEventType; reason: AlertHistoryReason; radiusKm?: number } {
  if (!prior) return { type: "aircraft_appeared", reason: "appeared" };
  const crossed = rules
    .filter((rule) => rule.maxDistanceKm !== undefined
      && matchesRuleIgnoringDistance(prior, rule)
      && prior.distanceKm !== null
      && aircraft.distanceKm !== null
      && prior.distanceKm > rule.maxDistanceKm!
      && aircraft.distanceKm <= rule.maxDistanceKm!)
    .map((rule) => rule.maxDistanceKm as number);
  if (crossed.length) return { type: "entered_radius", reason: "entered_radius", radiusKm: Math.min(...crossed) };
  return { type: "watchlist", reason: "watchlisted" };
}

export class AlertEngine {
  private rules: AlertRule[];
  private configErrors: string[];
  private readonly notifier: AlertNotifier;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly history: Pick<JsonlAlertHistoryStore, "recordDetected" | "recordNotification">;
  private readonly stateStore: AlertStateStore;
  private readonly dedupCache = new Map<string, number>();
  private readonly pending: AircraftAlert[] = [];
  private activeDeliveries = 0;
  private deliveryError = false;
  private statePersistenceError = false;
  private sequence = 0;
  private readonly permanentEvents = new Map<string, number>();
  private readonly ruleLastTriggered = new Map<string, number>();

  constructor(options: AlertEngineOptions = {}) {
    const config = options.rules ? { rules: options.rules, errors: options.configErrors ?? [] } : loadAlertConfig();
    this.rules = config.rules.filter((rule) => rule.enabled);
    this.configErrors = config.errors;
    this.notifier = options.notifier ?? createAlertNotifier();
    this.cooldownMs = options.cooldownMs ?? getAlertCooldownMs();
    this.now = options.now ?? Date.now;
    this.history = options.history ?? createAlertHistoryStore();
    this.stateStore = options.state ?? createAlertStateStore();
    const persisted = this.stateStore.load();
    for (const [key, timestamp] of persisted.dedup) this.dedupCache.set(key, timestamp);
    for (const [key, timestamp] of persisted.permanent) this.permanentEvents.set(key, timestamp);
    for (const [key, timestamp] of persisted.ruleLastTriggered) this.ruleLastTriggered.set(key, timestamp);
    this.cleanupDedupCache(this.now());
  }

  /**
   * Replace the configured rules after a validated alerts.json update. The
   * deduplication cache is deliberately retained so a UI edit cannot bypass
   * the existing transition and cooldown semantics.
   */
  reload(config = loadAlertConfig()): void {
    this.rules = config.rules.filter((rule) => rule.enabled);
    this.configErrors = config.errors;
  }

  getStatus(): AlertStatus {
    const hasConditions = this.rules.length > 0 || isEmergencyAlertEnabled();
    const status: AlertStatus["status"] = this.configErrors.length || this.deliveryError || this.statePersistenceError
      ? "error"
      : this.notifier.enabled && hasConditions ? "ok" : "disabled";
    return { status, enabled: status === "ok", notifier: this.notifier.name, ruleCount: this.rules.length };
  }

  getRuleLastTriggeredAt(ruleId: string): string | null {
    const timestamp = this.ruleLastTriggered.get(ruleId);
    return timestamp === undefined ? null : new Date(timestamp).toISOString();
  }

  observe(
    previousValue: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>,
    currentValue: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>,
  ): void {
    const now = this.now();
    this.cleanupDedupCache(now);
    const previous = aircraftMap(previousValue);
    const current = aircraftMap(currentValue);
    let stateDirty = false;

    for (const aircraft of current.values()) {
      const prior = previous.get(aircraft.icaoHex);
      const matchedRules = this.rules.filter((rule) => matchesAircraftRule(aircraft, rule));
      const transitionedRules = matchedRules.filter((rule) => !prior || !matchesAircraftRule(prior, rule));
      const availableRules = transitionedRules.filter((rule) => this.isAvailable(`rule:${rule.id}:${aircraft.icaoHex}`, now));
      if (availableRules.length) {
        for (const rule of availableRules) {
          this.reserve(`rule:${rule.id}:${aircraft.icaoHex}`, now);
          this.ruleLastTriggered.set(rule.id, now);
        }
        const event = watchlistEvent(prior, aircraft, availableRules);
        this.enqueue({
          aircraft,
          matchedRules: availableRules,
          emergency: false,
          priority: "normal",
          type: event.type,
          reason: event.reason,
          radiusKm: event.radiusKm ?? null,
        });
        stateDirty = true;
      }

      if (!isEmergencyAlertEnabled()) continue;

      const currentSquawk = emergencySquawk(aircraft);
      const priorSquawk = emergencySquawk(prior);
      if (priorSquawk && currentSquawk !== priorSquawk) {
        this.dedupCache.delete(`squawk:${priorSquawk}:${aircraft.icaoHex}`);
        stateDirty = true;
      }
      if (currentSquawk && currentSquawk !== priorSquawk) {
        const key = `squawk:${currentSquawk}:${aircraft.icaoHex}`;
        if (this.isAvailable(key, now)) {
          this.reserve(key, now);
          const event = emergencyEvent(currentSquawk);
          this.enqueue({
            aircraft,
            matchedRules: [],
            emergency: true,
            priority: "high",
            type: event.type,
            reason: event.reason,
            squawk: currentSquawk,
          });
          stateDirty = true;
        }
      } else if (!currentSquawk && isEmergency(aircraft) && !isEmergency(prior)) {
        const key = `emergency:${aircraft.icaoHex}`;
        if (this.isAvailable(key, now)) {
          this.reserve(key, now);
          this.enqueue({ aircraft, matchedRules: [], emergency: true, priority: "high", type: "emergency", reason: "emergency" });
          stateDirty = true;
        }
      }
      if (isEmergency(prior) && !isEmergency(aircraft)) {
        if (this.dedupCache.delete(`emergency:${aircraft.icaoHex}`)) stateDirty = true;
      }
    }

    if (stateDirty) this.persistState();
  }

  /** Called only after durable history confirms that a first Flight exists. */
  observeNewAircraft(aircraft: Aircraft): void {
    const id = `new:${aircraft.icaoHex.toUpperCase()}`;
    if (this.permanentEvents.has(id)) return;
    this.rememberPermanentEvent(id);
    this.enqueue({ aircraft, matchedRules: [], emergency: false, priority: "normal", type: "new_aircraft", reason: "new", eventId: id });
    this.persistState();
  }

  /** Called only on a genuine in-memory record transition. */
  observeReceptionRecord(scope: "daily" | "lifetime", current: ReceiverDailyReceptionRecord, previous: ReceiverDailyReceptionRecord | null): void {
    const id = `record:${scope}:${current.date}:${current.icaoHex}:${current.distanceKm.toFixed(3)}:${current.recordedAt}`;
    if (this.permanentEvents.has(id)) return;
    this.rememberPermanentEvent(id);
    const record: AlertHistoryRecordValue = {
      scope,
      distanceKm: current.distanceKm,
      bearing: current.bearing,
      recordedAt: current.recordedAt,
      previousDistanceKm: previous?.distanceKm ?? null,
    };
    this.enqueue({ aircraft: aircraftFromRecord(current), matchedRules: [], emergency: false, priority: "normal", type: "reception_record", reason: "record", eventId: id, record });
    this.persistState();
  }

  cleanupDedupCache(now = this.now()): void {
    const cutoff = now - this.cooldownMs;
    for (const [key, timestamp] of this.dedupCache) {
      if (timestamp < cutoff) this.dedupCache.delete(key);
    }
    while (this.dedupCache.size > MAX_DEDUP_ENTRIES) {
      const oldest = this.dedupCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.dedupCache.delete(oldest);
    }
  }

  private isAvailable(key: string, now: number): boolean {
    const lastAlert = this.dedupCache.get(key);
    return lastAlert === undefined || now - lastAlert >= this.cooldownMs;
  }

  private rememberPermanentEvent(id: string): void {
    this.permanentEvents.set(id, this.now());
    while (this.permanentEvents.size > MAX_DEDUP_ENTRIES) {
      const oldest = this.permanentEvents.keys().next().value as string | undefined;
      if (!oldest) break;
      this.permanentEvents.delete(oldest);
    }
  }

  private reserve(key: string, now: number): void {
    this.dedupCache.set(key, now);
    while (this.dedupCache.size > MAX_DEDUP_ENTRIES) {
      const oldest = this.dedupCache.keys().next().value as string | undefined;
      if (!oldest) break;
      if (oldest === key) {
        const keys = this.dedupCache.keys();
        keys.next();
        const next = keys.next().value as string | undefined;
        if (!next) break;
        this.dedupCache.delete(next);
      } else {
        this.dedupCache.delete(oldest);
      }
    }
  }

  private persistState(): void {
    try {
      this.stateStore.save({
        dedup: [...this.dedupCache.entries()],
        permanent: [...this.permanentEvents.entries()],
        ruleLastTriggered: [...this.ruleLastTriggered.entries()],
      });
      this.statePersistenceError = false;
    } catch (error) {
      if (!this.statePersistenceError) {
        console.error("AirRadar alert state persistence failed", error instanceof Error ? error.message : "unknown error");
      }
      this.statePersistenceError = true;
    }
  }

  private enqueue(alert: AircraftAlert): void {
    const type: AlertHistoryEventType = alert.type ?? (alert.emergency ? "emergency" : "watchlist");
    const reason: AlertHistoryReason = alert.reason ?? (alert.emergency ? "emergency" : "watchlisted");
    const eventId = alert.eventId ?? `${type}:${alert.aircraft.icaoHex}:${this.now()}:${this.sequence++}`;
    void this.history.recordDetected({
      id: eventId,
      detectedAt: new Date(this.now()).toISOString(),
      type,
      reason,
      aircraft: alert.aircraft,
      ruleIds: alert.matchedRules.map((rule) => rule.id),
      ruleNames: alert.matchedRules.map((rule) => rule.name ?? rule.id),
      radiusKm: alert.radiusKm ?? null,
      squawk: alert.squawk ?? null,
      record: alert.record,
    }).catch(() => undefined);
    if (this.pending.length >= MAX_PENDING_ALERTS) {
      console.error(`AirRadar alert dropped: provider=${this.notifier.name} reason=queue_full`);
      void this.history.recordNotification(eventId, "failed").catch(() => undefined);
      return;
    }
    this.pending.push({ ...alert, eventId, type, reason });
    this.drain();
  }

  private drain(): void {
    while (this.activeDeliveries < MAX_CONCURRENT_DELIVERIES && this.pending.length) {
      const alert = this.pending.shift();
      if (!alert) return;
      this.activeDeliveries += 1;
      void this.deliver(alert).finally(() => {
        this.activeDeliveries -= 1;
        this.drain();
      });
    }
  }

  private async deliver(alert: AircraftAlert): Promise<void> {
    const eventId = alert.eventId;
    if (!this.notifier.enabled) {
      if (eventId) void this.history.recordNotification(eventId, "disabled").catch(() => undefined);
      return;
    }
    if (eventId) void this.history.recordNotification(eventId, "attempted").catch(() => undefined);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.notifier.send(alert);
        if (eventId) void this.history.recordNotification(eventId, "delivered").catch(() => undefined);
        this.deliveryError = false;
        console.info(`AirRadar alert sent: type=${alert.type ?? "watchlist"} ruleCount=${alert.matchedRules.length} aircraft=${alert.aircraft.icaoHex}`);
        return;
      } catch (error) {
        lastError = error;
        const retryable = !(error && typeof error === "object" && "status" in error && typeof error.status === "number" && error.status < 500);
        if (attempt === 0 && retryable) continue;
      }
    }
    const status = lastError && typeof lastError === "object" && "status" in lastError && typeof lastError.status === "number"
      ? String(lastError.status)
      : "network";
    this.deliveryError = true;
    if (eventId) void this.history.recordNotification(eventId, "failed").catch(() => undefined);
    console.error(`AirRadar alert delivery failed: provider=${this.notifier.name} status=${status}`);
  }
}

function aircraftFromRecord(record: ReceiverDailyReceptionRecord): Aircraft {
  return {
    icaoHex: record.icaoHex,
    callsign: null,
    registration: record.registration,
    aircraftType: null,
    aircraftDescription: null,
    lat: null,
    lon: null,
    altitude: null,
    baroAltitude: null,
    geomAltitude: null,
    groundSpeed: null,
    track: null,
    verticalRate: null,
    baroRate: null,
    geomRate: null,
    squawk: null,
    category: null,
    emergency: null,
    rssi: null,
    messages: null,
    seenSeconds: null,
    seenPosSeconds: null,
    lastSeen: record.recordedAt,
    source: "UNKNOWN",
    sourceType: null,
    onGround: false,
    distanceKm: record.distanceKm,
    bearing: record.bearing,
    trail: [],
  };
}
