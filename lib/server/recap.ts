import "temporal-polyfill/full/global";
import type { ReceiverRecapComparison, ReceiverRecapResponse, RecapInterestingItem, RecapRankingItem, RecapRouteItem, ReceiverReceptionRecord } from "@/lib/aircraft/types";
import type { ReceiverDailyReceptionRecord } from "@/lib/server/statistics";
import { dayKey, getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { listAlertHistory } from "@/lib/server/alert-history";
import { getReceptionRecords } from "@/lib/server/reception-records";

const RECAP_RANKING_LIMIT = 5;
const RECAP_INTERESTING_LIMIT = 8;

type RecapRange = "daily" | "weekly";

interface RecapFlightRow {
  id: number;
  aircraftId: number;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  origin: string | null;
  destination: string | null;
  startTime: Temporal.Instant | Date;
  lastSeenAt: Temporal.Instant | Date;
}

interface RecapFlightAggregate {
  aircraftId: number;
  count: number;
}

interface RecapRouteAggregate {
  origin: string | null;
  destination: string | null;
  count: number;
}

interface RecapTypeAggregate {
  aircraftType: string | null;
  count: number;
}

interface RecapLifetimeRow {
  startTime: Temporal.Instant | Date;
  lastSeenAt: Temporal.Instant | Date;
}

interface RecapAircraftRow {
  id: number;
  icaoHex: string;
  registration: string | null;
  aircraftType: string | null;
  flights: {
    first: RecapLifetimeRow[];
    recent: RecapFlightRow[];
    total: number;
  };
}

interface RecapDailyStatsRow {
  date: string;
  uniqueAircraftCount: number;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
}

interface RecapDailyAircraftRow {
  date: string;
  icaoHex: string;
  aircraftType: string | null;
}

function timestamp(value: Temporal.Instant | Date): Date {
  return value instanceof Date ? value : new Date(value.epochMilliseconds);
}

function localDayStart(date: Date, daysBefore = 0): Date {
  const zoned = Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(getAppTimezone()).startOfDay();
  return new Date(zoned.subtract({ days: daysBefore }).toInstant().epochMilliseconds);
}

export function recapPeriodBounds(range: RecapRange, now: Date): { from: Date; to: Date; fromKey: string; toKey: string; isCurrentDay: boolean } {
  const todayStart = localDayStart(now);
  const from = range === "daily" ? todayStart : localDayStart(now, 6);
  const to = new Date(Temporal.Instant.fromEpochMilliseconds(todayStart.getTime()).toZonedDateTimeISO(getAppTimezone()).add({ days: 1 }).toInstant().epochMilliseconds);
  return { from, to, fromKey: dayKey(from), toKey: dayKey(new Date(to.getTime() - 1)), isCurrentDay: range === "daily" };
}

function previousBounds(range: RecapRange, now: Date): { from: Date; to: Date } {
  const current = recapPeriodBounds(range, now);
  const days = range === "daily" ? 1 : 7;
  return { from: localDayStart(current.from, days), to: current.from };
}

function finite(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? Math.max(0, value) : null;
}

function increment(map: Map<string, number>, value: string | null | undefined): void {
  const key = value?.trim().toUpperCase();
  if (key) map.set(key, (map.get(key) ?? 0) + 1);
}

function rankings(map: Map<string, number>): RecapRankingItem[] {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, RECAP_RANKING_LIMIT);
}

function aggregateRoutes(routes: RecapRouteAggregate[]): RecapRouteItem[] {
  return routes
    .flatMap((route) => {
      const origin = route.origin?.trim().toUpperCase();
      const destination = route.destination?.trim().toUpperCase();
      return origin && destination ? [{ origin, destination, count: route.count }] : [];
    })
    .sort((a, b) => b.count - a.count || `${a.origin}:${a.destination}`.localeCompare(`${b.origin}:${b.destination}`))
    .slice(0, RECAP_RANKING_LIMIT);
}

function emptyComparison(): ReceiverRecapComparison {
  return { hasData: false, uniqueAircraft: null, observedFlights: null, maxDistanceKm: null };
}

