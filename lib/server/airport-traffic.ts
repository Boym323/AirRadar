import "temporal-polyfill/full/global";
import type { Airport } from "@/lib/airports/types";
import type {
  AirportTrafficAircraftCount,
  AirportTrafficAirport,
  AirportTrafficCallsignCount,
  AirportTrafficHeatmapCell,
  AirportTrafficRange,
  AirportTrafficRecentFlight,
  AirportTrafficRouteCount,
  AirportTrafficSummary,
} from "@/lib/airport-traffic/types";
import { airportFromCode } from "@/lib/server/airport-catalog";
import { dayKey, getAppTimezone } from "@/lib/server/config";
import { normalizeAirportIata, normalizeAirportIcao } from "@/lib/server/airport-resolver";
import { getPrisma } from "@/lib/server/db";

export const AIRPORT_TRAFFIC_RECENT_LIMIT = 10;
export const AIRPORT_TRAFFIC_TOP_LIMIT = 5;

export class AirportTrafficDatabaseUnavailableError extends Error {
  constructor() {
    super("Airport traffic database unavailable");
    this.name = "AirportTrafficDatabaseUnavailableError";
  }
}

export function normalizeAirportTrafficRange(value: string | null | undefined): AirportTrafficRange {
  return value === "7d" ? "7d" : "30d";
}

function localDayStart(date: Date, daysBefore = 0): Date {
  const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(getAppTimezone())
    .startOfDay();
  return new Date(zoned.subtract({ days: daysBefore }).toInstant().epochMilliseconds);
}

export function airportTrafficRangeBounds(
  range: AirportTrafficRange,
  now = new Date(),
): { from: Date; to: Date } {
  return {
    from: localDayStart(now, range === "7d" ? 6 : 29),
    to: now,
  };
}

interface AirportTrafficAirportRow {
  icao: string;
  iata: string | null;
  latitude: number;
  longitude: number;
}

interface AirportTrafficAirportCollection {
  where(predicate: (airport: { icao: { in(values: string[]): unknown }; iata: { in(values: string[]): unknown } }) => unknown): {
    all(): Promise<AirportTrafficAirportRow[]>;
  };
}

interface AirportTrafficFlightRow {
  id: number;
  aircraft: {
    id: number;
    icaoHex: string;
    registration: string | null;
    aircraftType: string | null;
  };
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  origin: string | null;
  destination: string | null;
  startTime: Temporal.Instant | Date;
  lastSeenAt: Temporal.Instant | Date;
}

function timestampAsDate(value: Temporal.Instant | Date): Date {
  return value instanceof Date ? value : new Date(value.epochMilliseconds);
}

function timestampAsIso(value: Temporal.Instant | Date): string {
  return timestampAsDate(value).toISOString();
}

function normalizedCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalizeAirportIcao(normalized) ?? normalizeAirportIata(normalized);
}

function normalizedText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

function validAirportRow(row: AirportTrafficAirportRow): AirportTrafficAirport | null {
  const icaoCode = normalizeAirportIcao(row.icao);
  if (!icaoCode || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)
    || row.latitude < -90 || row.latitude > 90 || row.longitude < -180 || row.longitude > 180) {
    return null;
  }
  return { icaoCode, iataCode: normalizeAirportIata(row.iata) };
}

function addAirportAliases(map: Map<string, AirportTrafficAirport>, code: string, airport: AirportTrafficAirport): void {
  map.set(code, airport);
  map.set(airport.icaoCode, airport);
  if (airport.iataCode) map.set(airport.iataCode, airport);
}

async function resolveTrafficAirports(
  schema: NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"],
  codes: string[],
): Promise<Map<string, AirportTrafficAirport>> {
  const normalizedCodes = [...new Set(codes
    .map(normalizedCode)
    .filter((code): code is string => Boolean(code)))];
  const airports = new Map<string, AirportTrafficAirport>();

  for (const code of normalizedCodes) {
    const fallback = airportFromCode(code);
    if (!fallback) continue;
    const airport: AirportTrafficAirport = {
      icaoCode: fallback.icaoCode,
      iataCode: fallback.iataCode,
    };
    addAirportAliases(airports, code, airport);
  }

  const airportTable = (schema as unknown as { Airport?: AirportTrafficAirportCollection }).Airport;
  if (!airportTable || normalizedCodes.length === 0) return airports;

  try {
    const [icaoRows, iataRows] = await Promise.all([
      airportTable.where((airport) => airport.icao.in(normalizedCodes)).all(),
      airportTable.where((airport) => airport.iata.in(normalizedCodes)).all(),
    ]);
    for (const row of [...icaoRows, ...iataRows]) {
      const airport = validAirportRow(row);
      if (!airport) continue;
      addAirportAliases(airports, airport.icaoCode, airport);
      if (airport.iataCode) addAirportAliases(airports, airport.iataCode, airport);
    }
  } catch {
    // Route metadata is optional. Keep the bounded catalog fallback and omit
    // unresolved entries rather than inventing a route from position data.
  }
  return airports;
}

