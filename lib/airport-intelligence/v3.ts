import type { AirportRunway } from "@/lib/airports/infrastructure";
import type { AirportTrafficObservation } from "@/lib/airport-traffic/live";
import { calculateRunwayWind } from "@/lib/airport-runway-wind";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import type { MetarObservation } from "@/lib/weather/types";

export type AirportRunwayWindAlignment = "aligned" | "different" | "unknown";

export interface AirportRunwayIntelligence {
  inferredRunway: string | null;
  inferredShare: number | null;
  inferredCount: number;
  inferredTotal: number;
  confidence: "low" | "medium" | "high" | null;
  windFavoredRunway: string | null;
  windHeadwindKt: number | null;
  windCrosswindKt: number | null;
  alignment: AirportRunwayWindAlignment;
}

export interface AirportOperationsTimelineItem {
  key: string;
  movement: AirportMovement;
}

export interface AirportLiveBoardSnapshot {
  arrivals: AirportMovement[];
  departures: AirportMovement[];
  attention: AirportMovement[];
  runwayUsage: AirportOperationsResponse["runwayUsage"];
}

export const AIRPORT_LIVE_BOARD_LANE_LIMIT = 6;
export const AIRPORT_LIVE_BOARD_RUNWAY_LIMIT = 4;
export const AIRPORT_LIVE_BOARD_ACTIVE_LIMIT = 6;
const TIMELINE_LIMIT = 12;

function runwayDirections(runways: readonly AirportRunway[]): Array<{ ident: string; headingDeg: number }> {
  return runways
    .filter((runway) => runway.closed !== true)
    .flatMap((runway) => [
      runway.leIdent && Number.isFinite(runway.leHeadingDegT)
        ? { ident: runway.leIdent.trim().toUpperCase(), headingDeg: runway.leHeadingDegT as number }
        : null,
      runway.heIdent && Number.isFinite(runway.heHeadingDegT)
        ? { ident: runway.heIdent.trim().toUpperCase(), headingDeg: runway.heHeadingDegT as number }
        : null,
    ])
    .filter((value): value is { ident: string; headingDeg: number } => Boolean(value?.ident));
}

function windFavoredRunway(
  runways: readonly AirportRunway[],
  metar: MetarObservation | null,
): { ident: string; headwindKt: number; crosswindKt: number } | null {
  if (!metar || metar.windCalm || metar.windVariable || metar.windDirectionDeg === null || metar.windSpeedKt === null) return null;
  const candidates = runwayDirections(runways).flatMap((runway) => {
    const component = calculateRunwayWind(runway.headingDeg, metar.windDirectionDeg, metar.windSpeedKt);
    return component ? [{
      ident: runway.ident,
      headwindKt: component.headwindKt,
      crosswindKt: component.crosswindKt,
    }] : [];
  });
  return candidates.sort((left, right) =>
    right.headwindKt - left.headwindKt
    || left.crosswindKt - right.crosswindKt
    || left.ident.localeCompare(right.ident, undefined, { numeric: true }))[0] ?? null;
}

export function buildAirportRunwayIntelligence(
  operations: AirportOperationsResponse | null,
  runways: readonly AirportRunway[],
  metar: MetarObservation | null,
): AirportRunwayIntelligence {
  const usage = operations?.runwayUsage ?? [];
  const total = usage.reduce((sum, item) => sum + Math.max(0, item.total), 0);
  const top = usage[0] ?? null;
  const inferredRunway = operations?.likelyRunway?.designator?.trim().toUpperCase()
    || top?.designator?.trim().toUpperCase()
    || null;
  const inferredCount = inferredRunway
    ? usage.find((item) => item.designator.trim().toUpperCase() === inferredRunway)?.total
      ?? operations?.likelyRunway?.sampleCount
      ?? 0
    : 0;
  const favoredFromRunways = windFavoredRunway(runways, metar);
  const favoredFromOperations = operations?.wind
    .slice()
    .sort((left, right) =>
      right.headwindKt - left.headwindKt
      || left.crosswindKt - right.crosswindKt
      || left.runway.localeCompare(right.runway, undefined, { numeric: true }))[0] ?? null;
  const favored = favoredFromRunways
    ?? (favoredFromOperations ? {
      ident: favoredFromOperations.runway.trim().toUpperCase(),
      headwindKt: favoredFromOperations.headwindKt,
      crosswindKt: favoredFromOperations.crosswindKt,
    } : null);
  const alignment: AirportRunwayWindAlignment = inferredRunway && favored
    ? inferredRunway === favored.ident ? "aligned" : "different"
    : "unknown";

  return {
    inferredRunway,
    inferredShare: total > 0 && inferredCount > 0 ? inferredCount / total : null,
    inferredCount,
    inferredTotal: total,
    confidence: operations?.likelyRunway?.confidence ?? null,
    windFavoredRunway: favored?.ident ?? null,
    windHeadwindKt: favored?.headwindKt ?? null,
    windCrosswindKt: favored?.crosswindKt ?? null,
    alignment,
  };
}

