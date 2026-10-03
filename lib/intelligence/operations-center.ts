import type {
  LogbookInterestingAircraft,
  LogbookInterestingReason,
  LogbookSummaryResponse,
} from "@/lib/aircraft/types";
import type { FlightEventType, FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { AlertHistoryEntry } from "@/lib/server/alert-history";

export type OperationsEventTone = "attention" | "movement" | "context" | "record" | "watchlist";
export type OperationsTimelineSource = "intelligence" | "alert";

export interface OperationsTimelineItem {
  key: string;
  source: OperationsTimelineSource;
  occurredAt: string;
  priority: number;
  tone: OperationsEventTone;
  icaoHex: string;
  intelligence: FlightIntelligenceEvent | null;
  alert: AlertHistoryEntry | null;
}

export const OPERATIONS_CENTER_WINDOW_MS = 60 * 60 * 1000;
export const OPERATIONS_CENTER_LIMIT = 10;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

const EVENT_PRIORITY: Record<FlightEventType, number> = {
  GO_AROUND: 100,
  DIVERSION: 95,
  HOLDING: 90,
  UNUSUAL_TURN: 85,
  ORBIT: 80,
  HOLDING_CANDIDATE: 70,
  APPROACH: 60,
  LANDING: 60,
  TAKEOFF: 60,
  INITIAL_CLIMB: 55,
  TOP_OF_DESCENT: 50,
  HOLDING_ENDED: 45,
  LEVEL_OFF: 35,
  AIRSPACE_ENTRY: 30,
  AIRSPACE_EXIT: 30,
  CRUISE_ENTER: 20,
};

const HIGHLIGHT_PRIORITY: Record<LogbookInterestingReason, number> = {
  emergency: 100,
  new: 90,
  rare: 80,
  watchlisted: 70,
  record: 60,
  returning: 40,
};

export function operationsEventPriority(type: FlightEventType): number {
  return EVENT_PRIORITY[type];
}

export function operationsEventTone(type: FlightEventType): OperationsEventTone {
  switch (type) {
    case "GO_AROUND":
    case "DIVERSION":
    case "HOLDING":
    case "UNUSUAL_TURN":
    case "ORBIT":
      return "attention";
    case "APPROACH":
    case "LANDING":
    case "TAKEOFF":
    case "INITIAL_CLIMB":
    case "TOP_OF_DESCENT":
    case "HOLDING_CANDIDATE":
    case "HOLDING_ENDED":
      return "movement";
    default:
      return "context";
  }
}

function alertPriority(entry: AlertHistoryEntry): number {
  if (entry.type === "emergency" || entry.type === "emergency_7500" || entry.type === "emergency_7600" || entry.type === "emergency_7700") return 140;
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType === "SQUAWK") return 138;
  if (entry.type === "reception_record") return entry.record?.scope === "lifetime" ? 130 : 120;
  if (entry.type === "new_aircraft") return 110;
  if (entry.type === "watchlist" || entry.type === "aircraft_appeared" || entry.type === "entered_radius") return 105;
  if (entry.type === "alert_v1") return 100;
  if (entry.type === "weather_proximity") return 75;
  return 0;
}

export function operationsAlertTone(entry: AlertHistoryEntry): OperationsEventTone {
  if (entry.type === "emergency" || entry.type === "emergency_7500" || entry.type === "emergency_7600" || entry.type === "emergency_7700") return "attention";
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType === "SQUAWK") return "attention";
  if (entry.type === "reception_record" || entry.type === "new_aircraft") return "record";
  if (entry.type === "watchlist" || entry.type === "aircraft_appeared" || entry.type === "entered_radius" || entry.type === "alert_v1") return "watchlist";
  return "context";
}

function isTimelineAlert(entry: AlertHistoryEntry): boolean {
  if (entry.type.startsWith("intelligence_")) return false;
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType === "FLIGHT_EVENT") return false;
  if (alertPriority(entry) <= 0) return false;
  const hex = entry.aircraft.icaoHex.trim().toUpperCase();
  return Boolean(hex && hex !== "UNKNOWN");
}

function timestampInWindow(value: string, earliest: number, latest: number): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= earliest && timestamp <= latest;
}

