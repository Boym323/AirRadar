import "temporal-polyfill/full/global";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  dayKey,
  getAppTimezone,
  getFlightContinuityGapMs,
  getHistoryRetentionDays,
  getHistorySampleIntervalMs,
} from "@/lib/server/config";
import { airportFromCode } from "@/lib/server/airport-catalog";
import { normalizeAirportIata, normalizeAirportIcao } from "@/lib/server/airport-resolver";
import { getPrisma } from "@/lib/server/db";

export interface HistoryResponse {
  source: "postgres" | "memory";
  flight: {
    id: number | null;
    callsign: string | null;
    registration: string | null;
    aircraftType: string | null;
    airline: string | null;
    origin: string | null;
    destination: string | null;
    startedAt: string | null;
    endedAt: string | null;
    lastSeenAt: string | null;
    maxAltitude: number | null;
    minDistanceKm: number | null;
  } | null;
  positions: Array<{
    recordedAt: string;
    lat: number;
    lon: number;
    altitude: number | null;
    groundSpeed: number | null;
    track: number | null;
  }>;
}

export interface RecordAircraftSnapshotResult {
  succeeded: string[];
  failed: string[];
}

export interface HistoryPersistenceStatus {
  lastSuccessfulWriteAt: string | null;
  failureCount: number;
}

export const HISTORY_POSITION_LIMIT = 2_000;
export const HISTORY_FLIGHT_LIMIT = 100;
export const AIRCRAFT_RECENT_FLIGHT_LIMIT = 10;

export type HistoryFlightRange = "today" | "yesterday" | "7d";

export interface HistoryFlightSummary {
  id: number;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  airline: string | null;
  origin: string | null;
  destination: string | null;
  startTime: string;
  endTime: string | null;
  lastSeenAt: string;
  maxAltitude: number | null;
  minDistanceKm: number | null;
}

export interface HistoryFlightDetail {
  flight: HistoryFlightSummary;
  positions: Array<{
    recordedAt: string;
    lat: number;
    lon: number;
    altitude: number | null;
    groundSpeed: number | null;
    track: number | null;
    verticalRate: number | null;
  }>;
  truncated: boolean;
}

export interface AircraftDetailMetadata {
  icaoHex: string;
  registration: string | null;
  registrationCountry: string | null;
  registrationCountryCode: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  model: string | null;
  operator: string | null;
}

export type AircraftHistoryRange = "7d" | "30d";

export interface AircraftHistoryAirport {
  icaoCode: string;
  iataCode: string | null;
}

export interface AircraftHistoryCallsignCount {
  callsign: string;
  count: number;
}

export interface AircraftHistoryRouteCount {
  origin: AircraftHistoryAirport;
  destination: AircraftHistoryAirport;
  count: number;
}

export interface AircraftHistorySummary {
  range: AircraftHistoryRange;
  flightCount: number;
  activeDays: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  topCallsigns: AircraftHistoryCallsignCount[];
  topRoutes: AircraftHistoryRouteCount[];
  topOrigin: AircraftHistoryAirport | null;
  topDestination: AircraftHistoryAirport | null;
}

export interface AircraftDetailResponse {
  aircraft: AircraftDetailMetadata | null;
  recentFlights: HistoryFlightSummary[];
  historySummary: AircraftHistorySummary;
}

export class HistoryDatabaseUnavailableError extends Error {
  constructor() {
    super("History database unavailable");
    this.name = "HistoryDatabaseUnavailableError";
  }
}

let lastRetentionRunAt = 0;
let lastFlightMaintenanceRunAt = 0;
let lastSuccessfulHistoryWriteAt: string | null = null;
let historyPersistenceFailureCount = 0;

/** Read-only runtime health for the existing history persistence lane. */
export function getHistoryPersistenceStatus(): HistoryPersistenceStatus {
  return {
    lastSuccessfulWriteAt: lastSuccessfulHistoryWriteAt,
    failureCount: historyPersistenceFailureCount,
  };
}

function timestampAsDate(value: Temporal.Instant | Date): Date {
  return value instanceof Date ? value : new Date(value.epochMilliseconds);
}

function timestampAsInstant(value: Temporal.Instant | Date): Temporal.Instant {
  return value instanceof Date ? Temporal.Instant.fromEpochMilliseconds(value.getTime()) : value;
}