export function buildAirportOperationsTimeline(
  operations: AirportOperationsResponse | null,
  limit = TIMELINE_LIMIT,
): AirportOperationsTimelineItem[] {
  if (!operations) return [];
  const seen = new Set<string>();
  return operations.recentMovements
    .filter((movement) => {
      if (!Number.isFinite(Date.parse(movement.observedAt))) return false;
      const key = `${movement.flightId}:${movement.movement}:${movement.observedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) =>
      Date.parse(right.observedAt) - Date.parse(left.observedAt)
      || right.flightId - left.flightId)
    .slice(0, Math.max(1, limit))
    .map((movement) => ({
      key: `${movement.flightId}:${movement.movement}:${movement.observedAt}`,
      movement,
    }));
}


function newestUniqueMovements(
  movements: readonly AirportMovement[],
  kinds: ReadonlySet<AirportMovement["movement"]>,
  limit: number,
): AirportMovement[] {
  const seenFlights = new Set<number>();
  return movements
    .filter((movement) =>
      kinds.has(movement.movement)
      && Number.isFinite(Date.parse(movement.observedAt)))
    .sort((left, right) =>
      Date.parse(right.observedAt) - Date.parse(left.observedAt)
      || right.flightId - left.flightId)
    .filter((movement) => {
      if (seenFlights.has(movement.flightId)) return false;
      seenFlights.add(movement.flightId);
      return true;
    })
    .slice(0, Math.max(1, limit));
}

export function buildAirportLiveBoardSnapshot(
  operations: AirportOperationsResponse | null,
  laneLimit = AIRPORT_LIVE_BOARD_LANE_LIMIT,
): AirportLiveBoardSnapshot {
  if (!operations) return { arrivals: [], departures: [], attention: [], runwayUsage: [] };
  const limit = Math.max(1, laneLimit);
  return {
    arrivals: newestUniqueMovements(
      operations.recentMovements,
      new Set<AirportMovement["movement"]>(["APPROACH", "LANDING"]),
      limit,
    ),
    departures: newestUniqueMovements(
      operations.recentMovements,
      new Set<AirportMovement["movement"]>(["TAKEOFF", "DEPARTURE"]),
      limit,
    ),
    attention: operations.recentMovements
      .filter((movement) =>
        (movement.movement === "GO_AROUND" || movement.movement === "HOLDING")
        && Number.isFinite(Date.parse(movement.observedAt)))
      .sort((left, right) =>
        Date.parse(right.observedAt) - Date.parse(left.observedAt)
        || right.flightId - left.flightId)
      .slice(0, limit),
    runwayUsage: operations.runwayUsage
      .filter((item) => Number.isFinite(item.total) && item.total > 0)
      .slice()
      .sort((left, right) =>
        right.total - left.total
        || left.designator.localeCompare(right.designator, undefined, { numeric: true }))
      .slice(0, AIRPORT_LIVE_BOARD_RUNWAY_LIMIT),
  };
}


export interface AirportActiveTrafficSnapshot {
  inbound: AirportTrafficObservation[];
  outbound: AirportTrafficObservation[];
}

export type AirportActiveJourneyStage =
  | "INBOUND"
  | "HOLDING"
  | "APPROACH"
  | "FINAL"
  | "LANDED"
  | "GO_AROUND"
  | "INITIAL_CLIMB"
  | "OUTBOUND";

export type AirportJourneyRouteRelation = "CONFIRMED" | "UNKNOWN" | "CONFLICT";

export interface AirportActiveJourney {
  stage: AirportActiveJourneyStage;
  routeRelation: AirportJourneyRouteRelation;
  origin: string | null;
  destination: string | null;
}

export interface AirportCorrelatedTrafficObservation extends AirportTrafficObservation {
  movement: AirportMovement | null;
  movementAgeSeconds: number | null;
  journey: AirportActiveJourney;
}

export interface AirportCorrelatedTrafficSnapshot {
  inbound: AirportCorrelatedTrafficObservation[];
  outbound: AirportCorrelatedTrafficObservation[];
}

export interface AirportJourneyFlowSummary {
  inbound: number;
  outbound: number;
  final: number;
  holding: number;
  goAround: number;
  initialClimb: number;
  correlated: number;
  liveOnly: number;
  routeConfirmed: number;
  routeConflicts: number;
  attention: AirportCorrelatedTrafficObservation[];
}

export const AIRPORT_LIVE_BOARD_ATTENTION_LIMIT = 6;
export const AIRPORT_LIVE_BOARD_FLOW_TREND_WINDOW_MS = 15 * 60_000;
export const AIRPORT_LIVE_BOARD_EXCEPTION_WINDOW_MS = 30 * 60_000;
export const AIRPORT_LIVE_BOARD_RUNWAY_CONSISTENCY_WINDOW_MS = 30 * 60_000;

export type AirportFlowTrend = "RISING" | "STEADY" | "FALLING" | "NO_DATA";
export type AirportFlowPressureLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
export type AirportRunwayFlowConsistency = "STABLE" | "MIXED" | "UNKNOWN";

export interface AirportFlowWindowTrend {
  current: number;
  previous: number;
  delta: number;
  trend: AirportFlowTrend;
}

export interface AirportFlowPressureSummary {
  trendWindowMinutes: 15;
  exceptionWindowMinutes: 30;
  arrivals: AirportFlowWindowTrend;
  departures: AirportFlowWindowTrend;
  holdingRecent: number;
  goAroundRecent: number;
  pressure: {
    level: AirportFlowPressureLevel;
    score: number;
  };
  runway: {
    designator: string | null;
    consistency: AirportRunwayFlowConsistency;
    share: number | null;
    samples: number;
  };
}

export function buildAirportJourneyFlowSummary(
  snapshot: AirportCorrelatedTrafficSnapshot,
  attentionLimit = AIRPORT_LIVE_BOARD_ATTENTION_LIMIT,
): AirportJourneyFlowSummary {
  const all = [...snapshot.inbound, ...snapshot.outbound];
  const stageCount = (stage: AirportActiveJourneyStage) =>
    all.filter((item) => item.journey.stage === stage).length;
  const priority = (item: AirportCorrelatedTrafficObservation): number =>
    item.journey.stage === "GO_AROUND" ? 0
      : item.journey.stage === "HOLDING" ? 1
        : item.journey.routeRelation === "CONFLICT" ? 2
          : 3;

  return {
    inbound: snapshot.inbound.length,
    outbound: snapshot.outbound.length,
    final: stageCount("FINAL"),
    holding: stageCount("HOLDING"),
    goAround: stageCount("GO_AROUND"),
    initialClimb: stageCount("INITIAL_CLIMB"),
    correlated: all.filter((item) => item.movement !== null).length,
    liveOnly: all.filter((item) => item.movement === null).length,
    routeConfirmed: all.filter((item) => item.journey.routeRelation === "CONFIRMED").length,
    routeConflicts: all.filter((item) => item.journey.routeRelation === "CONFLICT").length,
    attention: all
      .filter((item) =>
        item.journey.stage === "GO_AROUND"
        || item.journey.stage === "HOLDING"
        || item.journey.routeRelation === "CONFLICT")
      .slice()
      .sort((left, right) =>
        priority(left) - priority(right)
        || left.distanceKm - right.distanceKm
        || left.aircraft.icaoHex.localeCompare(right.aircraft.icaoHex))
      .slice(0, Math.max(1, attentionLimit)),
  };
}

function uniqueMovementCount(
  movements: readonly AirportMovement[],
  kinds: ReadonlySet<AirportMovement["movement"]>,
  fromMs: number,
  toMs: number,
): number {
  const flights = new Set<number>();
  for (const movement of movements) {
    if (!kinds.has(movement.movement)) continue;
    const observedAt = Date.parse(movement.observedAt);
    if (!Number.isFinite(observedAt) || observedAt < fromMs || observedAt >= toMs) continue;
    flights.add(movement.flightId);
  }
  return flights.size;
}

function flowTrend(current: number, previous: number): AirportFlowWindowTrend {
  const delta = current - previous;
  const trend: AirportFlowTrend = current === 0 && previous === 0
    ? "NO_DATA"
    : delta >= 2
      ? "RISING"
      : delta <= -2
        ? "FALLING"
        : "STEADY";
  return { current, previous, delta, trend };
}

function pressureLevel(score: number): AirportFlowPressureLevel {
  if (score <= 3) return "LOW";
  if (score <= 6) return "MODERATE";
  if (score <= 9) return "ELEVATED";
  return "HIGH";
}

function recentRunwayConsistency(
  movements: readonly AirportMovement[],
  fromMs: number,
  toMs: number,
): AirportFlowPressureSummary["runway"] {
  const runwayRelevant = new Set<AirportMovement["movement"]>([
    "APPROACH",
    "LANDING",
    "TAKEOFF",
    "DEPARTURE",
    "GO_AROUND",
  ]);
  const byFlight = new Map<number, string>();
  for (const movement of movements) {
    if (!runwayRelevant.has(movement.movement) || !movement.runway?.designator) continue;
    const observedAt = Date.parse(movement.observedAt);
    if (!Number.isFinite(observedAt) || observedAt < fromMs || observedAt >= toMs) continue;
    if (!byFlight.has(movement.flightId)) {
      byFlight.set(movement.flightId, movement.runway.designator.trim().toUpperCase());
    }
  }

  const counts = new Map<string, number>();
  for (const designator of byFlight.values()) counts.set(designator, (counts.get(designator) ?? 0) + 1);
  const samples = byFlight.size;
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { numeric: true }))[0] ?? null;
  if (!top) return { designator: null, consistency: "UNKNOWN", share: null, samples: 0 };

  const share = top[1] / samples;
  const consistency: AirportRunwayFlowConsistency = samples < 3
    ? "UNKNOWN"
    : share >= 0.75
      ? "STABLE"
      : "MIXED";
  return { designator: top[0], consistency, share, samples };
}

export function buildAirportFlowPressureSummary(
  flow: AirportJourneyFlowSummary,
  operations: AirportOperationsResponse | null,
): AirportFlowPressureSummary {
  const generatedAt = operations ? Date.parse(operations.generatedAt) : Number.NaN;
  if (!operations || !Number.isFinite(generatedAt)) {
    return {
      trendWindowMinutes: 15,
      exceptionWindowMinutes: 30,
      arrivals: flowTrend(0, 0),
      departures: flowTrend(0, 0),
      holdingRecent: 0,
      goAroundRecent: 0,
      pressure: {
        level: pressureLevel(
          flow.inbound + flow.outbound + flow.final + 2 * flow.holding + 2 * flow.goAround + flow.routeConflicts,
        ),
        score: flow.inbound + flow.outbound + flow.final + 2 * flow.holding + 2 * flow.goAround + flow.routeConflicts,
      },
      runway: { designator: null, consistency: "UNKNOWN", share: null, samples: 0 },
    };
  }

  const currentFrom = generatedAt - AIRPORT_LIVE_BOARD_FLOW_TREND_WINDOW_MS;
  const previousFrom = currentFrom - AIRPORT_LIVE_BOARD_FLOW_TREND_WINDOW_MS;
  const exceptionFrom = generatedAt - AIRPORT_LIVE_BOARD_EXCEPTION_WINDOW_MS;
  const runwayFrom = generatedAt - AIRPORT_LIVE_BOARD_RUNWAY_CONSISTENCY_WINDOW_MS;
  const arrivals = new Set<AirportMovement["movement"]>(["APPROACH", "LANDING"]);
  const departures = new Set<AirportMovement["movement"]>(["TAKEOFF", "DEPARTURE"]);
  const currentArrivals = uniqueMovementCount(operations.recentMovements, arrivals, currentFrom, generatedAt + 1);
  const previousArrivals = uniqueMovementCount(operations.recentMovements, arrivals, previousFrom, currentFrom);
  const currentDepartures = uniqueMovementCount(operations.recentMovements, departures, currentFrom, generatedAt + 1);
  const previousDepartures = uniqueMovementCount(operations.recentMovements, departures, previousFrom, currentFrom);
  const arrivalTrend = flowTrend(currentArrivals, previousArrivals);
  const departureTrend = flowTrend(currentDepartures, previousDepartures);
  const holdingRecent = uniqueMovementCount(
    operations.recentMovements,
    new Set<AirportMovement["movement"]>(["HOLDING"]),
    currentFrom,
    generatedAt + 1,
  );
  const goAroundRecent = uniqueMovementCount(
    operations.recentMovements,
    new Set<AirportMovement["movement"]>(["GO_AROUND"]),
    exceptionFrom,
    generatedAt + 1,
  );

  const score = flow.inbound
    + flow.outbound
    + flow.final
    + 2 * flow.holding
    + 2 * flow.goAround
    + flow.routeConflicts
    + (arrivalTrend.trend === "RISING" ? 1 : 0)
    + (departureTrend.trend === "RISING" ? 1 : 0);

  return {
    trendWindowMinutes: 15,
    exceptionWindowMinutes: 30,
    arrivals: arrivalTrend,
    departures: departureTrend,
    holdingRecent,
    goAroundRecent,
    pressure: { level: pressureLevel(score), score },
    runway: recentRunwayConsistency(operations.recentMovements, runwayFrom, generatedAt + 1),
  };
}

export const AIRPORT_LIVE_BOARD_CORRELATION_MAX_AGE_MS = 20 * 60_000;
export const AIRPORT_LIVE_BOARD_CORRELATION_FUTURE_TOLERANCE_MS = 2 * 60_000;

export const AIRPORT_LIVE_BOARD_FINAL_DISTANCE_KM = 8;
export const AIRPORT_LIVE_BOARD_FINAL_DESCENT_FPM = -150;

function canonicalAirport(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

function routeRelation(
  observation: AirportTrafficObservation,
  airportIcao: string | null,
  movement: AirportMovement | null,
): Pick<AirportActiveJourney, "routeRelation" | "origin" | "destination"> {
  const route = observation.aircraft.enrichment?.route;
  const origin = canonicalAirport(route?.origin);
  const destination = canonicalAirport(route?.destination);
  if (!airportIcao) return { routeRelation: "UNKNOWN", origin, destination };

  const relevant = movement?.movement === "LANDING" ? destination
    : observation.classification === "approaching" ? destination
      : observation.classification === "departing" ? origin
        : null;
  return {
    routeRelation: relevant === null ? "UNKNOWN" : relevant === airportIcao ? "CONFIRMED" : "CONFLICT",
    origin,
    destination,
  };
}

function journeyStage(
  observation: AirportTrafficObservation,
  movement: AirportMovement | null,
): AirportActiveJourneyStage {
  if (movement?.movement === "LANDING" && observation.aircraft.onGround) return "LANDED";
  if (observation.classification === "approaching") {
    if (movement?.movement === "HOLDING") return "HOLDING";
    if (movement?.movement === "APPROACH") {
      const verticalRate = observation.aircraft.verticalRate;
      const descending = typeof verticalRate === "number"
        && Number.isFinite(verticalRate)
        && verticalRate <= AIRPORT_LIVE_BOARD_FINAL_DESCENT_FPM;
      return observation.distanceKm <= AIRPORT_LIVE_BOARD_FINAL_DISTANCE_KM && descending
        ? "FINAL"
        : "APPROACH";
    }
    return "INBOUND";
  }

  if (movement?.movement === "GO_AROUND") return "GO_AROUND";
  if (movement?.movement === "TAKEOFF") return "INITIAL_CLIMB";
  return "OUTBOUND";
}

function activeJourney(
  observation: AirportTrafficObservation,
  movement: AirportMovement | null,
  airportIcao: string | null,
): AirportActiveJourney {
  return {
    stage: journeyStage(observation, movement),
    ...routeRelation(observation, airportIcao, movement),
  };
}

function normalizedIdentity(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return normalized || null;
}

function compatibleMovement(
  observation: AirportTrafficObservation,
  movement: AirportMovement["movement"],
): boolean {
  if (observation.aircraft.onGround && movement === "LANDING") return true;
  const classification = observation.classification;
  if (classification === "approaching") {
    return movement === "APPROACH" || movement === "HOLDING";
  }
  if (classification === "departing") {
    return movement === "TAKEOFF" || movement === "DEPARTURE" || movement === "GO_AROUND";
  }
  return false;
}

function correlatedMovement(
  observation: AirportTrafficObservation,
  operations: AirportOperationsResponse | null,
): { movement: AirportMovement; ageSeconds: number } | null {
  if (!operations) return null;
  const liveAt = Date.parse(observation.aircraft.lastSeen);
  if (!Number.isFinite(liveAt)) return null;
  const liveCallsign = normalizedIdentity(observation.aircraft.callsign);

  const candidates = operations.recentMovements
    .filter((movement) => {
      if (!compatibleMovement(observation, movement.movement)) return false;
      if (movement.icaoHex.trim().toUpperCase() !== observation.aircraft.icaoHex.trim().toUpperCase()) return false;
      const movementCallsign = normalizedIdentity(movement.callsign);
      if (liveCallsign && movementCallsign && liveCallsign !== movementCallsign) return false;
      const observedAt = Date.parse(movement.observedAt);
      if (!Number.isFinite(observedAt)) return false;
      const ageMs = liveAt - observedAt;
      return ageMs >= -AIRPORT_LIVE_BOARD_CORRELATION_FUTURE_TOLERANCE_MS
        && ageMs <= AIRPORT_LIVE_BOARD_CORRELATION_MAX_AGE_MS;
    })
    .sort((left, right) =>
      Date.parse(right.observedAt) - Date.parse(left.observedAt)
      || right.flightId - left.flightId);

  const movement = candidates[0] ?? null;
  if (!movement) return null;
  return {
    movement,
    ageSeconds: Math.max(0, Math.round((liveAt - Date.parse(movement.observedAt)) / 1_000)),
  };
}

export function buildAirportCorrelatedTrafficSnapshot(
  observations: readonly AirportTrafficObservation[],
  operations: AirportOperationsResponse | null,
  limit = AIRPORT_LIVE_BOARD_ACTIVE_LIMIT,
): AirportCorrelatedTrafficSnapshot {
  const active = buildAirportActiveTrafficSnapshot(observations, limit);
  const airportIcao = canonicalAirport(operations?.airport.icao);
  const correlate = (items: AirportTrafficObservation[]): AirportCorrelatedTrafficObservation[] =>
    items.map((observation) => {
      const match = correlatedMovement(observation, operations);
      const movement = match?.movement ?? null;
      return {
        ...observation,
        movement,
        movementAgeSeconds: match?.ageSeconds ?? null,
        journey: activeJourney(observation, movement, airportIcao),
      };
    });

  const inbound = correlate(active.inbound);
  const inboundHexes = new Set(inbound.map((item) => item.aircraft.icaoHex.toUpperCase()));
  const landed = observations
    .filter((observation) => observation.aircraft.onGround && !inboundHexes.has(observation.aircraft.icaoHex.toUpperCase()))
    .flatMap((observation) => {
      const match = correlatedMovement(observation, operations);
      if (match?.movement.movement !== "LANDING") return [];
      return [{
        ...observation,
        movement: match.movement,
        movementAgeSeconds: match.ageSeconds,
        journey: activeJourney(observation, match.movement, airportIcao),
      } satisfies AirportCorrelatedTrafficObservation];
    });

  return {
    inbound: [...inbound, ...landed]
      .sort((left, right) =>
        left.distanceKm - right.distanceKm
        || left.aircraft.icaoHex.localeCompare(right.aircraft.icaoHex))
      .slice(0, Math.max(1, limit)),
    outbound: correlate(active.outbound),
  };
}

export function buildAirportActiveTrafficSnapshot(
  observations: readonly AirportTrafficObservation[],
  limit = AIRPORT_LIVE_BOARD_ACTIVE_LIMIT,
): AirportActiveTrafficSnapshot {
  const bounded = Math.max(1, limit);
  const ordered = observations
    .filter((item) => Number.isFinite(item.distanceKm))
    .slice()
    .sort((left, right) =>
      left.distanceKm - right.distanceKm
      || left.aircraft.icaoHex.localeCompare(right.aircraft.icaoHex));

  return {
    inbound: ordered.filter((item) => !item.aircraft.onGround && item.classification === "approaching").slice(0, bounded),
    outbound: ordered.filter((item) => !item.aircraft.onGround && item.classification === "departing").slice(0, bounded),
  };
}