function alertSemanticKey(entry: AlertHistoryEntry): string {
  const hex = entry.aircraft.icaoHex.trim().toUpperCase();
  const minute = Math.floor(Date.parse(entry.detectedAt) / 60_000);
  if (entry.type.startsWith("emergency") || (entry.type === "alert_v1" && entry.alertV1?.sourceType === "SQUAWK")) {
    return `emergency:${hex}:${entry.squawk ?? entry.alertV1?.sourceKey ?? ""}:${minute}`;
  }
  if (entry.type === "reception_record") {
    return `record:${hex}:${entry.record?.scope ?? ""}:${entry.record?.recordedAt ?? entry.detectedAt}`;
  }
  if (entry.type === "new_aircraft") return `new:${hex}:${entry.detectedAt.slice(0, 10)}`;
  return `${entry.type}:${hex}:${entry.reason}:${minute}`;
}

export function recentOperationsEvents(
  events: FlightIntelligenceEvent[],
  now = Date.now(),
  limit = OPERATIONS_CENTER_LIMIT,
): FlightIntelligenceEvent[] {
  const earliest = now - OPERATIONS_CENTER_WINDOW_MS;
  const latest = now + CLOCK_SKEW_TOLERANCE_MS;

  return events
    .filter((event) => timestampInWindow(event.occurredAt, earliest, latest))
    .sort((left, right) =>
      operationsEventPriority(right.type) - operationsEventPriority(left.type)
      || Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
      || right.eventKey.localeCompare(left.eventKey))
    .slice(0, Math.max(0, limit));
}

export function recentOperationsTimeline(
  intelligenceEvents: FlightIntelligenceEvent[],
  alertEntries: AlertHistoryEntry[],
  now = Date.now(),
  limit = OPERATIONS_CENTER_LIMIT,
): OperationsTimelineItem[] {
  const earliest = now - OPERATIONS_CENTER_WINDOW_MS;
  const latest = now + CLOCK_SKEW_TOLERANCE_MS;
  const items: OperationsTimelineItem[] = [];

  for (const event of intelligenceEvents) {
    if (!timestampInWindow(event.occurredAt, earliest, latest)) continue;
    items.push({
      key: `intelligence:${event.eventKey}`,
      source: "intelligence",
      occurredAt: event.occurredAt,
      priority: operationsEventPriority(event.type),
      tone: operationsEventTone(event.type),
      icaoHex: event.icaoHex,
      intelligence: event,
      alert: null,
    });
  }

  const deduplicatedAlerts = new Map<string, AlertHistoryEntry>();
  for (const entry of alertEntries) {
    if (!isTimelineAlert(entry) || !timestampInWindow(entry.detectedAt, earliest, latest)) continue;
    const semanticKey = alertSemanticKey(entry);
    const current = deduplicatedAlerts.get(semanticKey);
    if (!current || Date.parse(entry.detectedAt) > Date.parse(current.detectedAt)) deduplicatedAlerts.set(semanticKey, entry);
  }
  for (const entry of deduplicatedAlerts.values()) {
    items.push({
      key: `alert:${entry.id}`,
      source: "alert",
      occurredAt: entry.detectedAt,
      priority: alertPriority(entry),
      tone: operationsAlertTone(entry),
      icaoHex: entry.aircraft.icaoHex,
      intelligence: null,
      alert: entry,
    });
  }

  return items
    .sort((left, right) =>
      right.priority - left.priority
      || Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
      || right.key.localeCompare(left.key))
    .slice(0, Math.max(0, limit));
}

export function attentionOperationsCount(items: OperationsTimelineItem[]): number {
  return items.reduce((count, item) => count + (item.tone === "attention" ? 1 : 0), 0);
}

function highlightScore(item: LogbookInterestingAircraft): number {
  return item.reasons.reduce((total, reason) => total + HIGHLIGHT_PRIORITY[reason], 0);
}

export function liveOperationsHighlights(
  summary: LogbookSummaryResponse | null,
  limit = 4,
): LogbookInterestingAircraft[] {
  if (!summary) return [];
  return summary.interestingAircraft
    .filter((item) => item.isLive && item.reasons.length > 0)
    .sort((left, right) =>
      highlightScore(right) - highlightScore(left)
      || (right.distanceKm ?? -1) - (left.distanceKm ?? -1)
      || left.icaoHex.localeCompare(right.icaoHex))
    .slice(0, Math.max(0, limit));
}
