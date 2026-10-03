import type {
  RecapDailyHighlight,
  RecapDailyIntelligence,
  RecapRankingItem,
} from "@/lib/aircraft/types";
import type { AlertHistoryEntry } from "@/lib/server/alert-history";

export interface DailyRecapFlightInput {
  startedAt: Date;
  airline: string | null;
}

export interface DailyRecapEventAggregateInput {
  type: string;
  count: number;
}

export interface DailyRecapEventInput {
  id: number;
  eventKey: string;
  type: string;
  icaoHex: string;
  occurredAt: Date;
  confidence: number;
  airportIcao: string | null;
  runway: string | null;
}

interface BuildDailyIntelligenceInput {
  flights: DailyRecapFlightInput[];
  eventAggregates: DailyRecapEventAggregateInput[];
  events: DailyRecapEventInput[];
  alerts: AlertHistoryEntry[];
  timezone: string;
  complete: boolean;
}

const DAILY_HIGHLIGHT_LIMIT = 10;
const TOP_AIRLINE_LIMIT = 5;

const EVENT_PRIORITY: Record<string, number> = {
  GO_AROUND: 120,
  DIVERSION: 115,
  HOLDING: 110,
  UNUSUAL_TURN: 90,
  ORBIT: 85,
  HOLDING_CANDIDATE: 70,
  APPROACH: 55,
  LANDING: 55,
  TAKEOFF: 55,
  TOP_OF_DESCENT: 45,
};

function normalizeHex(value: string): string {
  return value.trim().toUpperCase();
}