function timestampAsIso(value: Temporal.Instant | Date): string {
  return timestampAsInstant(value).toString();
}

function localDayStart(date: Date, daysBefore = 0): Date {
  const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(getAppTimezone())
    .startOfDay();
  return timestampAsDate(zoned.subtract({ days: daysBefore }).toInstant());
}

export function normalizeHistoryRange(value: string | null | undefined): HistoryFlightRange {
  return value === "today" || value === "yesterday" || value === "7d" ? value : "7d";
}

export function historyRangeBounds(
  range: HistoryFlightRange,
  now = new Date(),
): { from: Date; to: Date } {
  const todayStart = localDayStart(now);
  if (range === "yesterday") {
    return { from: localDayStart(now, 1), to: todayStart };
  }
  if (range === "today") {
    return { from: todayStart, to: now };
  }
  return { from: localDayStart(now, 6), to: now };
}

export function normalizeAircraftHistoryRange(value: string | null | undefined): AircraftHistoryRange {
  return value === "7d" ? "7d" : "30d";
}

export function aircraftHistoryRangeBounds(
  range: AircraftHistoryRange,
  now = new Date(),
): { from: Date; to: Date } {
  return { from: localDayStart(now, range === "7d" ? 6 : 29), to: now };
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/[%_]/g, "").replace(/\s+/g, " ").toUpperCase();
}

function searchPattern(value: string): string {
  return `%${value}%`;
}

function flightSummaryFromRow(row: {
  id: number;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  airline: string | null;
  origin: string | null;
  destination: string | null;
  maxAltitude: number | null;
  minDistanceKm: number | null;
  startTime: Temporal.Instant | Date;
  lastSeenAt: Temporal.Instant | Date;
  endTime: Temporal.Instant | Date | null;
  aircraft: { icaoHex: string; registration: string | null; aircraftType: string | null };
}): HistoryFlightSummary {
  return {
    id: row.id,
    icaoHex: row.aircraft.icaoHex,
    callsign: row.callsign,
    registration: row.registration ?? row.aircraft.registration,
    aircraftType: row.aircraftType ?? row.aircraft.aircraftType,
    airline: row.airline,
    origin: row.origin,
    destination: row.destination,
    startTime: timestampAsIso(row.startTime),
    endTime: row.endTime ? timestampAsIso(row.endTime) : null,
    lastSeenAt: timestampAsIso(row.lastSeenAt),
    maxAltitude: row.maxAltitude,
    minDistanceKm: row.minDistanceKm,
  };
}

function orderFlightSummaries(flights: HistoryFlightSummary[]): HistoryFlightSummary[] {
  return flights.sort((a, b) => {
    const startDifference = Date.parse(b.startTime) - Date.parse(a.startTime);
    return startDifference || b.id - a.id;
  });
}

async function queryFlightSummaries(
  schema: NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"],
  from: Date | null,
  to: Date | null,
  limit: number,
  extra?: (query: NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"]["Flight"]) => NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"]["Flight"],
): Promise<HistoryFlightSummary[]> {
  let query = schema.Flight;
  if (from) query = query.where((flight) => flight.startTime.gte(Temporal.Instant.fromEpochMilliseconds(from.getTime())));
  if (to) query = query.where((flight) => flight.startTime.lt(Temporal.Instant.fromEpochMilliseconds(to.getTime())));
  if (extra) query = extra(query);
  const rows = await query
    .orderBy([(flight) => flight.startTime.desc(), (flight) => flight.id.desc()])
    .include("aircraft", (aircraft) => aircraft.select("icaoHex", "registration", "aircraftType"))
    .limit(limit)
    .all();
  return rows.map(flightSummaryFromRow);
}

