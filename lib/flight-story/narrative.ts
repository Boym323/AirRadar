import type { FlightStoryEvent, HistoryFlightDetail } from "@/lib/server/history";

export type FlightStoryProvenance = "observed" | "inferred";
export type FlightStoryBoundaryKind = "first_seen" | "last_seen";

export interface FlightStoryNarrativeTelemetry {
  altitude: number | null;
  groundSpeed: number | null;
  verticalRate: number | null;
  track: number | null;
}

export interface FlightStoryNarrativeItem {
  key: string;
  kind: "boundary" | "event";
  boundary: FlightStoryBoundaryKind | null;
  eventId: number | null;
  type: string | null;
  occurredAt: string;
  provenance: FlightStoryProvenance;
  confidenceLevel: "low" | "medium" | "high" | null;
  airportIcao: string | null;
  runway: string | null;
  sectorId: string | null;
  telemetry: FlightStoryNarrativeTelemetry;
}

export interface FlightStoryV2Summary {
  observedStartAt: string;
  observedEndAt: string;
  observedDurationMs: number;
  sampledPathDistanceKm: number | null;
  maxGroundSpeedKt: number | null;
  positionCount: number;
  sampled: boolean;
  eventCount: number;
  attentionEventCount: number;
  badges: string[];
}

const ATTENTION_EVENT_PRIORITY: Record<string, number> = {
  GO_AROUND: 100,
  DIVERSION: 95,
  HOLDING: 90,
  UNUSUAL_TURN: 80,
  ORBIT: 75,
};

const BADGE_LIMIT = 4;
const NEAREST_TELEMETRY_TOLERANCE_MS = 120_000;
const EARTH_RADIUS_KM = 6371.0088;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function confidenceLevel(value: number): FlightStoryNarrativeItem["confidenceLevel"] {
  if (!Number.isFinite(value)) return null;
  return value >= 0.8 ? "high" : value >= 0.6 ? "medium" : "low";
}

function flightStart(detail: HistoryFlightDetail): string {
  return detail.positions[0]?.recordedAt ?? detail.flight.startTime;
}

function flightEnd(detail: HistoryFlightDetail): string {
  return detail.positions.at(-1)?.recordedAt ?? detail.flight.endTime ?? detail.flight.lastSeenAt;
}

function nearestTelemetry(
  positions: HistoryFlightDetail["positions"],
  occurredAt: string,
  eventAltitude: number | null,
): FlightStoryNarrativeTelemetry {
  const target = Date.parse(occurredAt);
  let nearest: HistoryFlightDetail["positions"][number] | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  if (Number.isFinite(target)) {
    for (const position of positions) {
      const candidateTime = Date.parse(position.recordedAt);
      if (!Number.isFinite(candidateTime)) continue;
      const distance = Math.abs(candidateTime - target);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = position;
      }
    }
  }

  if (!nearest || nearestDistance > NEAREST_TELEMETRY_TOLERANCE_MS) {
    return {
      altitude: finiteOrNull(eventAltitude),
      groundSpeed: null,
      verticalRate: null,
      track: null,
    };
  }

  return {
    altitude: finiteOrNull(eventAltitude) ?? finiteOrNull(nearest.altitude),
    groundSpeed: finiteOrNull(nearest.groundSpeed),
    verticalRate: finiteOrNull(nearest.verticalRate),
    track: finiteOrNull(nearest.track),
  };
}

function boundaryTelemetry(
  position: HistoryFlightDetail["positions"][number] | undefined,
): FlightStoryNarrativeTelemetry {
  return {
    altitude: finiteOrNull(position?.altitude),
    groundSpeed: finiteOrNull(position?.groundSpeed),
    verticalRate: finiteOrNull(position?.verticalRate),
    track: finiteOrNull(position?.track),
  };
}

function radians(value: number): number {
  return value * Math.PI / 180;
}

