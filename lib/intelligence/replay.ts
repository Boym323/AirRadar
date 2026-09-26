import type { Aircraft, FlightRoute } from "@/lib/aircraft/types";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import type { Airport } from "@/lib/airports/types";
import type { HistoryFlightDetail } from "@/lib/server/history";
import { FlightIntelligenceDetector } from "@/lib/intelligence/detector";
import type { FlightEventType, FlightIntelligenceEvent } from "@/lib/intelligence/types";

export const REPLAY_COMPARABLE_EVENT_TYPES = new Set<FlightEventType>([
  "APPROACH",
  "GO_AROUND",
  "HOLDING",
  "DIVERSION",
  "TOP_OF_DESCENT",
]);

export interface FlightIntelligenceReplayOptions {
  airports?: readonly Airport[];
  runwaysByAirport?: ReadonlyMap<string, readonly AirportRunway[]>;
  timingToleranceMs?: number;
}

export interface FlightIntelligenceReplayMatch {
  type: FlightEventType;
  replayedAt: string;
  persistedAt: string;
  deltaMs: number;
}

export interface FlightIntelligenceReplayReport {
  flightId: number;
  icaoHex: string;
  positions: number;
  inputQuality: {
    level: "partial";
    missingSignals: string[];
    comparableEventTypes: FlightEventType[];
  };
  replayedEvents: FlightIntelligenceEvent[];
  persistedComparableEvents: Array<{ type: FlightEventType; occurredAt: string }>;
  unsupportedPersistedEvents: Array<{ type: string; occurredAt: string }>;
  matches: FlightIntelligenceReplayMatch[];
  falsePositives: Array<{ type: FlightEventType; occurredAt: string }>;
  falseNegatives: Array<{ type: FlightEventType; occurredAt: string }>;
  metrics: {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number | null;
    recall: number | null;
  };
}

function routeForFlight(detail: HistoryFlightDetail, airports: readonly Airport[]): FlightRoute | undefined {
  const find = (code: string | null) => {
    if (!code) return null;
    const normalized = code.trim().toUpperCase();
    return airports.find((airport) => airport.icaoCode === normalized || airport.iataCode === normalized) ?? null;
  };
  if (!detail.flight.origin && !detail.flight.destination) return undefined;
  return {
    callsign: detail.flight.callsign ?? "",
    airline: detail.flight.airline,
    airlineIcao: null,
    airlineIata: null,
    origin: detail.flight.origin,
    destination: detail.flight.destination,
    originAirport: find(detail.flight.origin),
    destinationAirport: find(detail.flight.destination),
    source: "history-replay",
  };
}

function aircraftFromPosition(
  detail: HistoryFlightDetail,
  position: HistoryFlightDetail["positions"][number],
  route: FlightRoute | undefined,
): Aircraft {
  return {
    icaoHex: detail.flight.icaoHex,
    callsign: detail.flight.callsign,
    registration: detail.flight.registration,
    aircraftType: detail.flight.aircraftType,
    aircraftDescription: null,
    lat: position.lat,
    lon: position.lon,
    altitude: position.altitude,
    baroAltitude: position.altitude,
    geomAltitude: null,
    groundSpeed: position.groundSpeed,
    track: position.track,
    verticalRate: position.verticalRate,
    baroRate: position.verticalRate,
    geomRate: null,
    squawk: null,
    category: null,
    emergency: null,
    rssi: null,
    messages: null,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: position.recordedAt,
    source: "ADS-B",
    origin: "local",
    sourceType: "history-replay",
    // FlightPosition does not persist this signal today. False is a neutral
    // detector input; ground-dependent event types are excluded from scoring.
    onGround: false,
    distanceKm: null,
    bearing: null,
    trail: [],
    ...(route ? { enrichment: { route } } : {}),
  };
}

function isComparableEventType(value: string): value is FlightEventType {
  return REPLAY_COMPARABLE_EVENT_TYPES.has(value as FlightEventType);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}

export function replayFlightIntelligence(
  detail: HistoryFlightDetail,
  options: FlightIntelligenceReplayOptions = {},
): FlightIntelligenceReplayReport {
  const airports = options.airports ?? [];
  const detector = new FlightIntelligenceDetector(airports, options.runwaysByAirport);
  const route = routeForFlight(detail, airports);
  const replayedEvents: FlightIntelligenceEvent[] = [];

  for (const position of [...detail.positions].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))) {
    const aircraft = aircraftFromPosition(detail, position, route);
    replayedEvents.push(...detector.observe(undefined, aircraft, Date.parse(position.recordedAt)));
  }

  const replayedComparable = replayedEvents
    .filter((event) => REPLAY_COMPARABLE_EVENT_TYPES.has(event.type))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const persistedComparableEvents = detail.events
    .filter((event): event is typeof event & { type: FlightEventType } => isComparableEventType(event.type))
    .map((event) => ({ type: event.type, occurredAt: event.occurredAt }))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const unsupportedPersistedEvents = detail.events
    .filter((event) => !isComparableEventType(event.type))
    .map((event) => ({ type: event.type, occurredAt: event.occurredAt }));

  const toleranceMs = Math.max(0, Math.trunc(options.timingToleranceMs ?? 120_000));
  const unmatchedPersisted = new Set(persistedComparableEvents.map((_, index) => index));
  const matches: FlightIntelligenceReplayMatch[] = [];
  const falsePositives: Array<{ type: FlightEventType; occurredAt: string }> = [];

  for (const replayed of replayedComparable) {
    const replayedAt = Date.parse(replayed.occurredAt);
    let bestIndex: number | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const index of unmatchedPersisted) {
      const persisted = persistedComparableEvents[index]!;
      if (persisted.type !== replayed.type) continue;
      const delta = Math.abs(Date.parse(persisted.occurredAt) - replayedAt);
      if (delta <= toleranceMs && delta < bestDelta) {
        bestIndex = index;
        bestDelta = delta;
      }
    }
    if (bestIndex === null) {
      falsePositives.push({ type: replayed.type, occurredAt: replayed.occurredAt });
      continue;
    }
    const persisted = persistedComparableEvents[bestIndex]!;
    unmatchedPersisted.delete(bestIndex);
    matches.push({
      type: replayed.type,
      replayedAt: replayed.occurredAt,
      persistedAt: persisted.occurredAt,
      deltaMs: bestDelta,
    });
  }

  const falseNegatives = [...unmatchedPersisted].map((index) => persistedComparableEvents[index]!);
  const truePositives = matches.length;

  return {
    flightId: detail.flight.id,
    icaoHex: detail.flight.icaoHex,
    positions: detail.positions.length,
    inputQuality: {
      level: "partial",
      missingSignals: [
        "FlightPosition.onGround",
        "FlightPosition.atcAssignment",
        "FlightPosition.flightPlan",
        "FlightPosition.runwayContext",
        ...(detail.truncated ? ["HistoryFlightDetail.positionsTruncated"] : []),
      ],
      comparableEventTypes: [...REPLAY_COMPARABLE_EVENT_TYPES],
    },
    replayedEvents,
    persistedComparableEvents,
    unsupportedPersistedEvents,
    matches,
    falsePositives,
    falseNegatives,
    metrics: {
      truePositives,
      falsePositives: falsePositives.length,
      falseNegatives: falseNegatives.length,
      precision: ratio(truePositives, truePositives + falsePositives.length),
      recall: ratio(truePositives, truePositives + falseNegatives.length),
    },
  };
}