function emptyRecap(range: RecapRange, now: Date, source: ReceiverRecapResponse["source"]): ReceiverRecapResponse {
  const bounds = recapPeriodBounds(range, now);
  return {
    source,
    range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone: getAppTimezone(),
    isCurrentDay: bounds.isCurrentDay,
    hasData: false,
    uniqueAircraft: null,
    observedFlights: null,
    newAircraft: null,
    rareOrReturning: null,
    maxDistanceKm: null,
    coverageKm: null,
    topAircraftTypes: [],
    topRoutes: [],
    interestingAircraft: [],
    bestReception: null,
    alertCount: null,
    comparison: range === "weekly" ? emptyComparison() : null,
  };
}

interface RecapRows {
  stats: RecapDailyStatsRow[];
  aircraft: RecapDailyAircraftRow[];
  flightAggregates: RecapFlightAggregate[];
  routeAggregates: RecapRouteAggregate[];
  typeAggregates: RecapTypeAggregate[];
  aircraftRows: RecapAircraftRow[];
}

async function loadRows(schema: NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"], from: Date, to: Date, includeLifetime = true): Promise<RecapRows> {
  const fromInstant = Temporal.Instant.fromEpochMilliseconds(from.getTime());
  const toInstant = Temporal.Instant.fromEpochMilliseconds(to.getTime());
  const stats = await schema.ReceiverDailyStats
    .where((row) => row.date.gte(dayKey(from)))
    .where((row) => row.date.lt(dayKey(to)))
    .all() as RecapDailyStatsRow[];
  const aircraft = await schema.ReceiverDailyAircraft
    .where((row) => row.date.gte(dayKey(from)))
    .where((row) => row.date.lt(dayKey(to)))
    .select("date", "icaoHex", "aircraftType")
    .all() as RecapDailyAircraftRow[];
  const flightAggregates = await schema.Flight
    .where((row) => row.startTime.gte(fromInstant))
    .where((row) => row.startTime.lt(toInstant))
    .groupBy("aircraftId")
    .aggregate((aggregate) => ({ count: aggregate.count() })) as RecapFlightAggregate[];
  const [routeAggregates, typeAggregates] = await Promise.all([
    schema.Flight
      .where((row) => row.startTime.gte(fromInstant))
      .where((row) => row.startTime.lt(toInstant))
      .groupBy("origin", "destination")
      .aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<RecapRouteAggregate[]>,
    schema.Flight
      .where((row) => row.startTime.gte(fromInstant))
      .where((row) => row.startTime.lt(toInstant))
      .groupBy("aircraftType")
      .aggregate((aggregate) => ({ count: aggregate.count() })) as Promise<RecapTypeAggregate[]>,
  ]);
  const aircraftIds = flightAggregates.map((flight) => flight.aircraftId);
  let aircraftRows: RecapAircraftRow[] = [];
  if (aircraftIds.length) {
    const aircraftQuery = schema.Aircraft
      .where((aircraft) => aircraft.id.in(aircraftIds))
      .select("id", "icaoHex", "registration", "aircraftType");
    if (includeLifetime) {
      // Each aircraft contributes at most three lifetime rows to the
      // application: first, latest, and previous. The database still owns
      // the full history and uses the (aircraftId, startTime) index.
      aircraftRows = await aircraftQuery
        .include("flights", (flights) => flights.combine({
          first: flights
            .orderBy([(flight) => flight.startTime.asc(), (flight) => flight.id.asc()])
            .limit(1)
            .select("startTime", "lastSeenAt"),
          recent: flights
            .orderBy([(flight) => flight.startTime.desc(), (flight) => flight.id.desc()])
            .limit(2)
            .select("id", "callsign", "registration", "aircraftType", "origin", "destination", "startTime", "lastSeenAt"),
          total: flights.count(),
        }))
        .all() as unknown as RecapAircraftRow[];
    } else {
      aircraftRows = await aircraftQuery.all() as unknown as RecapAircraftRow[];
    }
  }
  return { stats, aircraft, flightAggregates, routeAggregates, typeAggregates, aircraftRows };
}

