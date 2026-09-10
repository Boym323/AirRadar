import type { AircraftView } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPrisma } from "@/lib/server/db";
import type { AirportDatabaseRow } from "@/lib/server/airport-resolver";
import {
  GLOBAL_SEARCH_RESULT_LIMIT,
  MAX_GLOBAL_SEARCH_QUERY_LENGTH,
  MIN_GLOBAL_SEARCH_QUERY_LENGTH,
  type AircraftSearchResult,
  type AirportSearchResult,
  type GlobalSearchResponse,
} from "@/lib/search/types";

export type SearchDatabase = NonNullable<ReturnType<typeof getPrisma>>;

export type SearchQueryError = "invalid" | "too_short" | "too_long";

export interface SearchQueryValidation {
  query: string | null;
  error: SearchQueryError | null;
}

export interface SearchOptions {
  aircraft?: readonly AircraftView[];
  database?: SearchDatabase | null;
}

interface MatchScore {
  tier: 0 | 1 | 2 | 3;
  field: number;
}

interface Scored<T> {
  item: T;
  score: MatchScore;
  identity: string;
}

const AIRPORT_QUERY_LIMIT = 12;

/**
 * Validates the public search query before either the live snapshot or the
 * airport catalog is touched. Wildcard characters are removed so an input
 * cannot turn an ORM ILIKE filter into an unbounded wildcard search.
 */
export function validateSearchQuery(raw: unknown): SearchQueryValidation {
  if (typeof raw !== "string") return { query: null, error: "invalid" };
  const query = raw.trim().replace(/[\\%_]/g, "").replace(/\s+/g, " ");
  if (query.length < MIN_GLOBAL_SEARCH_QUERY_LENGTH) return { query: null, error: "too_short" };
  if (query.length > MAX_GLOBAL_SEARCH_QUERY_LENGTH) return { query: null, error: "too_long" };
  return { query, error: null };
}

function normalizeMatchValue(value: string): string {
  return value.trim().toUpperCase();
}

function matchScore(query: string, values: readonly (string | null | undefined)[]): MatchScore | null {
  const normalizedQuery = normalizeMatchValue(query);
  let best: MatchScore | null = null;
  values.forEach((value, field) => {
    if (!value?.trim()) return;
    const candidate = normalizeMatchValue(value);
    const tier: MatchScore["tier"] = candidate === normalizedQuery
      ? 0
      : candidate.startsWith(normalizedQuery)
        ? 1
        : candidate.includes(normalizedQuery)
          ? 2
          : 3;
    if (tier === 3) return;
    if (!best || tier < best.tier || (tier === best.tier && field < best.field)) best = { tier, field };
  });
  return best;
}

function compareScored<T>(left: Scored<T>, right: Scored<T>): number {
  return left.score.tier - right.score.tier
    || left.score.field - right.score.field
    || left.identity.localeCompare(right.identity);
}

function compareAnyScored(
  left: Scored<AircraftSearchResult> | Scored<AirportSearchResult>,
  right: Scored<AircraftSearchResult> | Scored<AirportSearchResult>,
): number {
  return left.score.tier - right.score.tier
    || left.score.field - right.score.field
    || left.identity.localeCompare(right.identity);
}

function aircraftMetadata(aircraft: AircraftView) {
  return aircraft.enrichment?.metadata;
}

function aircraftRegistration(aircraft: AircraftView): string | null {
  return aircraft.registration ?? aircraftMetadata(aircraft)?.registration ?? null;
}

function aircraftType(aircraft: AircraftView): string | null {
  const metadata = aircraftMetadata(aircraft);
  return metadata?.aircraftDescription
    ?? aircraft.aircraftDescription
    ?? metadata?.aircraftType
    ?? aircraft.aircraftType
    ?? null;
}

function aircraftSearchFields(aircraft: AircraftView): (string | null | undefined)[] {
  const metadata = aircraftMetadata(aircraft);
  return [
    aircraft.icaoHex,
    aircraftRegistration(aircraft),
    aircraft.callsign,
    aircraftType(aircraft),
    metadata?.icaoTypeCode,
    metadata?.manufacturer,
    metadata?.operator,
  ];
}

function toAircraftResult(aircraft: AircraftView): AircraftSearchResult {
  const metadata = aircraftMetadata(aircraft);
  return {
    kind: "aircraft",
    icaoHex: aircraft.icaoHex,
    registration: aircraftRegistration(aircraft),
    callsign: aircraft.callsign,
    aircraftType: aircraftType(aircraft),
    manufacturer: metadata?.manufacturer ?? null,
    href: `/aircraft/${encodeURIComponent(aircraft.icaoHex)}`,
  };
}

function airportSearchFields(airport: Airport): (string | null)[] {
  return [airport.icaoCode, airport.iataCode, airport.name, airport.city];
}

function toAirportResult(airport: Airport): AirportSearchResult {
  return {
    kind: "airport",
    icaoCode: airport.icaoCode,
    iataCode: airport.iataCode,
    name: airport.name,
    city: airport.city,
    href: `/airports/${encodeURIComponent(airport.icaoCode)}`,
  };
}