function localHour(date: Date, timezone: string): number | null {
  if (!Number.isFinite(date.getTime())) return null;
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const hour = Number.parseInt(value, 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function busiestHour(flights: DailyRecapFlightInput[], timezone: string): RecapDailyIntelligence["busiestHour"] {
  const counts = new Map<number, number>();
  for (const flight of flights) {
    const hour = localHour(flight.startedAt, timezone);
    if (hour === null) continue;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
  return best ? { hour: best[0], flights: best[1] } : null;
}

function topAirlines(flights: DailyRecapFlightInput[]): RecapRankingItem[] {
  const counts = new Map<string, number>();
  for (const flight of flights) {
    const airline = flight.airline?.trim().toUpperCase();
    if (!airline) continue;
    counts.set(airline, (counts.get(airline) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, TOP_AIRLINE_LIMIT);
}

function aggregateCount(aggregates: DailyRecapEventAggregateInput[], type: string): number {
  return aggregates
    .filter((item) => item.type.trim().toUpperCase() === type)
    .reduce((total, item) => total + Math.max(0, Math.trunc(item.count)), 0);
}

function confidenceLevel(value: number): RecapDailyHighlight["confidenceLevel"] {
  if (!Number.isFinite(value)) return null;
  return value >= 0.8 ? "high" : value >= 0.6 ? "medium" : "low";
}

function eventHighlight(event: DailyRecapEventInput): { priority: number; value: RecapDailyHighlight } | null {
  const type = event.type.trim().toUpperCase();
  const priority = EVENT_PRIORITY[type] ?? 0;
  const icaoHex = normalizeHex(event.icaoHex);
  if (priority <= 0 || !icaoHex || !Number.isFinite(event.occurredAt.getTime())) return null;
  return {
    priority,
    value: {
      key: `flight-event:${event.eventKey || event.id}`,
      kind: "flight_event",
      occurredAt: event.occurredAt.toISOString(),
      icaoHex,
      callsign: null,
      registration: null,
      eventType: type,
      airportIcao: event.airportIcao?.trim().toUpperCase() || null,
      runway: event.runway?.trim().toUpperCase() || null,
      confidenceLevel: confidenceLevel(event.confidence),
      squawk: null,
      distanceKm: null,
    },
  };
}

function alertPriority(entry: AlertHistoryEntry): number {
  if (
    entry.type === "emergency"
    || entry.type === "emergency_7500"
    || entry.type === "emergency_7600"
    || entry.type === "emergency_7700"
  ) return 150;
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType === "SQUAWK") return 148;
  if (entry.type === "reception_record") return entry.record?.scope === "lifetime" ? 140 : 130;
  if (entry.type === "new_aircraft") return 125;
  if (entry.type === "watchlist" || entry.type === "aircraft_appeared" || entry.type === "entered_radius") return 105;
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType !== "FLIGHT_EVENT") return 100;
  return 0;
}

function alertKind(entry: AlertHistoryEntry): RecapDailyHighlight["kind"] | null {
  if (
    entry.type === "emergency"
    || entry.type === "emergency_7500"
    || entry.type === "emergency_7600"
    || entry.type === "emergency_7700"
    || (entry.type === "alert_v1" && entry.alertV1?.sourceType === "SQUAWK")
  ) return "emergency";
  if (entry.type === "reception_record") return "reception_record";
  if (entry.type === "new_aircraft") return "new_aircraft";
  if (
    entry.type === "watchlist"
    || entry.type === "aircraft_appeared"
    || entry.type === "entered_radius"
    || (entry.type === "alert_v1" && entry.alertV1?.sourceType !== "FLIGHT_EVENT")
  ) return "watchlist";
  return null;
}

function alertSemanticKey(entry: AlertHistoryEntry): string {
  const hex = normalizeHex(entry.aircraft.icaoHex);
  const timestamp = Date.parse(entry.detectedAt);
  const minute = Number.isFinite(timestamp) ? Math.floor(timestamp / 60_000) : 0;
  const kind = alertKind(entry) ?? entry.type;
  if (kind === "emergency") {
    return `emergency:${hex}:${entry.squawk ?? entry.alertV1?.sourceKey ?? ""}:${minute}`;
  }
  if (kind === "reception_record") {
    return `record:${hex}:${entry.record?.scope ?? ""}:${entry.record?.recordedAt ?? entry.detectedAt}`;
  }
  if (kind === "new_aircraft") return `new:${hex}:${entry.detectedAt.slice(0, 10)}`;
  return `${kind}:${hex}:${entry.reason}:${minute}`;
}

function deduplicatedAlerts(alerts: AlertHistoryEntry[]): AlertHistoryEntry[] {
  const result = new Map<string, AlertHistoryEntry>();
  for (const entry of alerts) {
    const kind = alertKind(entry);
    const priority = alertPriority(entry);
    const detectedAt = Date.parse(entry.detectedAt);
    const hex = normalizeHex(entry.aircraft.icaoHex);
    if (!kind || priority <= 0 || !Number.isFinite(detectedAt) || !hex || hex === "UNKNOWN") continue;
    const key = alertSemanticKey(entry);
    const current = result.get(key);
    if (!current || Date.parse(entry.detectedAt) > Date.parse(current.detectedAt)) result.set(key, entry);
  }
  return [...result.values()];
}

function alertHighlight(entry: AlertHistoryEntry): { priority: number; value: RecapDailyHighlight } | null {
  const kind = alertKind(entry);
  const priority = alertPriority(entry);
  const detectedAt = Date.parse(entry.detectedAt);
  const icaoHex = normalizeHex(entry.aircraft.icaoHex);
  if (!kind || priority <= 0 || !Number.isFinite(detectedAt) || !icaoHex || icaoHex === "UNKNOWN") return null;
  return {
    priority,
    value: {
      key: `alert:${entry.id}`,
      kind,
      occurredAt: new Date(detectedAt).toISOString(),
      icaoHex,
      callsign: entry.aircraft.callsign,
      registration: entry.aircraft.registration,
      eventType: null,
      airportIcao: entry.alertV1?.airportIcao?.trim().toUpperCase() || entry.intelligence?.airportIcao?.trim().toUpperCase() || null,
      runway: entry.alertV1?.runway?.trim().toUpperCase() || null,
      confidenceLevel: entry.intelligence?.confidenceLevel ?? null,
      squawk: entry.squawk ?? (entry.alertV1?.sourceType === "SQUAWK" ? entry.alertV1.sourceKey : null),
      distanceKm: entry.record?.distanceKm ?? null,
    },
  };
}

function buildHighlights(events: DailyRecapEventInput[], alerts: AlertHistoryEntry[]): RecapDailyHighlight[] {
  const candidates = [
    ...events.flatMap((event) => {
      const candidate = eventHighlight(event);
      return candidate ? [candidate] : [];
    }),
    ...deduplicatedAlerts(alerts).flatMap((entry) => {
      const candidate = alertHighlight(entry);
      return candidate ? [candidate] : [];
    }),
  ];

  return candidates
    .sort((left, right) =>
      right.priority - left.priority
      || Date.parse(right.value.occurredAt) - Date.parse(left.value.occurredAt)
      || right.value.key.localeCompare(left.value.key))
    .slice(0, DAILY_HIGHLIGHT_LIMIT)
    .sort((left, right) =>
      Date.parse(right.value.occurredAt) - Date.parse(left.value.occurredAt)
      || right.priority - left.priority
      || right.value.key.localeCompare(left.value.key))
    .map((item) => item.value);
}

export function buildDailyIntelligence(input: BuildDailyIntelligenceInput): RecapDailyIntelligence {
  const alerts = deduplicatedAlerts(input.alerts);
  return {
    complete: input.complete,
    busiestHour: busiestHour(input.flights, input.timezone),
    topAirlines: topAirlines(input.flights),
    eventCounts: {
      goArounds: aggregateCount(input.eventAggregates, "GO_AROUND"),
      holdings: aggregateCount(input.eventAggregates, "HOLDING"),
      diversions: aggregateCount(input.eventAggregates, "DIVERSION"),
      emergencies: alerts.filter((entry) => alertKind(entry) === "emergency").length,
    },
    highlights: buildHighlights(input.events, input.alerts),
  };
}
