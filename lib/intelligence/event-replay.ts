import type { FlightIntelligenceEvent, FlightEventType } from "@/lib/intelligence/types";

export const EVENT_REPLAY_RADIUS_MINUTES = 10;

const REPLAYABLE_EVENT_TYPES = new Set<FlightEventType>([
  "GO_AROUND",
  "HOLDING",
  "DIVERSION",
  "UNUSUAL_TURN",
  "ORBIT",
]);

export function isEventReplayable(type: FlightEventType): boolean {
  return REPLAYABLE_EVENT_TYPES.has(type);
}

export function eventReplayQuery(event: Pick<FlightIntelligenceEvent, "type" | "occurredAt" | "icaoHex" | "flightId">): Record<string, string> | null {
  if (!isEventReplayable(event.type)) return null;
  const at = Date.parse(event.occurredAt);
  if (!Number.isFinite(at)) return null;
  const query: Record<string, string> = {
    at: new Date(at).toISOString(),
    replay: String(EVENT_REPLAY_RADIUS_MINUTES),
    hex: event.icaoHex.toUpperCase(),
  };
  if (event.flightId !== null) query.flightId = String(event.flightId);
  return query;
}
