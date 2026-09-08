import "temporal-polyfill/full/global";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  getAppTimezone,
  getFlightContinuityGapMs,
  getHistoryRetentionDays,
  getHistorySampleIntervalMs,
} from "@/lib/server/config";
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

export interface AircraftDetailResponse {
  aircraft: AircraftDetailMetadata | null;
  recentFlights: HistoryFlightSummary[];
}

export class HistoryDatabaseUnavailableError extends Error {
  constructor() {
    super("History database unavailable");
    this.name = "HistoryDatabaseUnavailableError";
  }
}

let lastRetentionRunAt = 0;
let lastFlightMaintenanceRunAt = 0;

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

/**
 * Returns durable aircraft metadata and a deliberately small recent-flight
 * summary. FlightPosition is not queried here; playback remains behind the
 * existing per-flight detail endpoint.
 */
export async function getAircraftDetail(icaoHex: string): Promise<AircraftDetailResponse> {
  const database = getPrisma();
  if (!database) throw new HistoryDatabaseUnavailableError();

  try {
    const schema = database.orm.public;
    const aircraft = await schema.Aircraft.where({ icaoHex: icaoHex.toUpperCase() }).first();
    if (!aircraft) return { aircraft: null, recentFlights: [] };

    const flights = await schema.Flight
      .where({ aircraftId: aircraft.id })
      .orderBy([(flight) => flight.startTime.desc(), (flight) => flight.id.desc()])
      .include("aircraft", (relatedAircraft) => relatedAircraft.select("icaoHex", "registration", "aircraftType"))
      .limit(AIRCRAFT_RECENT_FLIGHT_LIMIT)
      .all();

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