export async function listHistoryFlights(options: {
  range?: HistoryFlightRange;
  query?: string | null;
  icaoHex?: string | null;
  limit?: number;
  now?: Date;
} = {}): Promise<{ flights: HistoryFlightSummary[]; range: HistoryFlightRange; limit: number }> {
  const database = getPrisma();
  if (!database) throw new HistoryDatabaseUnavailableError();

  const range = normalizeHistoryRange(options.range);
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? HISTORY_FLIGHT_LIMIT), 1), HISTORY_FLIGHT_LIMIT);
  const exactHex = options.icaoHex?.trim().toUpperCase() || null;
  const search = normalizeSearch(options.query);
  try {
    const schema = database.orm.public;
    if (exactHex) {
      const aircraft = await schema.Aircraft.where({ icaoHex: exactHex }).first();
      if (!aircraft) return { flights: [], range, limit };
      const flights = await queryFlightSummaries(schema, null, null, limit, (query) => query.where({ aircraftId: aircraft.id }));
      return { flights: orderFlightSummaries(flights).slice(0, limit), range, limit };
    }

    const { from, to } = historyRangeBounds(range, options.now);
    if (!search) {
      const flights = await queryFlightSummaries(schema, from, to, limit);
      return { flights: orderFlightSummaries(flights), range, limit };
    }

    const pattern = searchPattern(search);
    const [callsignMatches, flightRegistrationMatches, aircraftRegistrationMatches, hexMatches] = await Promise.all([
      queryFlightSummaries(schema, from, to, limit, (query) => query.where((flight) => flight.callsign.ilike(pattern))),
      queryFlightSummaries(schema, from, to, limit, (query) => query.where((flight) => flight.registration.ilike(pattern))),
      queryFlightSummaries(schema, from, to, limit, (query) => query.where((flight) => flight.aircraft.some((aircraft) => aircraft.registration.ilike(pattern)))),
      queryFlightSummaries(schema, from, to, limit, (query) => query.where((flight) => flight.aircraft.some((aircraft) => aircraft.icaoHex.ilike(pattern)))),
    ]);
    const unique = new Map<number, HistoryFlightSummary>();
    for (const flight of [...callsignMatches, ...flightRegistrationMatches, ...aircraftRegistrationMatches, ...hexMatches]) unique.set(flight.id, flight);
    return { flights: orderFlightSummaries([...unique.values()]).slice(0, limit), range, limit };
  } catch {
    throw new HistoryDatabaseUnavailableError();
  }
}

export async function getHistoryFlight(id: number): Promise<HistoryFlightDetail | null> {
  const database = getPrisma();
  if (!database) throw new HistoryDatabaseUnavailableError();
  try {
    const schema = database.orm.public;
    const row = await schema.Flight
      .where({ id })
      .include("aircraft", (aircraft) => aircraft.select("icaoHex", "registration", "aircraftType"))
      .first();
    if (!row) return null;
    const positionRows = await schema.FlightPosition
      .where({ flightId: id })
      .orderBy((position) => position.recordedAt.asc())
      .limit(HISTORY_POSITION_LIMIT + 1)
      .all();
    const truncated = positionRows.length > HISTORY_POSITION_LIMIT;
    return {
      flight: flightSummaryFromRow(row),
      truncated,
      positions: positionRows.slice(0, HISTORY_POSITION_LIMIT).map((position) => ({
        recordedAt: timestampAsIso(position.recordedAt),
        lat: position.lat,
        lon: position.lon,
        altitude: position.altitude,
        groundSpeed: position.groundSpeed,
        track: position.track,
        verticalRate: position.verticalRate,
      })),
    };
  } catch {
    throw new HistoryDatabaseUnavailableError();
  }
}

interface AircraftHistoryAirportRow {
  icao: string;
  iata: string | null;
  latitude: number;
  longitude: number;
}

interface AircraftHistoryAirportField {
  in(values: string[]): unknown;
}

interface AircraftHistoryAirportCollection {
  where(predicate: (airport: { icao: AircraftHistoryAirportField; iata: AircraftHistoryAirportField }) => unknown): {
    all(): Promise<AircraftHistoryAirportRow[]>;
  };
}

function emptyAircraftHistorySummary(range: AircraftHistoryRange): AircraftHistorySummary {
  return {
    range,
    flightCount: 0,
    activeDays: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    topCallsigns: [],
    topRoutes: [],
    topOrigin: null,
    topDestination: null,
  };
}

function normalizedHistoryText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

