import "temporal-polyfill/full/global";
import { getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import {
  STATISTICS_TRAFFIC_RANKING_LIMIT,
  type StatisticsTrafficRankingItem,
  type StatisticsTrafficRange,
  type StatisticsTrafficResponse,
  type StatisticsTrafficRouteItem,
} from "@/lib/statistics-traffic";

interface FlightCountByAircraftRow {
  aircraftId: number;
  count: number;
}

interface NamedCountRow {
  name: string | null;
  count: number;
}

interface RouteCountRow {
  origin: string | null;
  destination: string | null;
  count: number;
}

interface AircraftMetadataRow {
  id: number;
  registrationCountry: string | null;
  registrationCountryCode: string | null;
  operator?: string | null;
}

export interface StatisticsTrafficRows {
  aircraft: FlightCountByAircraftRow[];
  aircraftTypes: NamedCountRow[];
  airlines: NamedCountRow[];
  routes: RouteCountRow[];
  countries: AircraftMetadataRow[];
}

export interface StatisticsTrafficBounds {
  from: Temporal.Instant;
  to: Temporal.Instant;
  fromKey: string;
  toKey: string;
}

function rangeDays(range: StatisticsTrafficRange): number {
  return range === "30d" ? 30 : range === "7d" ? 7 : 1;
}

export function statisticsTrafficBounds(
  range: StatisticsTrafficRange,
  now: Date,
  timezone = getAppTimezone(),
): StatisticsTrafficBounds {
  const current = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timezone);
  const from = current.startOfDay().subtract({ days: rangeDays(range) - 1 });
  return {
    from: from.toInstant(),
    to: current.toInstant(),
    fromKey: from.toPlainDate().toString(),
    toKey: current.toPlainDate().toString(),
  };
}

