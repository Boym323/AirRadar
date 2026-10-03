import type { FlightEventType, FlightIntelligenceEvent } from "@/lib/intelligence/types";

export type OperationsEventTone = "attention" | "movement" | "context";

export const OPERATIONS_CENTER_WINDOW_MS = 60 * 60 * 1000;
export const OPERATIONS_CENTER_LIMIT = 8;
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

export function recentOperationsEvents(
  events: FlightIntelligenceEvent[],
  now = Date.now(),
  limit = OPERATIONS_CENTER_LIMIT,
): FlightIntelligenceEvent[] {
  const earliest = now - OPERATIONS_CENTER_WINDOW_MS;
  const latest = now + CLOCK_SKEW_TOLERANCE_MS;

  return events
    .filter((event) => {
      const occurredAt = Date.parse(event.occurredAt);
      return Number.isFinite(occurredAt) && occurredAt >= earliest && occurredAt <= latest;
    })
    .sort((left, right) =>
      operationsEventPriority(right.type) - operationsEventPriority(left.type)
      || Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
      || right.eventKey.localeCompare(left.eventKey))
    .slice(0, Math.max(0, limit));
}

export function attentionOperationsCount(events: FlightIntelligenceEvent[]): number {
  return events.reduce(
    (count, event) => count + (operationsEventTone(event.type) === "attention" ? 1 : 0),
    0,
  );
}