function rankAircraft(aircraft: readonly AircraftView[], query: string): Scored<AircraftSearchResult>[] {
  return aircraft.flatMap((item) => {
    const score = matchScore(query, aircraftSearchFields(item));
    return score ? [{ item: toAircraftResult(item), score, identity: item.icaoHex }] : [];
  }).sort(compareScored);
}

function rankAirports(airports: readonly Airport[], query: string): Scored<AirportSearchResult>[] {
  return airports.flatMap((item) => {
    const score = matchScore(query, airportSearchFields(item));
    return score ? [{ item: toAirportResult(item), score, identity: item.icaoCode }] : [];
  }).sort(compareScored);
}

function airportFromDatabase(row: AirportDatabaseRow | null): Airport | null {
  if (!row || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;
  if (!/^[A-Z]{4}$/i.test(row.icao)) return null;
  const airport: Airport = {
    icaoCode: row.icao.trim().toUpperCase(),
    iataCode: row.iata?.trim() ? row.iata.trim().toUpperCase() : null,
    name: row.name,
    city: row.city,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
  };
  if (row.type !== undefined) airport.type = row.type;
  if (row.elevationFt !== undefined) airport.elevationFt = row.elevationFt;
  if (row.scheduledService !== undefined) airport.scheduledService = row.scheduledService;
  if (row.region !== undefined) airport.region = row.region;
  if (row.localCode !== undefined) airport.localCode = row.localCode;
  return airport;
}

function airportRowsToCatalog(rows: readonly AirportDatabaseRow[]): Airport[] {
  const unique = new Map<string, Airport>();
  for (const row of rows) {
    const airport = airportFromDatabase(row);
    if (airport) unique.set(airport.icaoCode, airport);
  }
  return [...unique.values()];
}

async function queryAirportCatalog(database: SearchDatabase, query: string): Promise<Airport[]> {
  const table = database.orm.public.Airport;
  const normalizedQuery = normalizeMatchValue(query);
  const prefix = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;
  const rows = await Promise.all([
    table.where({ icao: normalizedQuery }).limit(1).all(),
    table.where({ iata: normalizedQuery }).limit(1).all(),
    table.where((airport) => airport.icao.ilike(prefix)).limit(AIRPORT_QUERY_LIMIT).all(),
    table.where((airport) => airport.iata.ilike(prefix)).limit(AIRPORT_QUERY_LIMIT).all(),
    table.where((airport) => airport.name.ilike(prefix)).limit(AIRPORT_QUERY_LIMIT).all(),
    table.where((airport) => airport.city.ilike(prefix)).limit(AIRPORT_QUERY_LIMIT).all(),
    table.where((airport) => airport.icao.ilike(contains)).limit(AIRPORT_QUERY_LIMIT).all(),
    table.where((airport) => airport.iata.ilike(contains)).limit(AIRPORT_QUERY_LIMIT).all(),
    table.where((airport) => airport.name.ilike(contains)).limit(AIRPORT_QUERY_LIMIT).all(),
    table.where((airport) => airport.city.ilike(contains)).limit(AIRPORT_QUERY_LIMIT).all(),
  ]);
  return airportRowsToCatalog(rows.flat());
}

async function loadAirports(query: string, database: SearchDatabase | null): Promise<Airport[]> {
  if (!database) return SAMPLE_AIRPORTS;
  try {
    return await queryAirportCatalog(database, query);
  } catch {
    // Airport search is optional. A small known catalog still supports the
    // common demo/Prague links when PostgreSQL is unavailable.
    return SAMPLE_AIRPORTS;
  }
}

function emptySearchResponse(query = ""): GlobalSearchResponse {
  return { query, aircraft: [], airports: [] };
}

export async function searchGlobal(rawQuery: unknown, options: SearchOptions = {}): Promise<GlobalSearchResponse> {
  const validation = validateSearchQuery(rawQuery);
  if (!validation.query) return emptySearchResponse();

  let aircraft = options.aircraft;
  if (!aircraft) {
    const service = getAircraftStateService();
    await service.waitForReady();
    aircraft = service.getSnapshot().aircraft;
  }
  let database = options.database;
  if (database === undefined) {
    try {
      database = getPrisma();
    } catch {
      database = null;
    }
  }
  const [rankedAircraft, rankedAirports] = await Promise.all([
    Promise.resolve(rankAircraft(aircraft, validation.query)),
    loadAirports(validation.query, database).then((items) => rankAirports(items, validation.query!)),
  ]);
  const selected = [...rankedAircraft, ...rankedAirports].sort(compareAnyScored).slice(0, GLOBAL_SEARCH_RESULT_LIMIT);
  return {
    query: validation.query,
    aircraft: selected.filter((result): result is Scored<AircraftSearchResult> => result.item.kind === "aircraft").map((result) => result.item),
    airports: selected.filter((result): result is Scored<AirportSearchResult> => result.item.kind === "airport").map((result) => result.item),
  };
}
