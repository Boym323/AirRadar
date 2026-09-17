import "temporal-polyfill/full/global";
import type { FlightPlan } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import type { AirportInfrastructure, AirportRunway } from "@/lib/airports/infrastructure";
import { haversineDistanceKm } from "@/lib/geo";
import { resolveArrivalRunwayContext, resolveDepartureRunwayContext } from "@/lib/route-intelligence/runway-context";
import type { RunwayContext } from "@/lib/route-intelligence/contracts";
import { getPrisma } from "@/lib/server/db";
import { getAppTimezone } from "@/lib/server/config";

export type AirportMovementKind = "APPROACH" | "LANDING" | "TAKEOFF" | "DEPARTURE" | "OVERFLIGHT";
export type MovementConfidence = "high" | "medium" | "low";
export type AirportMovementPeriod = "today" | "24h" | "7d";

export interface MovementPosition {
  recordedAt: string | Date;
  lat: number;
  lon: number;
  altitude: number | null;
  groundSpeed: number | null;
  track: number | null;
  verticalRate: number | null;
}

export interface MovementFlight {
  id: number;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  positions: MovementPosition[];
  /** Optional on-demand provider enrichment; absent for sampled history. */
  flightPlan?: FlightPlan | null;
}

export interface ProbableRunway {
  designator: string;
  status: "probable" | "reported";
  confidence: MovementConfidence;
}

export interface AirportMovement {
  flightId: number;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  movement: AirportMovementKind;
  confidence: MovementConfidence;
  airport: string;
  runway: ProbableRunway | null;
  /** Runway evidence is retained separately from the legacy display runway. */
  runwayContext?: RunwayContext;
  observedAt: string;
  evidence: string[];
}

export interface AirportMovementsResponse {
  airport: { icao: string; name: string };
  period: AirportMovementPeriod;
  generatedAt: string;
  complete: boolean;
  truncated: boolean;
  movements: AirportMovement[];
  summary: {
    approaches: number;
    landings: number;
    takeoffs: number;
    departures: number;
    overflights: number;
    runwayRelevantMovements: number;
    probableRunwayMovements: number;
    unknownRunwayMovements: number;
    probableRunways: Array<{ designator: string; count: number }>;
  };
  diagnostics: {
    flightsExamined: number;
    positionsExamined: number;
    queryDurationMs: number;
  };
}

interface MovementAirport {
  icaoCode: string;
  latitude: number;
  longitude: number;
  elevationFt?: number | null;
}

interface CandidateFlightRow {
  id: number;
  callsign: string | null;
  registration: string | null;
  aircraft: { icaoHex: string; registration: string | null };
}

interface CandidatePositionRow extends MovementPosition {
  id?: number;
  flightId: number;
}

interface QueryCollection<T> {
  where(filter: unknown): QueryCollection<T>;
  include(relation: string, callback: (query: QueryCollection<unknown>) => QueryCollection<unknown>): QueryCollection<T>;
  select?(...fields: string[]): QueryCollection<T>;
  orderBy(order: unknown): QueryCollection<T>;
  limit(value: number): QueryCollection<T>;
  all(): Promise<T[]>;
}

interface MovementDatabase {
  orm: { public: { Flight: QueryCollection<CandidateFlightRow>; FlightPosition: QueryCollection<CandidatePositionRow> } };
}

const FLIGHT_LIMIT = 250;
const POSITION_QUERY_LIMIT = 50_000;
const POSITION_PER_FLIGHT_LIMIT = 240;
const MOVEMENT_ENVELOPE_KM = 45;
const AIRPORT_RADIUS_KM = 22;
const THRESHOLD_RADIUS_KM = 8;

let lastDiagnostics = {
  enabled: true,
  lastQueryDurationMs: null as number | null,
  flightsExamined: 0,
  positionsExamined: 0,
  truncated: false,
};

export class AirportMovementsDatabaseUnavailableError extends Error {
  constructor() {
    super("Airport movement data unavailable");
    this.name = "AirportMovementsDatabaseUnavailableError";
  }
}

function timestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function isoTimestamp(value: string | Date): string {
  const time = timestamp(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(0).toISOString();
}

function normalizedPeriod(value: string | null | undefined): AirportMovementPeriod {
  return value === "today" || value === "7d" ? value : "24h";
}

function periodStart(period: AirportMovementPeriod, now: Date): Date {
  if (period === "today") {
    const zoned = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(getAppTimezone()).startOfDay();
    return new Date(zoned.toInstant().epochMilliseconds);
  }
  const duration = period === "7d" ? 7 : 1;
  return new Date(now.getTime() - duration * 24 * 60 * 60_000);
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPosition(value: MovementPosition): boolean {
  return finite(value.lat) && value.lat >= -90 && value.lat <= 90 && finite(value.lon) && value.lon >= -180 && value.lon <= 180
    && Number.isFinite(timestamp(value.recordedAt));
}

function distanceToAirport(position: MovementPosition, airport: MovementAirport): number {
  return haversineDistanceKm(position.lat, position.lon, airport.latitude, airport.longitude);
}

function relativeAltitude(position: MovementPosition, airport: MovementAirport): number | null {
  return finite(position.altitude) ? position.altitude - (airport.elevationFt ?? 0) : null;
}

/** Deterministic, explainable classifier. It describes receiver observations, not official airport movements. */
export function analyzeAirportMovement(
  flight: MovementFlight,
  airport: MovementAirport,
  runways: readonly AirportRunway[] = [],
): AirportMovement | null {
  const positions = flight.positions.filter(validPosition).sort((a, b) => timestamp(a.recordedAt) - timestamp(b.recordedAt));
  if (positions.length < 3) return null;
  const distances = positions.map((position) => distanceToAirport(position, airport));
  const minDistance = Math.min(...distances);
  const minIndex = distances.indexOf(minDistance);
  const first = positions[0];
  const last = positions.at(-1)!;
  const firstDistance = distances[0];
  const lastDistance = distances.at(-1)!;
  const altitudeValues = positions.map((position) => relativeAltitude(position, airport)).filter(finite);
  const firstAltitude = relativeAltitude(first, airport);
  const lastAltitude = relativeAltitude(last, airport);
  const altitudeDelta = altitudeValues.length >= 2 ? altitudeValues.at(-1)! - altitudeValues[0] : null;
  const descending = (altitudeDelta !== null && altitudeDelta <= -300) || positions.filter((position) => finite(position.verticalRate) && position.verticalRate < -200).length >= 2;
  const climbing = (altitudeDelta !== null && altitudeDelta >= 300) || positions.filter((position) => finite(position.verticalRate) && position.verticalRate > 200).length >= 2;
  const lowAtStart = firstAltitude !== null && firstAltitude <= 1_500;
  const lowAtEnd = lastAltitude !== null && lastAltitude <= 1_500;
  const speedDelta = finite(first.groundSpeed) && finite(last.groundSpeed) ? last.groundSpeed - first.groundSpeed : null;
  const approaching = minDistance <= AIRPORT_RADIUS_KM && firstDistance - minDistance >= 1.5 && descending && (lastAltitude === null || lastAltitude <= 8_000);
  const landing = approaching && minDistance <= THRESHOLD_RADIUS_KM && lowAtEnd && (speedDelta === null || speedDelta <= 20 || (finite(last.groundSpeed) && last.groundSpeed <= 100));
  const takeoff = firstDistance <= THRESHOLD_RADIUS_KM && lowAtStart && climbing && lastDistance - firstDistance >= 1.5 && (speedDelta === null || speedDelta >= -20);
  const departure = !takeoff && firstDistance <= AIRPORT_RADIUS_KM && climbing && lastDistance - firstDistance >= 2;
  const overflight = minDistance <= AIRPORT_RADIUS_KM && firstDistance - minDistance >= 1.5 && lastDistance - minDistance >= 1.5
    && (lastAltitude === null || lastAltitude >= 3_000) && !descending && !climbing;

  let movement: AirportMovementKind;
  let evidence: string[];
  let confidence: MovementConfidence;
  if (landing) {
    movement = "LANDING";
    evidence = ["approach distance decreased", "sustained descent", "low altitude near airport", "speed reduced or remained low"];
    confidence = "high";
  } else if (approaching) {
    movement = "APPROACH";
    evidence = ["airport distance decreased", "descending trend", "track remained in the airport vicinity"];
    confidence = minDistance <= 8 ? "high" : "medium";
  } else if (takeoff) {
    movement = "TAKEOFF";
    evidence = ["initial position near airport", "low initial altitude", "climb and outward movement"];
    confidence = "high";
  } else if (departure) {
    movement = "DEPARTURE";
    evidence = ["aircraft acquired near airport", "climb and outward movement", "first observed point may be after liftoff"];
    confidence = "medium";
  } else if (overflight) {
    movement = "OVERFLIGHT";
    evidence = ["distance decreased then increased", "altitude remained incompatible with landing", "no sustained airport descent"];
    confidence = "high";
  } else {
    return null;
  }
  const runwayContext = movement === "OVERFLIGHT"
    ? resolveArrivalRunwayContext({ positions, airport, runways: [] })
    : movement === "TAKEOFF" || movement === "DEPARTURE"
      ? resolveDepartureRunwayContext({ positions, airport, runways, flightPlan: flight.flightPlan, inferredConfidence: confidence === "high" ? "MEDIUM" : "LOW" })
      : resolveArrivalRunwayContext({ positions, airport, runways, flightPlan: flight.flightPlan, inferredConfidence: confidence === "high" ? "MEDIUM" : "LOW" });
  const runway = runwayContext.effectiveRunway
    ? { designator: runwayContext.effectiveRunway, status: runwayContext.status === "REPORTED" ? "reported" as const : "probable" as const, confidence }
    : null;
  if (runwayContext.inferredRunway) evidence = [...evidence, `track and threshold geometry favor runway ${runwayContext.inferredRunway}`];
  if (runwayContext.reportedRunway) evidence = [...evidence, `provider reported runway ${runwayContext.reportedRunway}`];
  if (movement === "APPROACH" && minIndex < positions.length - 1 && lastDistance > minDistance + 2) evidence = [...evidence, "trajectory moved away before touchdown was observed"];
  return {
    flightId: flight.id,
    icaoHex: flight.icaoHex.trim().toUpperCase(),
    callsign: flight.callsign?.trim() || null,
    registration: flight.registration?.trim() || null,
    movement,
    confidence,
    airport: airport.icaoCode.trim().toUpperCase(),
    runway,
    runwayContext,
    observedAt: isoTimestamp(last.recordedAt),
    evidence,
  };
}

function envelope(airport: MovementAirport): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const latitudeDelta = MOVEMENT_ENVELOPE_KM / 111.32;
  const longitudeDelta = MOVEMENT_ENVELOPE_KM / Math.max(1, 111.32 * Math.cos(airport.latitude * Math.PI / 180));
  return {
    minLat: Math.max(-90, airport.latitude - latitudeDelta),
    maxLat: Math.min(90, airport.latitude + latitudeDelta),
    minLon: Math.max(-180, airport.longitude - longitudeDelta),
    maxLon: Math.min(180, airport.longitude + longitudeDelta),
  };
}

function emptySummary() {
  return {
    approaches: 0,
    landings: 0,
    takeoffs: 0,
    departures: 0,
    overflights: 0,
    runwayRelevantMovements: 0,
    probableRunwayMovements: 0,
    unknownRunwayMovements: 0,
    probableRunways: [] as Array<{ designator: string; count: number }>,
  };
}

export function summarizeAirportMovements(movements: readonly AirportMovement[]): AirportMovementsResponse["summary"] {
  const summary = emptySummary();
  const runways = new Map<string, number>();
  for (const movement of movements) {
    if (movement.movement === "APPROACH") summary.approaches += 1;
    if (movement.movement === "LANDING") summary.landings += 1;
    if (movement.movement === "TAKEOFF") summary.takeoffs += 1;
    if (movement.movement === "DEPARTURE") summary.departures += 1;
    if (movement.movement === "OVERFLIGHT") summary.overflights += 1;
    if (movement.movement !== "OVERFLIGHT") summary.runwayRelevantMovements += 1;
    if (movement.movement !== "OVERFLIGHT" && movement.runway) {
      summary.probableRunwayMovements += 1;
      runways.set(movement.runway.designator, (runways.get(movement.runway.designator) ?? 0) + 1);
    }
  }
  summary.unknownRunwayMovements = summary.runwayRelevantMovements - summary.probableRunwayMovements;
  summary.probableRunways = [...runways.entries()]
    .map(([designator, count]) => ({ designator, count }))
    .sort((a, b) => b.count - a.count || a.designator.localeCompare(b.designator, undefined, { numeric: true }));
  return summary;
}

export function getAirportMovementDiagnostics() {
  return { ...lastDiagnostics };
}

export async function getAirportMovements(
  airport: Airport,
  infrastructure: AirportInfrastructure,
  options: { period?: string | null; now?: Date } = {},
): Promise<AirportMovementsResponse> {
  const database = getPrisma() as unknown as MovementDatabase | null;
  if (!database) throw new AirportMovementsDatabaseUnavailableError();
  const started = Date.now();
  const period = normalizedPeriod(options.period);
  const now = options.now ?? new Date();
  const from = periodStart(period, now);
  const bounds = envelope(airport);
  const fromInstant = Temporal.Instant.fromEpochMilliseconds(from.getTime());
  const toInstant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
  let truncated = false;
  try {
    const schema = database.orm.public;
    const positions = await schema.FlightPosition
      .where((position: { recordedAt: { gte(value: unknown): unknown; lt(value: unknown): unknown } }) => position.recordedAt.gte(fromInstant))
      .where((position: { recordedAt: { lt(value: unknown): unknown } }) => position.recordedAt.lt(toInstant))
      .where((position: { lat: { gte(value: number): unknown } }) => position.lat.gte(bounds.minLat))
      .where((position: { lat: { lte(value: number): unknown } }) => position.lat.lte(bounds.maxLat))
      .where((position: { lon: { gte(value: number): unknown } }) => position.lon.gte(bounds.minLon))
      .where((position: { lon: { lte(value: number): unknown } }) => position.lon.lte(bounds.maxLon))
      .orderBy([
        (position: { recordedAt: { desc(): unknown } }) => position.recordedAt.desc(),
        (position: { flightId: { desc(): unknown } }) => position.flightId.desc(),
      ])
      .limit(POSITION_QUERY_LIMIT + 1)
      .all();
    truncated ||= positions.length > POSITION_QUERY_LIMIT;
    const relevantFlightIds = [...new Set(positions.slice(0, POSITION_QUERY_LIMIT).map((position) => position.flightId))];
    truncated ||= relevantFlightIds.length > FLIGHT_LIMIT;
    const flightIds = relevantFlightIds.slice(0, FLIGHT_LIMIT);
    const flights = flightIds.length === 0 ? [] : await schema.Flight
      .where((flight: { id: { in(values: number[]): unknown } }) => flight.id.in(flightIds))
      .orderBy([
        (flight: { startTime: { desc(): unknown } }) => flight.startTime.desc(),
        (flight: { id: { desc(): unknown } }) => flight.id.desc(),
      ])
      .include("aircraft", (aircraft) => aircraft.select?.("icaoHex", "registration") ?? aircraft)
      .limit(FLIGHT_LIMIT + 1)
      .all() ?? [];
    truncated ||= flights.length > FLIGHT_LIMIT;
    const candidateFlights = flights.slice(0, FLIGHT_LIMIT);
    const candidateFlightIdSet = new Set(candidateFlights.map((flight) => flight.id));
    const positionsByFlight = new Map<number, MovementPosition[]>();
    for (const position of positions.slice(0, POSITION_QUERY_LIMIT)) {
      if (!candidateFlightIdSet.has(position.flightId)) continue;
      const current = positionsByFlight.get(position.flightId) ?? [];
      current.push(position);
      positionsByFlight.set(position.flightId, current);
    }
    const movements: AirportMovement[] = [];
    for (const flight of candidateFlights) {
      const flightPositions = positionsByFlight.get(flight.id) ?? [];
      flightPositions.sort((a, b) => timestamp(a.recordedAt) - timestamp(b.recordedAt));
      if (flightPositions.length > POSITION_PER_FLIGHT_LIMIT) {
        truncated = true;
        flightPositions.splice(0, flightPositions.length - POSITION_PER_FLIGHT_LIMIT);
      }
      const movement = analyzeAirportMovement({
        id: flight.id,
        icaoHex: flight.aircraft.icaoHex,
        callsign: flight.callsign,
        registration: flight.registration ?? flight.aircraft.registration,
        positions: flightPositions,
      }, airport, infrastructure.runways);
      if (movement) movements.push(movement);
    }
    movements.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || b.flightId - a.flightId);
    const summary = summarizeAirportMovements(movements);
    const queryDurationMs = Math.max(0, Date.now() - started);
    lastDiagnostics = { enabled: true, lastQueryDurationMs: queryDurationMs, flightsExamined: candidateFlights.length, positionsExamined: Math.min(positions.length, POSITION_QUERY_LIMIT), truncated };
    return {
      airport: { icao: airport.icaoCode, name: airport.name }, period, generatedAt: now.toISOString(), complete: !truncated, truncated,
      movements, summary,
      diagnostics: { flightsExamined: candidateFlights.length, positionsExamined: Math.min(positions.length, POSITION_QUERY_LIMIT), queryDurationMs },
    };
  } catch (error) {
    lastDiagnostics = { ...lastDiagnostics, lastQueryDurationMs: Math.max(0, Date.now() - started) };
    if (error instanceof AirportMovementsDatabaseUnavailableError) throw error;
    throw new AirportMovementsDatabaseUnavailableError();
  }
}