function normalizeName(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeCode(value: string | null | undefined): string | null {
  return normalizeName(value)?.toUpperCase() ?? null;
}

function countValue(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function ranking(entries: Iterable<[string, number]>): StatisticsTrafficRankingItem[] {
  return [...entries]
    .map(([name, count]) => ({ name, count: countValue(count) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, STATISTICS_TRAFFIC_RANKING_LIMIT);
}

function rankingFromRows(rows: NamedCountRow[]): StatisticsTrafficRankingItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + countValue(row.count));
  }
  return ranking(counts);
}

function countryLabel(row: AircraftMetadataRow): string | null {
  const code = normalizeCode(row.registrationCountryCode);
  const country = normalizeName(row.registrationCountry);
  if (code && country && code.localeCompare(country, undefined, { sensitivity: "accent" }) !== 0) return `${code} · ${country}`;
  return code ?? country;
}

export function aggregateStatisticsTrafficRows(options: {
  range: StatisticsTrafficRange;
  now: Date;
  timezone: string;
  rows: StatisticsTrafficRows;
}): StatisticsTrafficResponse {
  const bounds = statisticsTrafficBounds(options.range, options.now, options.timezone);
  const aircraftCounts = new Map<number, number>();
  let observedFlights = 0;
  for (const row of options.rows.aircraft) {
    const count = countValue(row.count);
    if (!Number.isInteger(row.aircraftId) || row.aircraftId <= 0 || count <= 0) continue;
    aircraftCounts.set(row.aircraftId, (aircraftCounts.get(row.aircraftId) ?? 0) + count);
    observedFlights += count;
  }

  const routeCounts = new Map<string, StatisticsTrafficRouteItem>();
  const originCounts = new Map<string, number>();
  const destinationCounts = new Map<string, number>();
  for (const row of options.rows.routes) {
    const count = countValue(row.count);
    if (count <= 0) continue;
    const origin = normalizeCode(row.origin);
    const destination = normalizeCode(row.destination);
    if (origin) originCounts.set(origin, (originCounts.get(origin) ?? 0) + count);
    if (destination) destinationCounts.set(destination, (destinationCounts.get(destination) ?? 0) + count);
    if (!origin || !destination) continue;
    const key = `${origin}:${destination}`;
    const current = routeCounts.get(key);
    if (current) current.count += count;
    else routeCounts.set(key, { origin, destination, count });
  }

  const countries = new Map<string, number>();
  const operators = new Map<string, number>();
  for (const aircraft of options.rows.countries) {
    const flightCount = aircraftCounts.get(aircraft.id) ?? 0;
    if (flightCount <= 0) continue;
    const label = countryLabel(aircraft);
    if (label) countries.set(label, (countries.get(label) ?? 0) + flightCount);
    const operator = normalizeName(aircraft.operator);
    if (operator) operators.set(operator, (operators.get(operator) ?? 0) + flightCount);
  }

  return {
    source: "postgres",
    range: options.range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone: options.timezone,
    generatedAt: options.now.toISOString(),
    observedFlights,
    topAircraftTypes: rankingFromRows(options.rows.aircraftTypes),
    topAirlines: rankingFromRows(options.rows.airlines),
    topOperators: ranking(operators),
    topRoutes: [...routeCounts.values()]
      .sort((a, b) => b.count - a.count || `${a.origin}:${a.destination}`.localeCompare(`${b.origin}:${b.destination}`))
      .slice(0, STATISTICS_TRAFFIC_RANKING_LIMIT),
    topOrigins: ranking(originCounts),
    topDestinations: ranking(destinationCounts),
    registrationCountries: ranking(countries),
  };
}

function unavailableTraffic(range: StatisticsTrafficRange, now: Date, timezone: string): StatisticsTrafficResponse {
  const bounds = statisticsTrafficBounds(range, now, timezone);
  return {
    source: "unavailable",
    range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone,
    generatedAt: now.toISOString(),
    observedFlights: null,
    topAircraftTypes: [],
    topAirlines: [],
    topOperators: [],
    topRoutes: [],
    topOrigins: [],
    topDestinations: [],
    registrationCountries: [],
  };
}

/**
 * Read persisted receiver-observed Flight instances only. The four Flight
 * queries are date-bounded to at most 30 local days and run in parallel. The
 * final Aircraft lookup labels registration countries and durable catalog
 * operators. This function never reads FlightPosition.
 */
export async function getStatisticsTraffic(
  range: StatisticsTrafficRange,
  now = new Date(),
  timezone = getAppTimezone(),
): Promise<StatisticsTrafficResponse> {
  const database = getPrisma();
  if (!database) return unavailableTraffic(range, now, timezone);
  const bounds = statisticsTrafficBounds(range, now, timezone);
  const schema = database.orm.public;
  const boundedFlights = () => schema.Flight
    .where((flight) => flight.startTime.gte(bounds.from))
    .where((flight) => flight.startTime.lte(bounds.to));

  try {
    const [aircraft, aircraftTypesRaw, airlinesRaw, routes] = await Promise.all([
      boundedFlights().groupBy("aircraftId").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<FlightCountByAircraftRow[]>,
      boundedFlights().groupBy("aircraftType").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<Array<{ aircraftType: string | null; count: number }>>,
      boundedFlights().groupBy("airline").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<Array<{ airline: string | null; count: number }>>,
      boundedFlights().groupBy("origin", "destination").aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<RouteCountRow[]>,
    ]);
    const aircraftIds = aircraft.map((row) => row.aircraftId).filter((id) => Number.isInteger(id) && id > 0);
    const countries = aircraftIds.length
      ? await schema.Aircraft
          .where((row) => row.id.in(aircraftIds))
          .select("id", "registrationCountry", "registrationCountryCode", "operator")
          .all() as AircraftMetadataRow[]
      : [];

    return aggregateStatisticsTrafficRows({
      range,
      now,
      timezone,
      rows: {
        aircraft,
        aircraftTypes: aircraftTypesRaw.map((row) => ({ name: row.aircraftType, count: row.count })),
        airlines: airlinesRaw.map((row) => ({ name: row.airline, count: row.count })),
        routes,
        countries,
      },
    });
  } catch (error) {
    console.error("AirRadar statistics traffic query failed", error);
    return unavailableTraffic(range, now, timezone);
  }
}
