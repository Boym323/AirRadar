import {
  ALERT_V1_EVENT_TYPES,
  matchingAlertV1Fleets,
  ruleTargetMatches,
  signalMatchesRule,
  type AlertV1FlightEventType,
  type AlertV1Signal,
  type AlertV1TriggerType,
} from "@/lib/server/alerts-fleets-v1";
import { getAlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";
import { getNotificationCenterStateStore } from "@/lib/server/notification-center-state";
import { channelsForNotificationMode, notificationModeForDurableSignal } from "@/lib/server/notification-preferences";

export interface AlertSimulatorInput {
  icaoHex: string;
  registration?: string | null;
  callsign?: string | null;
  trigger: AlertV1TriggerType;
  flightEventType?: AlertV1FlightEventType;
  squawk?: string;
  geofenceId?: string;
  occurredAt?: string;
}

export interface AlertSimulatorRuleResult {
  id: string;
  name: string;
  matched: boolean;
  reasons: string[];
  targetMatched: boolean;
  triggerMatched: boolean;
  conditionMatched: boolean;
  cooldownActive: boolean;
  cooldownRemainingMs: number;
  preferenceMode: "OFF" | "CENTER_ONLY" | "PUSH";
  muted: boolean;
  effectiveChannels: string[];
}

export interface AlertSimulatorResult {
  signal: AlertV1Signal;
  matchedFleetIds: string[];
  rules: AlertSimulatorRuleResult[];
  matchedRuleIds: string[];
}

function normalizeInput(input: unknown): AlertSimulatorInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid simulator input");
  const row = input as Record<string, unknown>;
  const icaoHex = typeof row.icaoHex === "string" ? row.icaoHex.trim().toUpperCase() : "";
  if (!/^[0-9A-F]{6}$/.test(icaoHex)) throw new Error("icaoHex must contain 6 hexadecimal characters");
  const trigger = row.trigger;
  if (trigger !== "FLIGHT_EVENT" && trigger !== "SQUAWK" && trigger !== "GEOFENCE_ENTER" && trigger !== "GEOFENCE_EXIT") throw new Error("invalid trigger");
  const occurredAt = typeof row.occurredAt === "string" && Number.isFinite(Date.parse(row.occurredAt)) ? new Date(row.occurredAt).toISOString() : new Date().toISOString();
  const normalized: AlertSimulatorInput = {
    icaoHex,
    registration: typeof row.registration === "string" ? row.registration.trim().toUpperCase() || null : null,
    callsign: typeof row.callsign === "string" ? row.callsign.trim().toUpperCase() || null : null,
    trigger,
    occurredAt,
  };
  if (trigger === "FLIGHT_EVENT") {
    if (typeof row.flightEventType !== "string" || !ALERT_V1_EVENT_TYPES.includes(row.flightEventType as AlertV1FlightEventType)) throw new Error("valid flightEventType is required");
    normalized.flightEventType = row.flightEventType as AlertV1FlightEventType;
  }
  if (trigger === "SQUAWK") {
    if (row.squawk !== "7500" && row.squawk !== "7600" && row.squawk !== "7700") throw new Error("squawk must be 7500, 7600 or 7700");
    normalized.squawk = row.squawk;
  }
  if (trigger === "GEOFENCE_ENTER" || trigger === "GEOFENCE_EXIT") {
    if (typeof row.geofenceId !== "string" || !row.geofenceId.trim()) throw new Error("geofenceId is required");
    normalized.geofenceId = row.geofenceId.trim();
  }
  return normalized;
}

function conditionMatches(signal: AlertV1Signal, rule: { trigger: string; flightEventTypes?: readonly string[]; squawks?: readonly string[]; geofenceId?: string }): boolean {
  if (signal.trigger !== rule.trigger) return false;
  if (signal.trigger === "FLIGHT_EVENT") return Boolean(signal.flightEventType && rule.flightEventTypes?.includes(signal.flightEventType));
  if (signal.trigger === "SQUAWK") return Boolean(signal.squawk && rule.squawks?.includes(signal.squawk));
  return signal.geofenceId === rule.geofenceId;
}

