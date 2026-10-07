import type { Aircraft } from "@/lib/aircraft/types";
import { matchesAircraftRule } from "@/lib/aircraft/watchlist";
import { notificationPreferenceKeyForEvent, type NotificationPreferenceMode } from "@/lib/notification-preferences";
import { loadAlertConfig, type AlertRule } from "@/lib/server/alert-config";
import { getAlertCooldownMs, isEmergencyAlertEnabled } from "@/lib/server/config";
import { createAlertNotifier, type AlertNotifier, type AircraftAlert } from "@/lib/server/alert-notifier";
import { createAlertHistoryStore, type AlertHistoryReason, type AlertHistoryRecordValue, type AlertHistoryEventType, type JsonlAlertHistoryStore } from "@/lib/server/alert-history";
import { createAlertStateStore, type AlertStateStore } from "@/lib/server/alert-state";
import type { ReceiverDailyReceptionRecord } from "@/lib/server/statistics";
import type { FlightIntelligenceEvent, FlightEventType } from "@/lib/intelligence/types";
import { AlertV1TransitionTracker, evaluateAlertV1, geofenceTransitionSourceKey, squawkTransitionSourceKey, type AlertV1Signal } from "@/lib/server/alerts-fleets-v1";
import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
import { getPrisma } from "@/lib/server/db";
import { channelsForNotificationMode, notificationModeForDurableSignal, notificationPreferenceMode } from "@/lib/server/notification-preferences";
import { evaluateWatchlistPredictiveRule } from "@/lib/watchlist-predictive-alerts-v2";
import type { PublicEtaAdvisory } from "@/lib/predictive-intelligence/eta-advisory";
import type { PublicRunwayChangeAdvisory } from "@/lib/predictive-intelligence/runway-change-advisory";

const MAX_DEDUP_ENTRIES = 10_000;
const MAX_PENDING_ALERTS = 32;
const HIGH_PRIORITY_RESERVE = 8;
const MAX_NORMAL_PENDING_ALERTS = MAX_PENDING_ALERTS - HIGH_PRIORITY_RESERVE;
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
  notificationMode?: (alert: AircraftAlert) => NotificationPreferenceMode | null;
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

const INTELLIGENCE_ALERT_EVENTS = new Set<FlightEventType>([
  "APPROACH",
  "LANDING",
  "TAKEOFF",
  "GO_AROUND",
  "HOLDING",
  "DIVERSION",
  "TOP_OF_DESCENT",
]);

function intelligenceAlertEvent(type: FlightEventType): { type: AlertHistoryEventType; reason: AlertHistoryReason } | null {
  if (type === "APPROACH") return { type: "intelligence_approach", reason: "approach" };
  if (type === "LANDING") return { type: "intelligence_landing", reason: "landing" };
  if (type === "TAKEOFF") return { type: "intelligence_takeoff", reason: "takeoff" };
  if (type === "GO_AROUND") return { type: "intelligence_go_around", reason: "go_around" };
  if (type === "HOLDING") return { type: "intelligence_holding", reason: "holding" };
  if (type === "DIVERSION") return { type: "intelligence_diversion", reason: "diversion" };
  if (type === "TOP_OF_DESCENT") return { type: "intelligence_top_of_descent", reason: "top_of_descent" };
  return null;
}