function historyAirportFromRow(row: AircraftHistoryAirportRow): AircraftHistoryAirport | null {
  const icaoCode = normalizeAirportIcao(row.icao);
  if (!icaoCode || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)
    || row.latitude < -90 || row.latitude > 90 || row.longitude < -180 || row.longitude > 180) {
    return null;
  }
  return { icaoCode, iataCode: normalizeAirportIata(row.iata) };
}

function historyAirportFromCatalogCode(code: string): AircraftHistoryAirport | null {
  const airport = airportFromCode(code);
  if (!airport) return null;
  const icaoCode = normalizeAirportIcao(airport.icaoCode);
  if (!icaoCode) return null;
  return { icaoCode, iataCode: normalizeAirportIata(airport.iataCode) };
}

async function resolveHistoryAirports(
  schema: NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"],
  codes: string[],
): Promise<Map<string, AircraftHistoryAirport>> {
  const normalizedCodes = [...new Set(codes
    .map((code) => normalizedHistoryText(code))
    .filter((code): code is string => Boolean(normalizeAirportIcao(code) ?? normalizeAirportIata(code))))];
  const airports = new Map<string, AircraftHistoryAirport>();

  // Keep the bundled catalog as the same bounded emergency fallback used by
  // the existing airport resolver. Database values replace it below.
  for (const code of normalizedCodes) {
    const airport = historyAirportFromCatalogCode(code);
    if (!airport) continue;
    airports.set(code, airport);
    airports.set(airport.icaoCode, airport);
    if (airport.iataCode) airports.set(airport.iataCode, airport);
  }

  const airportTable = (schema as unknown as { Airport?: AircraftHistoryAirportCollection }).Airport;
  if (!airportTable || normalizedCodes.length === 0) return airports;

  try {
    const [icaoRows, iataRows] = await Promise.all([
      airportTable.where((airport) => airport.icao.in(normalizedCodes)).all(),
      airportTable.where((airport) => airport.iata.in(normalizedCodes)).all(),
    ]);
    for (const row of [...icaoRows, ...iataRows]) {
      const airport = historyAirportFromRow(row);
      if (!airport) continue;
      airports.set(airport.icaoCode, airport);
      if (airport.iataCode) airports.set(airport.iataCode, airport);
    }
  } catch {
    // Airport metadata is optional for the history summary. Keep any
    // bundled fallback values and omit unresolved route entries on failure.
  }
  return airports;
}

function addCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map: Map<string, number>): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 5);
}

function addFlightActiveDays(
  days: Set<string>,
  start: Date,
  lastSeen: Date,
  from: Date,
  to: Date,
): void {
  const startMilliseconds = Math.max(start.getTime(), from.getTime());
  const endMilliseconds = Math.min(lastSeen.getTime(), to.getTime());
  if (!Number.isFinite(startMilliseconds) || !Number.isFinite(endMilliseconds) || startMilliseconds > endMilliseconds) return;

  const timezone = getAppTimezone();
  let cursor = Temporal.Instant.fromEpochMilliseconds(startMilliseconds).toZonedDateTimeISO(timezone).startOfDay();
  const lastDay = Temporal.Instant.fromEpochMilliseconds(endMilliseconds).toZonedDateTimeISO(timezone).startOfDay();
  while (Temporal.Instant.compare(cursor.toInstant(), lastDay.toInstant()) <= 0) {
    days.add(dayKey(new Date(cursor.toInstant().epochMilliseconds), timezone));
    cursor = cursor.add({ days: 1 });
  }
}

