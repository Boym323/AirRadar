import "temporal-polyfill/full/global";
import { getPrisma } from "@/lib/server/db";
import type { FlightEventType } from "@/lib/intelligence/types";
import type { HistoricalAircraftTrack } from "@/lib/time-machine/playback";

export const TIME_MACHINE_MAX_WINDOW_MS = 5 * 60_000;
export const TIME_MACHINE_MAX_AIRCRAFT = 500;
export const TIME_MACHINE_MAX_POSITIONS = 40_000;
export const TIME_MACHINE_MAX_EVENTS = 200;

export class TimeMachineDatabaseUnavailableError extends Error { constructor() { super("Historical database unavailable"); } }
export class TimeMachineValidationError extends Error { constructor(message: string) { super(message); } }

export interface TimeMachineEvent { id: string; type: FlightEventType | string; icaoHex: string; flightId: number | null; occurredAt: string; callsign: string | null; registration: string | null; airportIcao: string | null; sectorId: string | null; latitude: number | null; longitude: number | null; }
export interface TimeMachineRange { min: string | null; max: string | null; positions: number | null; }

type PositionRow = { flightId: number; recordedAt: Date | Temporal.Instant; lat: number; lon: number; altitude: number | null; groundSpeed: number | null; track: number | null };
type FlightRow = { id: number; callsign: string | null; registration: string | null; aircraftType: string | null; origin: string | null; destination: string | null; aircraft: { icaoHex: string; registration: string | null; aircraftType: string | null } };
type EventRow = { id?: number; eventKey: string; type: string; icaoHex: string; flightId?: number | null; occurredAt: Date | Temporal.Instant; airportIcao?: string | null; sectorId?: string | null; latitude?: number | null; longitude?: number | null; aircraft?: { registration?: string | null } | null; flight?: { callsign?: string | null } | null };
type QueryField = { gte(value: unknown): unknown; lt(value: unknown): unknown; in?(values: number[]): unknown; asc(): unknown; desc(): unknown; };
type QueryRow = Record<string, QueryField>;
type QueryCollection<T> = { where(predicate: ((row: QueryRow) => unknown) | Record<string, unknown>): QueryCollection<T>; orderBy(order: unknown): QueryCollection<T>; limit(value: number): QueryCollection<T>; include(relation: string, callback: (query: QueryCollection<unknown>) => QueryCollection<unknown>): QueryCollection<T>; select(...fields: string[]): QueryCollection<T>; all(): Promise<T[]> };
type TimeMachineDb = { orm: { public: { FlightPosition: QueryCollection<PositionRow>; Flight: QueryCollection<FlightRow>; FlightEvent: QueryCollection<EventRow> } } };

function asDate(value: Date | Temporal.Instant): Date { return value instanceof Date ? value : new Date(value.epochMilliseconds); }
function iso(value: Date | Temporal.Instant): string { return asDate(value).toISOString(); }
function parseInstant(value: string | null): Date {
  if (!value || !Number.isFinite(Date.parse(value))) throw new TimeMachineValidationError("Invalid timestamp");
  return new Date(value);
}
function bounds(fromValue: string | null, toValue: string | null): { from: Date; to: Date } {
  const from = parseInstant(fromValue); const to = parseInstant(toValue);
  if (to <= from) throw new TimeMachineValidationError("Reversed time range");
  if (to.getTime() - from.getTime() > TIME_MACHINE_MAX_WINDOW_MS) throw new TimeMachineValidationError("Historical window is too large");
  return { from, to };
}

export async function getTimeMachineRange(): Promise<TimeMachineRange> {
  const database = getPrisma() as unknown as TimeMachineDb | null;
  if (!database) throw new TimeMachineDatabaseUnavailableError();
  try {
    const table = database.orm.public.FlightPosition;
    const first = await table.orderBy((row: QueryRow) => row.recordedAt.asc()).limit(1).all();
    const last = await table.orderBy((row: QueryRow) => row.recordedAt.desc()).limit(1).all();
    return { min: first[0] ? iso(first[0].recordedAt) : null, max: last[0] ? iso(last[0].recordedAt) : null, positions: null };
  } catch { throw new TimeMachineDatabaseUnavailableError(); }
}