function emptyTrafficSummary(range: AirportTrafficRange): AirportTrafficSummary {
  const cells: AirportTrafficHeatmapCell[] = [];
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
    for (let hour = 0; hour < 24; hour += 1) cells.push({ dayOfWeek, hour, arrivals: 0, departures: 0 });
  }
  return {
    range,
    flights: 0,
    departures: 0,
    arrivals: 0,
    uniqueAircraft: 0,
    activeDays: 0,
    firstCapturedAt: null,
    lastCapturedAt: null,
    topDestinations: [],
    topOrigins: [],
    topAircraft: [],
    topCallsigns: [],
    recentTraffic: [],
    heatmap: { cells, maxCount: 0 },
  };
}

function heatmapCell(cells: Map<string, AirportTrafficHeatmapCell>, date: Date): AirportTrafficHeatmapCell {
  const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(getAppTimezone());
  const key = `${zoned.dayOfWeek}:${zoned.hour}`;
  const existing = cells.get(key);
  if (existing) return existing;
  const created = { dayOfWeek: zoned.dayOfWeek, hour: zoned.hour, arrivals: 0, departures: 0 };
  cells.set(key, created);
  return created;
}

function addCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function orderedCounts(map: Map<string, number>): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function sortedCounts(map: Map<string, number>): Array<{ key: string; count: number }> {
  return orderedCounts(map)
    .slice(0, AIRPORT_TRAFFIC_TOP_LIMIT);
}