async function getAircraftHistorySummary(
  schema: NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"],
  aircraftId: number,
  range: AircraftHistoryRange,
  now: Date,
): Promise<AircraftHistorySummary> {
  const summary = emptyAircraftHistorySummary(range);
  const { from, to } = aircraftHistoryRangeBounds(range, now);
  const fromInstant = Temporal.Instant.fromEpochMilliseconds(from.getTime());
  const toInstant = Temporal.Instant.fromEpochMilliseconds(to.getTime());
  const flights = await schema.Flight
    .where({ aircraftId })
    .where((flight) => flight.startTime.gte(fromInstant))
    .where((flight) => flight.startTime.lt(toInstant))
    .all();

  summary.flightCount = flights.length;
  if (flights.length === 0) return summary;

  const callsigns = new Map<string, number>();
  const origins = new Map<string, number>();
  const destinations = new Map<string, number>();
  const routes = new Map<string, { origin: AircraftHistoryAirport; destination: AircraftHistoryAirport; count: number }>();
  const activeDays = new Set<string>();
  const airportCodes = flights
    .flatMap((flight) => [flight.origin, flight.destination])
    .filter((code): code is string => Boolean(code));
  const airports = await resolveHistoryAirports(schema, airportCodes);
  let firstSeenAt: Date | null = null;
  let lastSeenAt: Date | null = null;

  for (const flight of flights) {
    const startTime = timestampAsDate(flight.startTime);
    const flightLastSeenAt = timestampAsDate(flight.lastSeenAt);
    const boundedLastSeenAt = new Date(Math.min(flightLastSeenAt.getTime(), to.getTime()));
    if (!firstSeenAt || startTime < firstSeenAt) firstSeenAt = startTime;
    if (!lastSeenAt || boundedLastSeenAt > lastSeenAt) lastSeenAt = boundedLastSeenAt;
    addFlightActiveDays(activeDays, startTime, boundedLastSeenAt, from, to);

    const callsign = normalizedHistoryText(flight.callsign);
    if (callsign) addCount(callsigns, callsign);

    const originCode = normalizedHistoryText(flight.origin);
    const destinationCode = normalizedHistoryText(flight.destination);
    const origin = originCode ? airports.get(originCode) : undefined;
    const destination = destinationCode ? airports.get(destinationCode) : undefined;
    if (origin) addCount(origins, origin.icaoCode);
    if (destination) addCount(destinations, destination.icaoCode);
    if (origin && destination) {
      const routeKey = `${origin.icaoCode}:${destination.icaoCode}`;
      const current = routes.get(routeKey);
      if (current) current.count += 1;
      else routes.set(routeKey, { origin, destination, count: 1 });
    }
  }

  summary.activeDays = activeDays.size;
  summary.firstSeenAt = firstSeenAt ? timestampAsIso(firstSeenAt) : null;
  summary.lastSeenAt = lastSeenAt ? timestampAsIso(lastSeenAt) : null;
  summary.topCallsigns = sortedCounts(callsigns).map(({ key, count }) => ({ callsign: key, count }));
  const topOrigins = sortedCounts(origins);
  const topDestinations = sortedCounts(destinations);
  summary.topOrigin = topOrigins[0]?.key ? airports.get(topOrigins[0].key) ?? null : null;
  summary.topDestination = topDestinations[0]?.key ? airports.get(topDestinations[0].key) ?? null : null;
  summary.topRoutes = [...routes.values()]
    .sort((a, b) => b.count - a.count
      || a.origin.icaoCode.localeCompare(b.origin.icaoCode)
      || a.destination.icaoCode.localeCompare(b.destination.icaoCode))
    .slice(0, 5);
  return summary;
}

/**
 * Returns durable aircraft metadata, a deliberately small recent-flight
 * summary and a bounded Flight-instance history summary. FlightPosition is
 * not queried here; playback remains behind the existing per-flight detail
 * endpoint.
 */