export async function simulateAlertRules(input: unknown): Promise<AlertSimulatorResult> {
  const parsed = normalizeInput(input);
  const repo = getAlertsFleetsRepository();
  const [config, history] = await Promise.all([repo.loadConfig(true), repo.listOccurrenceHistory(200)]);
  const signal: AlertV1Signal = {
    sourceType: parsed.trigger === "FLIGHT_EVENT" ? "FLIGHT_EVENT" : parsed.trigger === "SQUAWK" ? "SQUAWK" : "GEOFENCE",
    sourceKey: ["simulator", parsed.icaoHex, parsed.trigger, parsed.occurredAt].join(":"),
    trigger: parsed.trigger,
    aircraft: { icaoHex: parsed.icaoHex, registration: parsed.registration ?? null, callsign: parsed.callsign ?? null },
    occurredAt: parsed.occurredAt!,
    ...(parsed.flightEventType ? { flightEventType: parsed.flightEventType, flightEventId: 1 } : {}),
    ...(parsed.squawk ? { squawk: parsed.squawk } : {}),
    ...(parsed.geofenceId ? { geofenceId: parsed.geofenceId } : {}),
  };
  const matchedFleetIds = matchingAlertV1Fleets(signal.aircraft, config.fleets);
  const preferenceMode = notificationModeForDurableSignal(signal);
  const nowMs = Date.parse(signal.occurredAt);
  const rules = config.rules.map((rule): AlertSimulatorRuleResult => {
    const targetMatched = ruleTargetMatches(rule, signal.aircraft, config.fleets);
    const triggerMatched = rule.trigger === signal.trigger;
    const conditionMatched = conditionMatches(signal, rule);
    const matched = signalMatchesRule(signal, rule, config.fleets);
    const muted = getNotificationCenterStateStore().isMuted(signal.aircraft.icaoHex, [rule.id]);
    let cooldownRemainingMs = 0;
    if (matched && rule.cooldownMs && rule.cooldownMs > 0) {
      const latest = history
        .filter((row) => String(row.occurrence.ruleId) === rule.id && String(row.occurrence.aircraftIcao).toUpperCase() === signal.aircraft.icaoHex)
        .map((row) => Date.parse(String(row.occurrence.occurredAt)))
        .filter(Number.isFinite)
        .sort((a, b) => b - a)[0];
      if (latest !== undefined) cooldownRemainingMs = Math.max(0, rule.cooldownMs - Math.max(0, nowMs - latest));
    }
    const effectiveMode = muted ? "CENTER_ONLY" : preferenceMode;
    const effectiveChannels = matched && cooldownRemainingMs === 0 ? channelsForNotificationMode(effectiveMode, rule.channels) ?? [] : [];
    const reasons = [
      rule.enabled ? "rule enabled" : "rule disabled",
      targetMatched ? "target matched" : "target did not match",
      triggerMatched ? "trigger matched" : "trigger did not match",
      conditionMatched ? "trigger condition matched" : "trigger condition did not match",
      cooldownRemainingMs > 0 ? "cooldown active for " + cooldownRemainingMs + " ms" : "cooldown clear",
      muted ? "delivery muted to center only" : "notification preference " + preferenceMode,
    ];
    return {
      id: rule.id, name: rule.name, matched, reasons, targetMatched, triggerMatched, conditionMatched,
      cooldownActive: cooldownRemainingMs > 0, cooldownRemainingMs, preferenceMode: effectiveMode, muted, effectiveChannels,
    };
  });
  return { signal, matchedFleetIds, rules, matchedRuleIds: rules.filter((rule) => rule.matched && !rule.cooldownActive).map((rule) => rule.id) };
}
