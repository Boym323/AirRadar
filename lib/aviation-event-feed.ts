export type AviationEventFeedSource = "FLIGHT_INTELLIGENCE" | "ALERT" | "NAVIGATION_INTEGRITY" | "AIRPORT_OPERATIONS";
export type AviationEventFeedSeverity = "info" | "attention" | "warning";

export interface AviationEventFeedItem {
  id: string;
  occurredAt: string;
  source: AviationEventFeedSource;
  severity: AviationEventFeedSeverity;
  title: string;
  subject: string | null;
  context: string | null;
  href: string | null;
  provenance: "OBSERVED" | "INFERRED" | "SYSTEM";
}

interface IntelligenceEventLike {
  eventKey: string;
  type: string;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  occurredAt: string;
  airportIcao: string | null;
  runway: string | null;
  sectorId: string | null;
  confidenceLevel?: string;
}

interface AlertLike {
  id: string;
  detectedAt: string;
  type: string;
  aircraft: { icaoHex: string; callsign: string | null; registration: string | null };
  intelligence?: { airportIcao?: string | null; sectorId?: string | null } | null;
}

interface NavigationAnomalyLike {
  id: string;
  startedAt: string;
  lastObservedAt: string;
  severity: "REDUCED" | "DEGRADED" | "SEVERE";
  confidence: string;
  affectedAircraftCount: number;
}

interface AirportMovementLike {
  flightId: number;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  movement: "GO_AROUND" | "HOLDING" | string;
  observedAt: string;
  airport: string;
  runway: { designator: string } | null;
}

function validIso(value: string): string | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function subject(icaoHex: string, callsign: string | null, registration: string | null): string {
  return callsign?.trim() || registration?.trim() || icaoHex.trim().toUpperCase();
}

export function flightIntelligenceFeedItems(events: readonly IntelligenceEventLike[]): AviationEventFeedItem[] {
  return events.flatMap((event) => {
    const occurredAt = validIso(event.occurredAt);
    if (!occurredAt) return [];
    const warning = event.type === "GO_AROUND" || event.type === "DIVERSION" || event.type === "UNUSUAL_TURN";
    const attention = event.type === "HOLDING" || event.type === "ORBIT" || event.type === "AIRSPACE_ENTRY";
    return [{
      id: "fi:" + event.eventKey,
      occurredAt,
      source: "FLIGHT_INTELLIGENCE" as const,
      severity: warning ? "warning" as const : attention ? "attention" as const : "info" as const,
      title: event.type.replaceAll("_", " "),
      subject: subject(event.icaoHex, event.callsign, event.registration),
      context: [event.airportIcao, event.runway ? "RWY " + event.runway : null, event.sectorId].filter(Boolean).join(" · ") || null,
      href: "/aircraft/" + encodeURIComponent(event.icaoHex),
      provenance: "OBSERVED" as const,
    }];
  });
}

export function alertFeedItems(items: readonly AlertLike[]): AviationEventFeedItem[] {
  return items.flatMap((item) => {
    const occurredAt = validIso(item.detectedAt);
    if (!occurredAt) return [];
    const normalized = item.type.toLowerCase();
    const warning = normalized.includes("emergency");
    return [{
      id: "alert:" + item.id,
      occurredAt,
      source: "ALERT" as const,
      severity: warning ? "warning" as const : "attention" as const,
      title: item.type.replaceAll("_", " "),
      subject: subject(item.aircraft.icaoHex, item.aircraft.callsign, item.aircraft.registration),
      context: [item.intelligence?.airportIcao, item.intelligence?.sectorId].filter(Boolean).join(" · ") || null,
      href: "/aircraft/" + encodeURIComponent(item.aircraft.icaoHex),
      provenance: "SYSTEM" as const,
    }];
  });
}

export function navigationIntegrityFeedItems(items: readonly NavigationAnomalyLike[]): AviationEventFeedItem[] {
  return items.flatMap((item) => {
    const occurredAt = validIso(item.lastObservedAt || item.startedAt);
    if (!occurredAt) return [];
    return [{
      id: "nav:" + item.id,
      occurredAt,
      source: "NAVIGATION_INTEGRITY" as const,
      severity: item.severity === "SEVERE" ? "warning" as const : "attention" as const,
      title: "Navigation integrity " + item.severity,
      subject: item.affectedAircraftCount + " aircraft",
      context: item.confidence + " confidence",
      href: "/navigation-integrity",
      provenance: "INFERRED" as const,
    }];
  });
}

export function airportMovementFeedItems(items: readonly AirportMovementLike[]): AviationEventFeedItem[] {
  return items.filter((item) => item.movement === "GO_AROUND" || item.movement === "HOLDING").flatMap((item) => {
    const occurredAt = validIso(item.observedAt);
    if (!occurredAt) return [];
    return [{
      id: "airport:" + item.airport + ":" + item.flightId + ":" + item.movement,
      occurredAt,
      source: "AIRPORT_OPERATIONS" as const,
      severity: item.movement === "GO_AROUND" ? "warning" as const : "attention" as const,
      title: item.movement.replaceAll("_", " "),
      subject: subject(item.icaoHex, item.callsign, item.registration),
      context: [item.airport, item.runway ? "RWY " + item.runway.designator : null].filter(Boolean).join(" · ") || null,
      href: "/flights/" + item.flightId,
      provenance: "INFERRED" as const,
    }];
  });
}

export function mergeAviationEventFeed(
  groups: readonly (readonly AviationEventFeedItem[])[],
  limit = 60,
): AviationEventFeedItem[] {
  const unique = new Map<string, AviationEventFeedItem>();
  for (const item of groups.flat()) {
    const previous = unique.get(item.id);
    if (!previous || Date.parse(item.occurredAt) > Date.parse(previous.occurredAt)) unique.set(item.id, item);
  }
  return [...unique.values()]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Math.min(100, limit)));
}