function eventIsFresh(event: FlightIntelligenceEvent, aircraft: Aircraft, now: number): boolean {
  const occurredAt = Date.parse(event.occurredAt);
  const observedAt = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(occurredAt)) return false;
  const timestampFresh = Number.isFinite(observedAt) ? Math.abs(observedAt - occurredAt) <= 120_000 : now - occurredAt <= 120_000;
  return timestampFresh && (aircraft.seenPosSeconds === null || aircraft.seenPosSeconds <= 120);
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
  private readonly notificationMode: (alert: AircraftAlert) => NotificationPreferenceMode | null;
  private readonly dedupCache = new Map<string, number>();
  private readonly pending: AircraftAlert[] = [];
  private activeDeliveries = 0;
  private deliveryError = false;
  private statePersistenceError = false;
  private sequence = 0;
  private readonly permanentEvents = new Map<string, number>();
  private readonly ruleLastTriggered = new Map<string, number>();
  private readonly durableTransitions = new AlertV1TransitionTracker();
  private durableTransitionBaseline = false;
  private durableTransitionInitializationStarted = false;

  constructor(options: AlertEngineOptions = {}) {
    const config = options.rules ? { rules: options.rules, errors: options.configErrors ?? [] } : loadAlertConfig();
    this.rules = config.rules.filter((rule) => rule.enabled);
    this.configErrors = config.errors;
    this.notifier = options.notifier ?? createAlertNotifier();
    this.cooldownMs = options.cooldownMs ?? getAlertCooldownMs();
    this.now = options.now ?? Date.now;
    this.history = options.history ?? createAlertHistoryStore();
    this.stateStore = options.state ?? createAlertStateStore();
    this.notificationMode = options.notificationMode ?? ((alert) => {
      const key = notificationPreferenceKeyForEvent(alert.type, alert.emergency);
      return key ? notificationPreferenceMode(key) : null;
    });
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

  hasPredictiveRules(): boolean {
    return this.rules.some((rule) => rule.etaThresholdMinutes !== undefined || rule.notifyRunwayChange === true);
  }

  observePredictiveAdvisories(
    aircraft: Aircraft,
    input: {
      destinationIcao: string | null;
      etaAdvisory: PublicEtaAdvisory | null;
      runwayChangeAdvisory: PublicRunwayChangeAdvisory | null;
    },
  ): void {
    const matchedRules = this.rules.filter((rule) =>
      (rule.etaThresholdMinutes !== undefined || rule.notifyRunwayChange === true)
      && matchesAircraftRule(aircraft, rule)
    );
    if (!matchedRules.length) return;

    let stateDirty = false;
    for (const rule of matchedRules) {
      const candidates = evaluateWatchlistPredictiveRule({
        rule,
        aircraftIcao: aircraft.icaoHex,
        callsign: aircraft.callsign,
        destinationIcao: input.destinationIcao,
        etaAdvisory: input.etaAdvisory,
        runwayChangeAdvisory: input.runwayChangeAdvisory,
      });
      for (const candidate of candidates) {
        if (this.permanentEvents.has(candidate.eventKey)) continue;
        const type: AlertHistoryEventType = candidate.kind === "ETA_THRESHOLD" ? "predictive_eta" : "predictive_runway_change";
        const reason: AlertHistoryReason = candidate.kind === "ETA_THRESHOLD" ? "eta_threshold" : "runway_change";
        const accepted = this.enqueue({
          aircraft,
          matchedRules: [rule],
          emergency: false,
          priority: "normal",
          type,
          reason,
          eventId: candidate.eventKey,
          metadata: candidate.metadata,
        });
        if (!accepted) continue;
        this.rememberPermanentEvent(candidate.eventKey);
        this.ruleLastTriggered.set(rule.id, this.now());
        stateDirty = true;
      }
    }
    if (stateDirty) this.persistState();
  }

  observe(
    previousValue: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>,
    currentValue: ReadonlyMap<string, Aircraft> | ReadonlyArray<Aircraft>,
  ): void {
    const now = this.now();
    this.cleanupDedupCache(now);
    const previous = aircraftMap(previousValue);
    const current = aircraftMap(currentValue);
    // The first live snapshot is a baseline.  In particular, an aircraft
    // already broadcasting 7500/7600/7700 during a restart must not create a
    // notification storm; only a later transition observed by this process is
    // actionable.  Calls with an explicit previous snapshot retain the legacy
    // transition semantics used by replay/tests.
    const startupBaseline = previous.size === 0;
    let stateDirty = false;

    for (const aircraft of current.values()) {
      const prior = previous.get(aircraft.icaoHex);
      const matchedRules = this.rules.filter((rule) => matchesAircraftRule(aircraft, rule));
      const transitionedRules = matchedRules.filter((rule) => !prior || !matchesAircraftRule(prior, rule));
      const availableRules = transitionedRules.filter((rule) => this.isAvailable(`rule:${rule.id}:${aircraft.icaoHex}`, now));
      if (availableRules.length) {
        const event = watchlistEvent(prior, aircraft, availableRules);
        const accepted = this.enqueue({
          aircraft,
          matchedRules: availableRules,
          emergency: false,
          priority: "normal",
          type: event.type,
          reason: event.reason,
          radiusKm: event.radiusKm ?? null,
        });
        if (accepted) {
          for (const rule of availableRules) {
            this.reserve(`rule:${rule.id}:${aircraft.icaoHex}`, now);
            this.ruleLastTriggered.set(rule.id, now);
          }
          stateDirty = true;
        }
      }

      const emergencyAlertsEnabled = isEmergencyAlertEnabled();
      const currentSquawk = emergencySquawk(aircraft);
      const priorSquawk = emergencySquawk(prior);
      if (startupBaseline && prior === undefined) continue;
      if (priorSquawk && currentSquawk !== priorSquawk) {
        this.dedupCache.delete(`squawk:${priorSquawk}:${aircraft.icaoHex}`);
        stateDirty = true;
      }
      if (currentSquawk && currentSquawk !== priorSquawk && (emergencyAlertsEnabled || matchedRules.length > 0)) {
        const key = `squawk:${currentSquawk}:${aircraft.icaoHex}`;
        if (this.isAvailable(key, now)) {
          const event = emergencyEvent(currentSquawk);
          const accepted = this.enqueue({
            aircraft,
            matchedRules,
            emergency: true,
            priority: "high",
            deliveryMode: emergencyAlertsEnabled ? "configured" : "history_only",
            type: event.type,
            reason: event.reason,
            squawk: currentSquawk,
          });
          if (accepted) {
            this.reserve(key, now);
            for (const rule of matchedRules) this.ruleLastTriggered.set(rule.id, now);
            stateDirty = true;
          }
        }
      } else if (emergencyAlertsEnabled && !currentSquawk && isEmergency(aircraft) && !isEmergency(prior)) {
        const key = `emergency:${aircraft.icaoHex}`;
        if (this.isAvailable(key, now)) {
          const accepted = this.enqueue({ aircraft, matchedRules: [], emergency: true, priority: "high", type: "emergency", reason: "emergency" });
          if (accepted) {
            this.reserve(key, now);
            stateDirty = true;
          }
        }
      }
      if (emergencyAlertsEnabled && isEmergency(prior) && !isEmergency(aircraft)) {
        if (this.dedupCache.delete(`emergency:${aircraft.icaoHex}`)) stateDirty = true;
      }
    }

    if (stateDirty) this.persistState();
    void this.observeDurableTransitions(previous, current);
  }

  private async observeDurableTransitions(previous: ReadonlyMap<string, Aircraft>, current: ReadonlyMap<string, Aircraft>): Promise<void> {
    try {
      if (this.durableTransitionInitializationStarted && !this.durableTransitionBaseline) return;
      this.durableTransitionInitializationStarted = true;
      const repository = getAlertsFleetsRepository();
      const config = await repository.loadConfig();
      if (!this.durableTransitionBaseline) {
        for (const aircraft of current.values()) {
          this.durableTransitions.observeSquawk(aircraft.icaoHex, aircraft.squawk);
          for (const geofence of config.geofences) this.durableTransitions.observeGeofence(aircraft.icaoHex, geofence, aircraft.lat, aircraft.lon);
        }
        this.durableTransitions.beginBaseline();
        this.durableTransitionBaseline = true;
        return;
      }
      const active = new Set(current.keys());
      this.durableTransitions.evict(active);
      for (const aircraft of current.values()) {
        const occurredAt = aircraft.lastSeen;
        const squawk = this.durableTransitions.observeSquawk(aircraft.icaoHex, aircraft.squawk);
        if (squawk?.current) await this.persistDurableSignal({
          sourceType: "SQUAWK", sourceKey: squawkTransitionSourceKey(aircraft.icaoHex, squawk.previous, squawk.current, occurredAt), trigger: "SQUAWK",
          aircraft: { icaoHex: aircraft.icaoHex, registration: aircraft.registration ?? null, callsign: aircraft.callsign ?? null }, occurredAt, squawk: squawk.current,
        });
        for (const geofence of config.geofences) {
          const transition = this.durableTransitions.observeGeofence(aircraft.icaoHex, geofence, aircraft.lat, aircraft.lon);
          if (!transition) continue;
          if (transition.transition === "ENTER" && config.rules.some((rule) => rule.enabled && rule.trigger === "GEOFENCE_ENTER" && rule.geofenceId === geofence.id)) {
            this.enqueue({
              aircraft,
              matchedRules: [],
              emergency: false,
              priority: "normal",
              type: "entered_radius",
              reason: "entered_radius",
              eventId: geofenceTransitionSourceKey(aircraft.icaoHex, geofence.id, transition.transition, occurredAt),
              radiusKm: transition.distanceMeters / 1000,
            });
          }
          await this.persistDurableSignal({
            sourceType: "GEOFENCE", sourceKey: geofenceTransitionSourceKey(aircraft.icaoHex, geofence.id, transition.transition, occurredAt), trigger: transition.transition === "ENTER" ? "GEOFENCE_ENTER" : "GEOFENCE_EXIT",
            aircraft: { icaoHex: aircraft.icaoHex, registration: aircraft.registration ?? null, callsign: aircraft.callsign ?? null }, occurredAt, geofenceId: geofence.id, geofenceName: geofence.name,
            latitude: aircraft.lat ?? undefined, longitude: aircraft.lon ?? undefined, distanceMeters: transition.distanceMeters,
          });
        }
      }
    } catch {
      // Durable alerts are optional enrichment and must not interrupt live ADS-B.
    }
  }

  /**
   * Bridge detector lifecycle events into notifications only for aircraft that
   * currently match an enabled watchlist rule. Airspace entry/exit is omitted
   * deliberately because it is too noisy for push notifications.
   */
  observeIntelligenceEvent(aircraft: Aircraft, event: FlightIntelligenceEvent): void {
    void this.persistDurableOccurrence(aircraft, event);
    if (!INTELLIGENCE_ALERT_EVENTS.has(event.type)) return;
    if (!eventIsFresh(event, aircraft, this.now())) return;
    if (event.type === "HOLDING" && event.metadata?.holdingStatus !== "HOLDING_CONFIRMED") return;
    const matchedRules = this.rules.filter((rule) => matchesAircraftRule(aircraft, rule));
    if (!matchedRules.length) return;
    const mapped = intelligenceAlertEvent(event.type);
    if (!mapped) return;
    const key = `intelligence:${event.lifecycleKey}:${event.type}:${aircraft.icaoHex}`;
    if (this.permanentEvents.has(key)) return;
    const accepted = this.enqueue({
      aircraft,
      matchedRules,
      emergency: false,
      priority: event.type === "GO_AROUND" || event.type === "DIVERSION" ? "high" : "normal",
      type: mapped.type,
      reason: mapped.reason,
      eventId: key,
      intelligence: {
        eventType: event.type,
        confidenceLevel: event.confidenceLevel,
        airportIcao: event.airportIcao,
        sectorId: event.sectorId,
      },
    });
    if (!accepted) return;
    this.rememberPermanentEvent(key);
    for (const rule of matchedRules) this.ruleLastTriggered.set(rule.id, this.now());
    this.persistState();
  }

  private async persistDurableOccurrence(aircraft: Aircraft, event: FlightIntelligenceEvent): Promise<void> {
    const flightEventId = await this.resolvePersistedFlightEventId(event);
    if (flightEventId === null) return;
    await this.persistDurableSignal({
        sourceType: "FLIGHT_EVENT",
        sourceKey: event.eventKey,
        trigger: "FLIGHT_EVENT",
        aircraft: { icaoHex: aircraft.icaoHex, registration: aircraft.registration ?? null, callsign: aircraft.callsign ?? null },
        occurredAt: event.occurredAt,
        flightEventId,
        flightEventType: event.type as AlertV1Signal["flightEventType"],
      });
  }

  private async resolvePersistedFlightEventId(event: FlightIntelligenceEvent): Promise<number | null> {
    const numericId = Number(event.id);
    if (Number.isSafeInteger(numericId) && numericId > 0) return numericId;
    const database = getPrisma();
    const table = database?.orm.public.FlightEvent as unknown as { where: (filter: { eventKey: string }) => { first: () => Promise<{ id?: number } | undefined> } } | undefined;
    if (!table) return null;
    // FlightEvent persistence and alert evaluation are intentionally separate
    // optional lanes. The detector event carries a semantic key until the
    // database assigns its canonical numeric id, so briefly retry the lookup
    // before applying the FLIGHT_EVENT occurrence invariant.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const row = await table.where({ eventKey: event.eventKey }).first();
      const id = Number(row?.id);
      if (Number.isSafeInteger(id) && id > 0) return id;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
    return null;
  }

  private async persistDurableSignal(signal: AlertV1Signal): Promise<void> {
    try {
      const deliveryMode = notificationModeForDurableSignal(signal);
      if (deliveryMode === "OFF") return;
      const config = await getAlertsFleetsRepository().loadConfig();
      for (const occurrence of evaluateAlertV1(signal, config)) {
        const rule = config.rules.find((candidate) => candidate.id === occurrence.ruleId);
        if (!rule) continue;
        const channels = channelsForNotificationMode(deliveryMode, rule.channels);
        if (channels === null) continue;
        await getAlertsFleetsRepository().recordOccurrence({
          id: occurrence.id, ruleId: occurrence.ruleId, sourceType: occurrence.sourceType, sourceKey: occurrence.sourceKey, trigger: occurrence.trigger,
          aircraftIcao: occurrence.aircraft.icaoHex, registration: occurrence.aircraft.registration, callsign: occurrence.aircraft.callsign,
          flightEventId: signal.sourceType === "FLIGHT_EVENT" ? signal.flightEventId ?? null : null, occurredAt: occurrence.occurredAt, payload: occurrence.payload, channels,
        });
      }
    } catch {
      // Durable alerts are optional enrichment and must not interrupt live ADS-B.
    }
  }

  /** Emits only meaningful receiver health transitions; repeated degraded polls are suppressed. */
  observeReceiverQuality(aircraft: Aircraft, previous: "GOOD" | "DEGRADED" | "OFFLINE", current: "GOOD" | "DEGRADED" | "OFFLINE"): void {
    if (current === "GOOD") {
      for (const key of this.permanentEvents.keys()) if (key.startsWith(`receiver:${aircraft.icaoHex}:`)) this.permanentEvents.delete(key);
      return;
    }
    if (previous === current) return;
    const key = `receiver:${aircraft.icaoHex}:${previous}:${current}`;
    if (this.permanentEvents.has(key)) return;
    const accepted = this.enqueue({
      aircraft,
      matchedRules: [],
      emergency: false,
      priority: "normal",
      type: current === "OFFLINE" ? "data_stale" : "receiver_degraded",
      reason: current === "OFFLINE" ? "data_stale" : "receiver_degraded",
      eventId: key,
      metadata: { previousState: previous, currentState: current },
    });
    if (accepted) { this.rememberPermanentEvent(key); this.persistState(); }
  }

  /** Emits once when a weather relation crosses into a relevant proximity state. */
  observeWeatherProximity(aircraft: Aircraft, relation: "clear" | "nearby" | "approaching" | "inside", previousRelation: "clear" | "nearby" | "approaching" | "inside" | null, metadata: Record<string, string | number | boolean | null> = {}): void {
    if (relation === previousRelation || relation === "clear" || aircraft.seenPosSeconds !== null && aircraft.seenPosSeconds > 120) return;
    const key = `weather:${aircraft.icaoHex}:${String(metadata.sigmetId ?? "unknown")}:${relation}`;
    if (this.permanentEvents.has(key)) return;
    const accepted = this.enqueue({ aircraft, matchedRules: [], emergency: false, priority: relation === "inside" ? "high" : "normal", type: "weather_proximity", reason: "weather_proximity", eventId: key, metadata: { ...metadata, relation } });
    if (accepted) { this.rememberPermanentEvent(key); this.persistState(); }
  }

  /** Called only after durable history confirms that a first Flight exists. */
  observeNewAircraft(aircraft: Aircraft): void {
    const id = `new:${aircraft.icaoHex.toUpperCase()}`;
    if (this.permanentEvents.has(id)) return;
    const accepted = this.enqueue({
      aircraft,
      matchedRules: [],
      emergency: false,
      priority: "normal",
      type: "new_aircraft",
      reason: "new",
      eventId: id,
    });
    if (!accepted) return;
    this.rememberPermanentEvent(id);
    this.persistState();
  }

  /** Called only on a genuine in-memory record transition. */
  observeReceptionRecord(scope: "daily" | "lifetime", current: ReceiverDailyReceptionRecord, previous: ReceiverDailyReceptionRecord | null): void {
    const id = `record:${scope}:${current.date}:${current.icaoHex}:${current.distanceKm.toFixed(3)}:${current.recordedAt}`;
    // A moving aircraft can raise the receiver maximum on every poll. Keep
    // the individual event ID for durable history, but apply the shared
    // notification cooldown per record scope/day so that this does not turn
    // into a notification stream.
    const cooldownKey = `record:${scope}:${current.date}`;
    if (this.permanentEvents.has(id) || !this.isAvailable(cooldownKey, this.now())) return;
    const record: AlertHistoryRecordValue = {
      scope,
      distanceKm: current.distanceKm,
      bearing: current.bearing,
      recordedAt: current.recordedAt,
      previousDistanceKm: previous?.distanceKm ?? null,
    };
    const accepted = this.enqueue({
      aircraft: aircraftFromRecord(current),
      matchedRules: [],
      emergency: false,
      priority: "normal",
      type: "reception_record",
      reason: "record",
      eventId: id,
      record,
    });
    if (!accepted) return;
    this.rememberPermanentEvent(id);
    this.reserve(cooldownKey, this.now());
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

  private enqueue(alert: AircraftAlert): boolean {
    const preferenceMode = this.notificationMode(alert);
    if (preferenceMode === "OFF") return true;

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
      intelligence: alert.intelligence ?? null,
      metadata: alert.metadata,
    }).catch(() => undefined);

    if (alert.deliveryMode === "history_only" || preferenceMode === "CENTER_ONLY") {
      void this.history.recordNotification(eventId, "disabled").catch(() => undefined);
      return true;
    }

    const normalPending = this.pending.reduce(
      (count, pending) => count + (pending.priority === "high" ? 0 : 1),
      0,
    );
    const queueFull = this.pending.length >= MAX_PENDING_ALERTS;
    const normalCapacityFull = normalPending >= MAX_NORMAL_PENDING_ALERTS;
    if (queueFull || (alert.priority !== "high" && normalCapacityFull)) {
      console.error(`AirRadar alert dropped: provider=${this.notifier.name} reason=queue_full priority=${alert.priority}`);
      void this.history.recordNotification(eventId, "failed").catch(() => undefined);
      return false;
    }

    const queued = { ...alert, eventId, type, reason };
    if (alert.priority === "high") {
      const firstNormal = this.pending.findIndex((pending) => pending.priority !== "high");
      if (firstNormal === -1) this.pending.push(queued);
      else this.pending.splice(firstNormal, 0, queued);
    } else {
      this.pending.push(queued);
    }
    this.drain();
    return true;
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