export async function getTimeMachineWindow(fromValue: string | null, toValue: string | null): Promise<{ windowStart: string; windowEnd: string; aircraft: HistoricalAircraftTrack[]; events: TimeMachineEvent[]; truncated: boolean }> {
  const { from, to } = bounds(fromValue, toValue);
  const database = getPrisma() as unknown as TimeMachineDb | null;
  if (!database) throw new TimeMachineDatabaseUnavailableError();
  try {
    const fromInstant = Temporal.Instant.fromEpochMilliseconds(from.getTime());
    const toInstant = Temporal.Instant.fromEpochMilliseconds(to.getTime());
    const positions = await database.orm.public.FlightPosition
      .where((row: QueryRow) => row.recordedAt.gte(fromInstant))
      .where((row: QueryRow) => row.recordedAt.lt(toInstant))
      .orderBy([(row: QueryRow) => row.recordedAt.asc(), (row: QueryRow) => row.flightId.asc()])
      .limit(TIME_MACHINE_MAX_POSITIONS + 1).all() as PositionRow[];
    const truncated = positions.length > TIME_MACHINE_MAX_POSITIONS;
    const boundedPositions = positions.slice(0, TIME_MACHINE_MAX_POSITIONS);
    const flightIds = [...new Set(boundedPositions.map((row) => row.flightId))].slice(0, TIME_MACHINE_MAX_AIRCRAFT);
    const flights = flightIds.length ? await database.orm.public.Flight
      .where((row: QueryRow) => row.id.in?.(flightIds))
      .include("aircraft", (aircraft: QueryCollection<unknown>) => aircraft.select("icaoHex", "registration", "aircraftType"))
      .limit(TIME_MACHINE_MAX_AIRCRAFT).all() as FlightRow[] : [];
    const byFlight = new Map(flights.map((flight) => [flight.id, flight]));
    const tracks = new Map<string, HistoricalAircraftTrack>();
    for (const position of boundedPositions) {
      const flight = byFlight.get(position.flightId); if (!flight) continue;
      const hex = flight.aircraft.icaoHex.toUpperCase();
      const track = tracks.get(hex) ?? { id: hex, hex, callsign: flight.callsign, registration: flight.registration ?? flight.aircraft.registration, type: flight.aircraftType ?? flight.aircraft.aircraftType, flightId: flight.id, origin: flight.origin, destination: flight.destination, positions: [] };
      track.positions.push({ timestamp: iso(position.recordedAt), lat: position.lat, lon: position.lon, altitude: position.altitude, speed: position.groundSpeed, track: position.track });
      tracks.set(hex, track);
    }
    const events = await getTimeMachineEvents(database, from, to);
    return { windowStart: from.toISOString(), windowEnd: to.toISOString(), aircraft: [...tracks.values()], events, truncated: truncated || flightIds.length > TIME_MACHINE_MAX_AIRCRAFT };
  } catch (error) {
    if (error instanceof TimeMachineValidationError) throw error;
    throw new TimeMachineDatabaseUnavailableError();
  }
}

async function getTimeMachineEvents(database: TimeMachineDb, from: Date, to: Date): Promise<TimeMachineEvent[]> {
  const rows = await database.orm.public.FlightEvent
    .where((row: QueryRow) => row.occurredAt.gte(Temporal.Instant.fromEpochMilliseconds(from.getTime())))
    .where((row: QueryRow) => row.occurredAt.lt(Temporal.Instant.fromEpochMilliseconds(to.getTime())))
    .include("aircraft", (aircraft: QueryCollection<unknown>) => aircraft.select("registration"))
    .include("flight", (flight: QueryCollection<unknown>) => flight.select("callsign"))
    .orderBy((row: QueryRow) => row.occurredAt.asc()).limit(TIME_MACHINE_MAX_EVENTS + 1).all() as EventRow[];
  return rows.slice(0, TIME_MACHINE_MAX_EVENTS).map((row) => ({ id: row.eventKey || String(row.id), type: row.type, icaoHex: row.icaoHex, flightId: row.flightId ?? null, occurredAt: iso(row.occurredAt), callsign: row.flight?.callsign ?? null, registration: row.aircraft?.registration ?? null, airportIcao: row.airportIcao ?? null, sectorId: row.sectorId ?? null, latitude: row.latitude ?? null, longitude: row.longitude ?? null }));
}

export function validateTimeMachineWindow(from: string | null, to: string | null): void { bounds(from, to); }