function mergeCurrentDay(rows: { stats: RecapDailyStatsRow[]; aircraft: RecapDailyAircraftRow[] }, currentDay: {
  date: string;
  uniqueAircraftCount: number;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
  aircraft: Array<{ icaoHex: string; aircraftType: string | null }>;
} | undefined): void {
  if (!currentDay) return;
  const existing = rows.stats.find((row) => row.date === currentDay.date);
  if (existing) {
    existing.uniqueAircraftCount = Math.max(existing.uniqueAircraftCount, currentDay.uniqueAircraftCount);
    existing.maxConcurrentAircraft = Math.max(existing.maxConcurrentAircraft, currentDay.maxConcurrentAircraft);
    existing.maxDistanceKm = Math.max(existing.maxDistanceKm, currentDay.maxDistanceKm);
  } else {
    rows.stats.push({ date: currentDay.date, uniqueAircraftCount: currentDay.uniqueAircraftCount, maxConcurrentAircraft: currentDay.maxConcurrentAircraft, maxDistanceKm: currentDay.maxDistanceKm });
  }
  const known = new Set(rows.aircraft.filter((item) => item.date === currentDay.date).map((item) => item.icaoHex.toUpperCase()));
  for (const item of currentDay.aircraft) {
    if (known.has(item.icaoHex.toUpperCase())) continue;
    rows.aircraft.push({ date: currentDay.date, icaoHex: item.icaoHex, aircraftType: item.aircraftType });
  }
}

function compareRows(rows: RecapRows): ReceiverRecapComparison {
  const unique = new Set(rows.aircraft.map((item) => item.icaoHex.toUpperCase()));
  for (const aircraft of rows.aircraftRows) unique.add(aircraft.icaoHex.toUpperCase());
  const maxDistance = rows.stats.map((row) => finite(row.maxDistanceKm)).filter((value): value is number => value !== null);
  const observedFlights = rows.flightAggregates.reduce((total, flight) => total + flight.count, 0);
  const hasData = unique.size > 0 || observedFlights > 0 || rows.stats.length > 0;
  return {
    hasData,
    uniqueAircraft: hasData ? unique.size : null,
    observedFlights: hasData ? observedFlights : null,
    maxDistanceKm: maxDistance.length ? Math.max(...maxDistance) : null,
  };
}