function segmentDistanceKm(
  left: HistoryFlightDetail["positions"][number],
  right: HistoryFlightDetail["positions"][number],
): number {
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const dLat = lat2 - lat1;
  const dLon = radians(right.lon - left.lon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function sampledPathDistanceKm(positions: HistoryFlightDetail["positions"]): number | null {
  if (positions.length < 2) return null;
  let total = 0;
  for (let index = 1; index < positions.length; index += 1) {
    total += segmentDistanceKm(positions[index - 1]!, positions[index]!);
  }
  return Number.isFinite(total) ? total : null;
}

function eventBadgeTypes(events: FlightStoryEvent[]): string[] {
  const seen = new Set<string>();
  return events
    .map((event) => event.type.trim().toUpperCase())
    .filter((type) => ATTENTION_EVENT_PRIORITY[type] !== undefined)
    .sort((left, right) => ATTENTION_EVENT_PRIORITY[right]! - ATTENTION_EVENT_PRIORITY[left]!)
    .filter((type) => {
      if (seen.has(type)) return false;
      seen.add(type);
      return true;
    })
    .slice(0, BADGE_LIMIT);
}

export function buildFlightStoryV2Summary(detail: HistoryFlightDetail): FlightStoryV2Summary {
  const observedStartAt = flightStart(detail);
  const observedEndAt = flightEnd(detail);
  const start = Date.parse(observedStartAt);
  const end = Date.parse(observedEndAt);
  const maxGroundSpeedKt = detail.positions.reduce<number | null>((maximum, position) => {
    const speed = finiteOrNull(position.groundSpeed);
    if (speed === null) return maximum;
    return maximum === null ? speed : Math.max(maximum, speed);
  }, null);
  const badges = eventBadgeTypes(detail.events);

  return {
    observedStartAt,
    observedEndAt,
    observedDurationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0,
    sampledPathDistanceKm: sampledPathDistanceKm(detail.positions),
    maxGroundSpeedKt,
    positionCount: detail.positions.length,
    sampled: detail.positionSampling.sampled,
    eventCount: detail.events.length,
    attentionEventCount: detail.events.filter((event) => ATTENTION_EVENT_PRIORITY[event.type.trim().toUpperCase()] !== undefined).length,
    badges,
  };
}

export function buildFlightStoryNarrative(detail: HistoryFlightDetail): FlightStoryNarrativeItem[] {
  const startAt = flightStart(detail);
  const endAt = flightEnd(detail);
  const items: FlightStoryNarrativeItem[] = [{
    key: "boundary:first-seen",
    kind: "boundary",
    boundary: "first_seen",
    eventId: null,
    type: null,
    occurredAt: startAt,
    provenance: "observed",
    confidenceLevel: null,
    airportIcao: null,
    runway: null,
    sectorId: null,
    telemetry: boundaryTelemetry(detail.positions[0]),
  }];

  for (const event of detail.events) {
    if (!Number.isFinite(Date.parse(event.occurredAt))) continue;
    items.push({
      key: `event:${event.id}`,
      kind: "event",
      boundary: null,
      eventId: event.id,
      type: event.type.trim().toUpperCase(),
      occurredAt: event.occurredAt,
      provenance: "inferred",
      confidenceLevel: confidenceLevel(event.confidence),
      airportIcao: event.airportIcao?.trim().toUpperCase() || null,
      runway: event.runway?.trim().toUpperCase() || null,
      sectorId: event.sectorId?.trim() || null,
      telemetry: nearestTelemetry(detail.positions, event.occurredAt, event.altitude),
    });
  }

  items.push({
    key: "boundary:last-seen",
    kind: "boundary",
    boundary: "last_seen",
    eventId: null,
    type: null,
    occurredAt: endAt,
    provenance: "observed",
    confidenceLevel: null,
    airportIcao: null,
    runway: null,
    sectorId: null,
    telemetry: boundaryTelemetry(detail.positions.at(-1)),
  });

  return items.sort((left, right) => {
    const time = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (time !== 0) return time;
    if (left.boundary === "first_seen") return -1;
    if (right.boundary === "first_seen") return 1;
    if (left.boundary === "last_seen") return 1;
    if (right.boundary === "last_seen") return -1;
    return left.key.localeCompare(right.key);
  });
}