function addActiveFlightDays(days: Set<string>, start: Date, lastSeen: Date, from: Date, to: Date): void {
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

function routeCount(
  counts: Map<string, number>,
  airports: Map<string, AirportTrafficAirport>,
): AirportTrafficRouteCount[] {
  return orderedCounts(counts)
    .map(({ key, count }) => {
      const airport = airports.get(key);
      return airport ? { airport, count } : null;
    })
    .filter((item): item is AirportTrafficRouteCount => item !== null)
    .slice(0, AIRPORT_TRAFFIC_TOP_LIMIT);
}

function flightAirportMatch(code: string | null, targetCodes: ReadonlySet<string>): boolean {
  const normalized = normalizedCode(code);
  return normalized !== null && targetCodes.has(normalized);
}

function flightAircraft(row: AirportTrafficFlightRow): AirportTrafficAircraftCount {
  return {
    icaoHex: row.aircraft.icaoHex.trim().toUpperCase(),
    registration: normalizedText(row.registration) ?? normalizedText(row.aircraft.registration),
    aircraftType: normalizedText(row.aircraftType) ?? normalizedText(row.aircraft.aircraftType),
    count: 1,
  };
}

function mergeAircraftCount(
  aircraft: Map<string, AirportTrafficAircraftCount>,
  row: AirportTrafficFlightRow,
): void {
  const item = flightAircraft(row);
  const existing = aircraft.get(item.icaoHex);
  if (!existing) {
    aircraft.set(item.icaoHex, item);
    return;
  }
  existing.count += 1;
  existing.registration ??= item.registration;
  existing.aircraftType ??= item.aircraftType;
}

function topAircraft(aircraft: Map<string, AirportTrafficAircraftCount>): AirportTrafficAircraftCount[] {
  return [...aircraft.values()]
    .sort((a, b) => b.count - a.count || a.icaoHex.localeCompare(b.icaoHex))
    .slice(0, AIRPORT_TRAFFIC_TOP_LIMIT);
}

function topCallsigns(counts: Map<string, number>): AirportTrafficCallsignCount[] {
  return sortedCounts(counts).map(({ key: callsign, count }) => ({ callsign, count }));
}

function recentTraffic(
  flights: AirportTrafficFlightRow[],
  airportCodes: ReadonlySet<string>,
  airports: Map<string, AirportTrafficAirport>,
): AirportTrafficRecentFlight[] {
  return [...flights]
    .sort((a, b) => timestampAsDate(b.lastSeenAt).getTime() - timestampAsDate(a.lastSeenAt).getTime() || b.id - a.id)
    .slice(0, AIRPORT_TRAFFIC_RECENT_LIMIT)
    .map((flight) => {
      const departure = flightAirportMatch(flight.origin, airportCodes);
      const direction = departure ? "departure" : "arrival";
      const otherCode = departure ? normalizedCode(flight.destination) : normalizedCode(flight.origin);
      return {
        id: flight.id,
        time: timestampAsIso(flight.lastSeenAt),
        direction,
        callsign: normalizedText(flight.callsign),
        aircraft: {
          icaoHex: flight.aircraft.icaoHex.trim().toUpperCase(),
          registration: normalizedText(flight.registration) ?? normalizedText(flight.aircraft.registration),
        },
        otherAirport: otherCode ? airports.get(otherCode) ?? null : null,
      };
    });
}

/**
 * Summarizes only persisted Flight instances. The two route predicates are
 * independently bounded by the local date range, then deduplicated by Flight
 * id so a malformed loop route cannot inflate the total.
 */
export async function getAirportTrafficSummary(
  airport: Airport,
  options: { range?: AirportTrafficRange; now?: Date } = {},
): Promise<AirportTrafficSummary> {
  const database = getPrisma();
  if (!database) throw new AirportTrafficDatabaseUnavailableError();

  const range = options.range ?? "30d";
  const { from, to } = airportTrafficRangeBounds(range, options.now);
  const fromInstant = Temporal.Instant.fromEpochMilliseconds(from.getTime());
  const toInstant = Temporal.Instant.fromEpochMilliseconds(to.getTime());
  const targetCodes = [...new Set([airport.icaoCode, airport.iataCode]
    .map(normalizedCode)
    .filter((code): code is string => Boolean(code)))];
  const targetCodeSet = new Set(targetCodes);
  const summary = emptyTrafficSummary(range);
  if (targetCodes.length === 0) return summary;

  try {
    const schema = database.orm.public;
    const originQuery = schema.Flight
      .where((flight) => flight.startTime.gte(fromInstant))
      .where((flight) => flight.startTime.lt(toInstant))
      .where((flight) => flight.origin.in(targetCodes))
      .include("aircraft", (aircraft) => aircraft.select("id", "icaoHex", "registration", "aircraftType"));
    const destinationQuery = schema.Flight
      .where((flight) => flight.startTime.gte(fromInstant))
      .where((flight) => flight.startTime.lt(toInstant))
      .where((flight) => flight.destination.in(targetCodes))
      .include("aircraft", (aircraft) => aircraft.select("id", "icaoHex", "registration", "aircraftType"));
    const [originRows, destinationRows] = await Promise.all([
      originQuery.all(),
      destinationQuery.all(),
    ]);
    const flights = new Map<number, AirportTrafficFlightRow>();
    for (const row of [...originRows, ...destinationRows]) flights.set(row.id, row as AirportTrafficFlightRow);
    const relevantFlights = [...flights.values()];
    summary.flights = relevantFlights.length;
    if (relevantFlights.length === 0) return summary;

    const origins = new Map<string, number>();
    const destinations = new Map<string, number>();
    const callsigns = new Map<string, number>();
    const aircraft = new Map<string, AirportTrafficAircraftCount>();
    const heatmapCells = new Map<string, AirportTrafficHeatmapCell>();
    const activeDays = new Set<string>();
    const routeCodes = relevantFlights
      .flatMap((flight) => [flight.origin, flight.destination])
      .filter((code): code is string => code !== null);
    const airports = await resolveTrafficAirports(schema, routeCodes);
    let firstCapturedAt: Date | null = null;
    let lastCapturedAt: Date | null = null;

    for (const flight of relevantFlights) {
      const startTime = timestampAsDate(flight.startTime);
      const lastSeenAt = timestampAsDate(flight.lastSeenAt);
      if (!firstCapturedAt || startTime < firstCapturedAt) firstCapturedAt = startTime;
      const boundedLastSeenAt = new Date(Math.min(lastSeenAt.getTime(), to.getTime()));
      if (!lastCapturedAt || boundedLastSeenAt > lastCapturedAt) lastCapturedAt = boundedLastSeenAt;
      addActiveFlightDays(activeDays, startTime, lastSeenAt, from, to);

      const departure = flightAirportMatch(flight.origin, targetCodeSet);
      const arrival = flightAirportMatch(flight.destination, targetCodeSet);
      if (departure) summary.departures += 1;
      if (arrival) summary.arrivals += 1;
      const cell = heatmapCell(heatmapCells, startTime);
      if (departure) cell.departures += 1;
      if (arrival) cell.arrivals += 1;

      const callsign = normalizedText(flight.callsign);
      if (callsign) addCount(callsigns, callsign);
      mergeAircraftCount(aircraft, flight);

      const destinationCode = normalizedCode(flight.destination);
      if (departure && destinationCode && airports.has(destinationCode)) addCount(destinations, airports.get(destinationCode)!.icaoCode);
      const originCode = normalizedCode(flight.origin);
      if (arrival && originCode && airports.has(originCode)) addCount(origins, airports.get(originCode)!.icaoCode);
    }

    summary.uniqueAircraft = aircraft.size;
    summary.activeDays = activeDays.size;
    summary.firstCapturedAt = firstCapturedAt ? timestampAsIso(firstCapturedAt) : null;
    summary.lastCapturedAt = lastCapturedAt ? timestampAsIso(lastCapturedAt) : null;
    summary.topDestinations = routeCount(destinations, airports);
    summary.topOrigins = routeCount(origins, airports);
    summary.topAircraft = topAircraft(aircraft);
    summary.topCallsigns = topCallsigns(callsigns);
    summary.recentTraffic = recentTraffic(relevantFlights, targetCodeSet, airports);
    const cells = emptyTrafficSummary(range).heatmap.cells.map((emptyCell) => heatmapCells.get(`${emptyCell.dayOfWeek}:${emptyCell.hour}`) ?? emptyCell);
    summary.heatmap = {
      cells,
      maxCount: Math.max(...cells.map((cell) => cell.arrivals + cell.departures), 0),
    };
    return summary;
  } catch (error) {
    if (error instanceof AirportTrafficDatabaseUnavailableError) throw error;
    throw new AirportTrafficDatabaseUnavailableError();
  }
}