async function buildPeriod(
  schema: NonNullable<ReturnType<typeof getPrisma>>["orm"]["public"],
  range: RecapRange,
  now: Date,
  currentDay?: { date: string; uniqueAircraftCount: number; maxConcurrentAircraft: number; maxDistanceKm: number; aircraft: Array<{ icaoHex: string; aircraftType: string | null }> },
  todayRecord?: ReceiverDailyReceptionRecord | null,
): Promise<{ response: ReceiverRecapResponse; rows: RecapRows }> {
  const bounds = recapPeriodBounds(range, now);
  const rows = await loadRows(schema, bounds.from, bounds.to);
  mergeCurrentDay(rows, currentDay && currentDay.date >= bounds.fromKey && currentDay.date <= bounds.toKey ? currentDay : undefined);
  const unique = new Set(rows.aircraft.map((item) => item.icaoHex.trim().toUpperCase()).filter(Boolean));
  for (const aircraft of rows.aircraftRows) unique.add(aircraft.icaoHex.trim().toUpperCase());
  const types = new Map<string, number>();
  for (const item of rows.aircraft) increment(types, item.aircraftType);
  for (const type of rows.typeAggregates) {
    if (type.aircraftType) {
      const key = type.aircraftType.trim().toUpperCase();
      types.set(key, (types.get(key) ?? 0) + type.count);
    }
  }
  const maxDistances = rows.stats.map((row) => finite(row.maxDistanceKm)).filter((value): value is number => value !== null);
  const observedFlights = rows.flightAggregates.reduce((total, flight) => total + flight.count, 0);
  const hasData = unique.size > 0 || observedFlights > 0 || rows.stats.length > 0;
  const interesting: RecapInterestingItem[] = [];
  const seenInteresting = new Set<string>();
  for (const aircraft of rows.aircraftRows) {
    const first = aircraft.flights.first[0];
    const latest = aircraft.flights.recent[0];
    const previous = aircraft.flights.recent[1];
    if (!latest) continue;
    const firstStart = first ? timestamp(first.startTime) : null;
    const reasons: Array<{ reason: RecapInterestingItem["reason"]; priority: number }> = [];
    if (firstStart && dayKey(firstStart) >= bounds.fromKey && dayKey(firstStart) <= bounds.toKey) reasons.push({ reason: "new", priority: 10 });
    if (aircraft.flights.total > 0 && aircraft.flights.total <= 3 && !(firstStart && dayKey(firstStart) >= bounds.fromKey && dayKey(firstStart) <= bounds.toKey)) reasons.push({ reason: "rare", priority: 3 });
    if (previous && Math.floor((timestamp(latest.startTime).getTime() - timestamp(previous.lastSeenAt).getTime()) / 86_400_000) >= 30) reasons.push({ reason: "returning", priority: 4 });
    for (const item of reasons.sort((a, b) => b.priority - a.priority)) {
      const key = `${aircraft.icaoHex}:${item.reason}`;
      if (seenInteresting.has(key)) continue;
      seenInteresting.add(key);
      interesting.push({ icaoHex: aircraft.icaoHex.trim().toUpperCase(), callsign: latest.callsign, registration: latest.registration ?? aircraft.registration, reason: item.reason });
    }
  }
  interesting.sort((a, b) => a.reason.localeCompare(b.reason) || a.icaoHex.localeCompare(b.icaoHex));
  const reception = await getReceptionRecords(todayRecord ?? null);
  const bestReception = [...reception.top, reception.today]
    .filter((record): record is ReceiverReceptionRecord => record !== null && record.date >= bounds.fromKey && record.date <= bounds.toKey)
    .sort((a, b) => b.distanceKm - a.distanceKm)[0] ?? null;
  const alerts = await listAlertHistory({ pageSize: 100 });
  const alertCount = alerts.items.filter((item) => dayKey(new Date(item.detectedAt)) >= bounds.fromKey && dayKey(new Date(item.detectedAt)) <= bounds.toKey).length;
  const response: ReceiverRecapResponse = {
    source: "postgres",
    range,
    from: bounds.fromKey,
    to: bounds.toKey,
    timezone: getAppTimezone(),
    isCurrentDay: bounds.isCurrentDay,
    hasData,
    uniqueAircraft: hasData ? unique.size : null,
    observedFlights: hasData ? observedFlights : null,
    newAircraft: hasData ? new Set(interesting.filter((item) => item.reason === "new").map((item) => item.icaoHex)).size : null,
    rareOrReturning: hasData ? new Set(interesting.filter((item) => item.reason === "rare" || item.reason === "returning").map((item) => item.icaoHex)).size : null,
    maxDistanceKm: maxDistances.length ? Math.max(...maxDistances) : null,
    coverageKm: maxDistances.length ? Math.max(...maxDistances) : null,
    topAircraftTypes: rankings(types),
    topRoutes: aggregateRoutes(rows.routeAggregates),
    interestingAircraft: interesting.slice(0, RECAP_INTERESTING_LIMIT),
    bestReception,
    alertCount,
    comparison: null,
  };
  return { response, rows };
}

export async function getReceiverRecap(
  range: RecapRange,
  options: { now?: Date; currentDay?: { date: string; uniqueAircraftCount: number; maxConcurrentAircraft: number; maxDistanceKm: number; aircraft: Array<{ icaoHex: string; aircraftType: string | null }> }; todayRecord?: ReceiverDailyReceptionRecord | null } = {},
): Promise<ReceiverRecapResponse> {
  const now = options.now ?? new Date();
  const database = getPrisma();
  if (!database) return emptyRecap(range, now, "unavailable");
  try {
    const current = await buildPeriod(database.orm.public, range, now, options.currentDay, options.todayRecord);
    if (range === "weekly") {
      const previous = await loadRows(database.orm.public, previousBounds(range, now).from, previousBounds(range, now).to, false);
      current.response.comparison = compareRows(previous);
    }
    return current.response;
  } catch (error) {
    console.error("AirRadar recap load failed", error);
    return emptyRecap(range, now, "unavailable");
  }
}