export async function getAircraftDetail(
  icaoHex: string,
  options: { historyRange?: AircraftHistoryRange; now?: Date; includeHistorySummary?: boolean } = {},
): Promise<AircraftDetailResponse> {
  const database = getPrisma();
  if (!database) throw new HistoryDatabaseUnavailableError();

  try {
    const schema = database.orm.public;
    const historyRange = normalizeAircraftHistoryRange(options.historyRange);
    const aircraft = await schema.Aircraft.where({ icaoHex: icaoHex.toUpperCase() }).first();
    if (!aircraft) return { aircraft: null, recentFlights: [], historySummary: emptyAircraftHistorySummary(historyRange) };

    const flights = await schema.Flight
      .where({ aircraftId: aircraft.id })
      .orderBy([(flight) => flight.startTime.desc(), (flight) => flight.id.desc()])
      .include("aircraft", (relatedAircraft) => relatedAircraft.select("icaoHex", "registration", "aircraftType"))
      .limit(AIRCRAFT_RECENT_FLIGHT_LIMIT)
      .all();
    const historySummary = options.includeHistorySummary === false
      ? emptyAircraftHistorySummary(historyRange)
      : await getAircraftHistorySummary(schema, aircraft.id, historyRange, options.now ?? new Date());

    return {
      aircraft: {
        icaoHex: aircraft.icaoHex,
        registration: aircraft.registration,
        registrationCountry: aircraft.registrationCountry,
        registrationCountryCode: aircraft.registrationCountryCode,
        aircraftType: aircraft.aircraftType,
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        operator: aircraft.operator,
      },
      recentFlights: orderFlightSummaries(flights.map(flightSummaryFromRow)).slice(0, AIRCRAFT_RECENT_FLIGHT_LIMIT),
      historySummary,
    };
  } catch {
    throw new HistoryDatabaseUnavailableError();
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  let firstError: unknown = null;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      try {
        await worker(item);
      } catch (error) {
        firstError ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  if (firstError) throw firstError;
}

function uniqueAircraftByHex(aircraft: Aircraft[]): Aircraft[] {
  const unique = new Map<string, Aircraft>();
  for (const item of aircraft) {
    const icaoHex = item.icaoHex.trim().toUpperCase();
    if (!unique.has(icaoHex)) unique.set(icaoHex, { ...item, icaoHex });
  }
  return [...unique.values()];
}

function isAircraftUniqueViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { sqlState?: unknown; code?: unknown; constraint?: unknown; cause?: unknown };
    const sqlState = candidate.sqlState ?? candidate.code;
    if (sqlState === "23505" && candidate.constraint === "aircraft_icaoHex_key") return true;
    current = candidate.cause;
  }
  return false;
}

async function retryAircraftUniqueViolation<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 0 && isAircraftUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("Unreachable aircraft history retry state");
}

async function pruneHistoryIfDue(database: NonNullable<ReturnType<typeof getPrisma>>): Promise<void> {
  const now = Date.now();
  const maintenanceDue = now - lastFlightMaintenanceRunAt >= Math.max(getHistorySampleIntervalMs(), 5 * 60_000);
  const retentionDue = now - lastRetentionRunAt >= 6 * 60 * 60_000;
  if (!maintenanceDue && !retentionDue) return;
  if (maintenanceDue) {
    lastFlightMaintenanceRunAt = now;
    try {
      await closeStaleFlights(database, new Date(now));
    } catch (error) {
      lastFlightMaintenanceRunAt = 0;
      console.error("AirRadar stale flight cleanup failed", error);
    }
  }
  if (!retentionDue) return;
  lastRetentionRunAt = now;
  try {
    const cutoff = new Date(now - getHistoryRetentionDays() * 24 * 60 * 60_000);
    // This also removes old samples belonging to still-open flights. A later
    // migration can partition this table if a larger installation needs it.
    const cutoffInstant = Temporal.Instant.fromEpochMilliseconds(cutoff.getTime());
    await database.orm.public.FlightPosition.where((position) => position.recordedAt.lt(cutoffInstant)).delete();
  } catch (error) {
    lastRetentionRunAt = 0;
    console.error("AirRadar history retention cleanup failed", error);
  }
}

export function staleFlightEndTime(lastSeenAt: Date, now: Date, continuityGapMs = getFlightContinuityGapMs()): Date | null {
  return now.getTime() - lastSeenAt.getTime() > continuityGapMs ? lastSeenAt : null;
}

/** Closes flights whose aircraft disappeared without a final snapshot. */
export async function closeStaleFlights(
  database: NonNullable<ReturnType<typeof getPrisma>>,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - getFlightContinuityGapMs());
  const schema = database.orm.public;
  const cutoffInstant = Temporal.Instant.fromEpochMilliseconds(cutoff.getTime());
  const staleFlights = await schema.Flight
    .where({ endTime: null })
    .where((flight) => flight.lastSeenAt.lt(cutoffInstant))
    .all();
  await runWithConcurrency(staleFlights, 4, async (flight) => {
    const lastSeenAt = timestampAsDate(flight.lastSeenAt);
    const endTime = staleFlightEndTime(lastSeenAt, now);
    if (!endTime) return;
    await schema.Flight.where({ id: flight.id }).update({
      endTime: Temporal.Instant.fromEpochMilliseconds(endTime.getTime()),
    });
  });
}

export async function recordAircraftSnapshot(
  aircraft: Aircraft[],
  recordedAt: Date,
): Promise<RecordAircraftSnapshotResult> {
  const database = getPrisma();
  if (!database) {
    return {
      succeeded: uniqueAircraftByHex(aircraft)
        .filter((item) => item.lat !== null && item.lon !== null)
        .map((item) => item.icaoHex),
      failed: [],
    };
  }

  const result: RecordAircraftSnapshotResult = { succeeded: [], failed: [] };

  await runWithConcurrency(uniqueAircraftByHex(aircraft), 8, async (item) => {
    if (item.lat === null || item.lon === null) return;
    const latitude = item.lat;
    const longitude = item.lon;
    try {
      const recordedAtInstant = Temporal.Instant.fromEpochMilliseconds(recordedAt.getTime());
      await retryAircraftUniqueViolation(() => database.transaction(async (transaction) => {
      const schema = transaction.orm.public;
      const metadata = item.enrichment?.metadata;
      const dbAircraft = await schema.Aircraft.upsert({
        // Prisma 8 defaults conflict resolution to the primary key. Aircraft
        // identity is ICAO hex, so use its unique constraint explicitly.
        conflictOn: { icaoHex: item.icaoHex },
        update: {
          // Missing live fields must not erase the durable catalog value.
          registration: item.registration ?? metadata?.registration ?? undefined,
          registrationCountry: metadata?.registrationCountry ?? undefined,
          registrationCountryCode: metadata?.registrationCountryCode ?? undefined,
          aircraftType: item.aircraftType ?? metadata?.icaoTypeCode ?? undefined,
          manufacturer: metadata?.manufacturer ?? undefined,
          model: metadata?.aircraftDescription ?? undefined,
          operator: metadata?.operator ?? undefined,
          updatedAt: recordedAtInstant,
        },
        create: {
          icaoHex: item.icaoHex,
          registration: item.registration ?? metadata?.registration ?? null,
          registrationCountry: item.enrichment?.metadata?.registrationCountry,
          registrationCountryCode: item.enrichment?.metadata?.registrationCountryCode,
          aircraftType: item.aircraftType ?? metadata?.icaoTypeCode,
          manufacturer: item.enrichment?.metadata?.manufacturer,
          model: item.enrichment?.metadata?.aircraftDescription,
          operator: item.enrichment?.metadata?.operator,
          updatedAt: recordedAtInstant,
        },
      });

      let flight = await schema.Flight
        .where({ aircraftId: dbAircraft.id })
        .where({ endTime: null })
        .orderBy((row) => row.startTime.desc())
        .first();

      const callsignChanged = Boolean(flight?.callsign && item.callsign && flight.callsign !== item.callsign);
      const continuityBroken = Boolean(
        flight && recordedAt.getTime() - timestampAsDate(flight.lastSeenAt).getTime() > getFlightContinuityGapMs(),
      );

      if (!flight || callsignChanged || continuityBroken) {
        if (flight) {
          await schema.Flight.where({ id: flight.id }).update(
            continuityBroken
              ? { endTime: timestampAsInstant(flight.lastSeenAt) }
              : { endTime: recordedAtInstant, lastSeenAt: recordedAtInstant },
          );
        }
        flight = await schema.Flight.create({
          aircraftId: dbAircraft.id,
          instanceKey: `${item.icaoHex}:${recordedAt.getTime()}`,
          callsign: item.callsign,
          registration: item.registration ?? metadata?.registration,
          aircraftType: item.enrichment?.metadata?.icaoTypeCode ?? item.aircraftType,
          airline: item.enrichment?.route?.airline ?? null,
          origin: item.enrichment?.route?.origin ?? null,
          destination: item.enrichment?.route?.destination ?? null,
          maxAltitude: item.altitude,
          minDistanceKm: item.distanceKm,
          startTime: recordedAtInstant,
          lastSeenAt: recordedAtInstant,
        });
      } else {
        await schema.Flight.where({ id: flight.id }).update({
          callsign: flight.callsign ?? item.callsign,
          registration: flight.registration ?? item.registration ?? item.enrichment?.metadata?.registration,
          aircraftType: flight.aircraftType ?? item.enrichment?.metadata?.icaoTypeCode ?? item.aircraftType,
          airline: flight.airline ?? item.enrichment?.route?.airline,
          origin: flight.origin ?? item.enrichment?.route?.origin,
          destination: flight.destination ?? item.enrichment?.route?.destination,
          maxAltitude: Math.max(flight.maxAltitude ?? 0, item.altitude ?? 0) || null,
          minDistanceKm: Math.min(flight.minDistanceKm ?? Number.POSITIVE_INFINITY, item.distanceKm ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY
            ? null
            : Math.min(flight.minDistanceKm ?? Number.POSITIVE_INFINITY, item.distanceKm ?? Number.POSITIVE_INFINITY),
          lastSeenAt: recordedAtInstant,
        });
      }

      await schema.FlightPosition.create({
        flightId: flight.id,
        recordedAt: recordedAtInstant,
        lat: latitude,
        lon: longitude,
        ...(item.altitude === null ? {} : { altitude: item.altitude }),
        ...(item.groundSpeed === null ? {} : { groundSpeed: item.groundSpeed }),
        ...(item.track === null ? {} : { track: item.track }),
        ...(item.verticalRate === null ? {} : { verticalRate: item.verticalRate }),
      });
      }));
      result.succeeded.push(item.icaoHex);
    } catch {
      // History is best-effort; one aircraft must not reject the other writes.
      result.failed.push(item.icaoHex);
    }
  });

  if (result.succeeded.length) lastSuccessfulHistoryWriteAt = new Date().toISOString();
  if (result.failed.length) historyPersistenceFailureCount += result.failed.length;

  await pruneHistoryIfDue(database);
  return result;
}

export async function getAircraftHistory(hex: string, fallback: Aircraft | null): Promise<HistoryResponse> {
  const database = getPrisma();
  if (database) {
    try {
      const schema = database.orm.public;
      const aircraft = await schema.Aircraft.where({ icaoHex: hex.toUpperCase() }).first();
      const flight = aircraft
        ? await schema.Flight
            .where({ aircraftId: aircraft.id })
            .orderBy((row) => row.startTime.desc())
            .first()
        : null;
      if (flight) {
        const positions = await schema.FlightPosition
          .where({ flightId: flight.id })
          .orderBy((row) => row.recordedAt.desc())
          .limit(500)
          .all();
        return {
          source: "postgres",
          flight: {
          id: flight.id,
          callsign: flight.callsign,
          registration: flight.registration,
          aircraftType: flight.aircraftType,
          airline: flight.airline,
          origin: flight.origin,
          destination: flight.destination,
          startedAt: timestampAsIso(flight.startTime),
          endedAt: flight.endTime ? timestampAsIso(flight.endTime) : null,
          lastSeenAt: timestampAsIso(flight.lastSeenAt),
          maxAltitude: flight.maxAltitude,
          minDistanceKm: flight.minDistanceKm,
          },
          positions: positions.reverse().map((position) => ({
            recordedAt: timestampAsIso(position.recordedAt),
            lat: position.lat,
            lon: position.lon,
            altitude: position.altitude,
            groundSpeed: position.groundSpeed,
            track: position.track,
          })),
        };
      }
    } catch {
      // A database outage should not hide the live in-memory trail.
    }
  }

  return {
    source: "memory",
    flight: fallback
      ? {
          id: null,
          callsign: fallback.callsign,
          registration: fallback.registration ?? fallback.enrichment?.metadata?.registration ?? null,
          aircraftType: fallback.enrichment?.metadata?.icaoTypeCode ?? fallback.aircraftType,
          airline: fallback.enrichment?.route?.airline ?? null,
          origin: fallback.enrichment?.route?.origin ?? null,
          destination: fallback.enrichment?.route?.destination ?? null,
          startedAt: fallback.trail[0]?.recordedAt ?? fallback.lastSeen,
          endedAt: null,
          lastSeenAt: fallback.lastSeen,
          maxAltitude: fallback.altitude,
          minDistanceKm: fallback.distanceKm,
        }
      : null,
    positions: fallback?.trail.map((position) => ({
      recordedAt: position.recordedAt,
      lat: position.lat,
      lon: position.lon,
      altitude: position.altitude,
      groundSpeed: position.groundSpeed,
      track: position.track,
    })) ?? [],
  };
}
