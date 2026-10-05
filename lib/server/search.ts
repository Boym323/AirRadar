import "temporal-polyfill/full/global";
import type { AircraftView } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getPrisma } from "@/lib/server/db";
import type { AirportDatabaseRow } from "@/lib/server/airport-resolver";
import { loadAtAtsRoutes } from "@/lib/ats/at-routes";
import { loadCzAtsRoutes, type CzAtsRouteDocument } from "@/lib/ats/cz-routes";
import { loadSkAtsRoutes } from "@/lib/ats/sk-routes";
import { defaultAviationNavDataProvider } from "@/lib/server/aviation-nav-data-provider";
import { isAviationNavDataEnabled } from "@/lib/server/config";
import type { AviationNavPoint } from "@/lib/navigation-data/types";
import {
  GLOBAL_SEARCH_RESULT_LIMIT,
  MAX_GLOBAL_SEARCH_QUERY_LENGTH,
  MIN_GLOBAL_SEARCH_QUERY_LENGTH,
  type AircraftSearchResult,
  type AirportSearchResult,
  type AtsPointSearchResult,
  type FlightSearchResult,
  type GlobalSearchResponse,
  type NavPointSearchResult,
  type SmartSearchActionResult,
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
  atsDocuments?: readonly (CzAtsRouteDocument | null)[];
  navPoints?: readonly AviationNavPoint[];
  flights?: readonly FlightSearchResult[];
  now?: Date;
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
const FLIGHT_QUERY_LIMIT = 6;
const FLIGHT_SEARCH_MIN_QUERY_LENGTH = 3;
const FLIGHT_SEARCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

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

type RankedSearchResult = Scored<AircraftSearchResult> | Scored<AirportSearchResult> | Scored<AtsPointSearchResult> | Scored<NavPointSearchResult> | Scored<FlightSearchResult>;

function compareAnyScored(left: RankedSearchResult, right: RankedSearchResult): number {
  const tierDifference = left.score.tier - right.score.tier;
  if (tierDifference) return tierDifference;
  const leftHistorical = left.item.kind === "flight";
  const rightHistorical = right.item.kind === "flight";
  if (leftHistorical !== rightHistorical) return leftHistorical ? 1 : -1;
  return left.score.field - right.score.field
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

function toAtsPointResult(point: { id: string; name: string; kind: "DESIGNATED_POINT" | "NAVAID"; latitude: number; longitude: number }, countryCode: string, routeDesignators: string[]): AtsPointSearchResult {
  return {
    kind: "ats-point",
    id: `${countryCode}:${point.id}`,
    name: point.name,
    countryCode,
    pointKind: point.kind,
    routeDesignators,
    latitude: point.latitude,
    longitude: point.longitude,
    href: `/?atsPoint=${encodeURIComponent(`${countryCode}:${point.name}`)}`,
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

function rankAtsPoints(documents: readonly (CzAtsRouteDocument | null)[], query: string): Scored<AtsPointSearchResult>[] {
  const points = new Map<string, { point: { id: string; name: string; kind: "DESIGNATED_POINT" | "NAVAID"; latitude: number; longitude: number }; countryCode: string; routeDesignators: Set<string> }>();
  for (const document of documents) {
    if (!document) continue;
    const countryCode = document.source.countryCode ?? "CZ";
    for (const route of document.routes) for (const point of route.points) {
      const key = `${countryCode}:${point.name}:${point.latitude}:${point.longitude}`;
      const existing = points.get(key);
      if (existing) existing.routeDesignators.add(route.designator);
      else points.set(key, { point, countryCode, routeDesignators: new Set([route.designator]) });
    }
  }
  return [...points.values()].flatMap(({ point, countryCode, routeDesignators }) => {
    const score = matchScore(query, [point.name, ...routeDesignators]);
    return score ? [{ item: toAtsPointResult(point, countryCode, [...routeDesignators].sort()), score, identity: `${countryCode}:${point.name}` }] : [];
  }).sort(compareScored);
}

function toNavPointResult(point: AviationNavPoint): NavPointSearchResult {
  const focus = [point.kind, point.id, point.latitude.toFixed(6), point.longitude.toFixed(6)].join(":");
  return {
    kind: "nav-point",
    id: `${point.kind}:${point.id}:${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`,
    name: point.name || point.id,
    pointKind: point.kind,
    type: point.type,
    countryCode: point.country,
    latitude: point.latitude,
    longitude: point.longitude,
    frequencyMhz: point.frequencyMhz,
    href: `/?navPoint=${encodeURIComponent(focus)}`,
  };
}

function rankNavPoints(points: readonly AviationNavPoint[], query: string): Scored<NavPointSearchResult>[] {
  return points.flatMap((point) => {
    const score = matchScore(query, [point.id, point.name, point.type]);
    return score ? [{
      item: toNavPointResult(point),
      score,
      identity: `${point.kind}:${point.id}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`,
    }] : [];
  }).sort(compareScored);
}

async function loadNavPoints(query: string, supplied: readonly AviationNavPoint[] | undefined): Promise<AviationNavPoint[]> {
  if (supplied) return [...supplied];
  if (!isAviationNavDataEnabled()) return [];
  const normalized = normalizeMatchValue(query);
  if (!/^[A-Z0-9]{2,8}$/.test(normalized)) return [];
  try {
    return await defaultAviationNavDataProvider.searchIdentifiers([normalized]);
  } catch {
    return [];
  }
}

function timestampIso(value: Temporal.Instant | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : value.toString();
}

function flightSearchFields(flight: FlightSearchResult): (string | null)[] {
  return [
    flight.callsign,
    flight.registration,
    flight.icaoHex,
    flight.origin,
    flight.destination,
    flight.aircraftType,
  ];
}

async function queryRecentFlights(database: SearchDatabase, query: string, now: Date): Promise<FlightSearchResult[]> {
  if (query.trim().length < FLIGHT_SEARCH_MIN_QUERY_LENGTH) return [];
  const schema = database.orm.public;
  const normalized = normalizeMatchValue(query);
  const prefix = `${normalized}%`;
  const from = Temporal.Instant.fromEpochMilliseconds(now.getTime() - FLIGHT_SEARCH_WINDOW_MS);
  const base = () => schema.Flight.where((flight) => flight.startTime.gte(from));
  const execute = async (flightQuery: ReturnType<typeof base>) => await flightQuery
    .orderBy([(flight) => flight.startTime.desc(), (flight) => flight.id.desc()])
    .include("aircraft", (aircraft) => aircraft.select("icaoHex", "registration", "aircraftType"))
    .limit(FLIGHT_QUERY_LIMIT)
    .all();
  const rows = await Promise.all([
    execute(base().where((flight) => flight.callsign.ilike(prefix))),
    execute(base().where((flight) => flight.registration.ilike(prefix))),
    execute(base().where((flight) => flight.origin.ilike(prefix))),
    execute(base().where((flight) => flight.destination.ilike(prefix))),
    execute(base().where((flight) => flight.aircraft.some((aircraft) => aircraft.icaoHex.ilike(prefix)))),
    execute(base().where((flight) => flight.aircraft.some((aircraft) => aircraft.registration.ilike(prefix)))),
  ]);
  const unique = new Map<number, FlightSearchResult>();
  for (const row of rows.flat()) {
    unique.set(row.id, {
      kind: "flight",
      id: row.id,
      icaoHex: row.aircraft.icaoHex,
      callsign: row.callsign,
      registration: row.registration ?? row.aircraft.registration,
      aircraftType: row.aircraftType ?? row.aircraft.aircraftType,
      origin: row.origin,
      destination: row.destination,
      startTime: timestampIso(row.startTime),
      href: `/flights/${row.id}`,
    });
  }
  return [...unique.values()];
}

async function loadRecentFlights(query: string, database: SearchDatabase | null, now: Date): Promise<FlightSearchResult[]> {
  if (!database || query.trim().length < FLIGHT_SEARCH_MIN_QUERY_LENGTH) return [];
  try {
    return await queryRecentFlights(database, query, now);
  } catch {
    return [];
  }
}

function rankFlights(flights: readonly FlightSearchResult[], query: string): Scored<FlightSearchResult>[] {
  return flights.flatMap((item) => {
    const score = matchScore(query, flightSearchFields(item));
    return score ? [{ item, score, identity: String(item.id).padStart(12, "0") }] : [];
  }).sort(compareScored);
}

function normalizeIntentQuery(query: string): string {
  return query.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function smartSearchActions(query: string): SmartSearchActionResult[] {
  const normalized = normalizeIntentQuery(query);
  if (/^GO[ -]?AROUNDS?( (TODAY|DNES))?$/.test(normalized)) {
    return [{ kind: "action", intent: "go_arounds_today", airportIcao: null, href: "/recap/daily#operational-events" }];
  }
  if (/^(RARE AIRCRAFT|VZACNA LETADLA)( (TODAY|DNES))?$/.test(normalized)) {
    return [{ kind: "action", intent: "rare_aircraft_today", airportIcao: null, href: "/recap/daily#interesting-aircraft" }];
  }
  const airportOperations = normalized.match(/^([A-Z]{4}) (OPERATIONS|OPS|PROVOZ)$/)
    ?? normalized.match(/^(OPERATIONS|OPS|PROVOZ) ([A-Z]{4})$/);
  if (airportOperations) {
    const airportIcao = airportOperations[1]?.length === 4 ? airportOperations[1] : airportOperations[2]!;
    return [{ kind: "action", intent: "airport_operations", airportIcao, href: `/airports/${airportIcao}#airport-intelligence-v3` }];
  }
  const flightsTo = normalized.match(/^(FLIGHTS|LETY) (TO|DO) ([A-Z]{4})$/);
  if (flightsTo) {
    const airportIcao = flightsTo[3]!;
    return [{ kind: "action", intent: "flights_to_airport", airportIcao, href: `/flights?range=7d&destination=${airportIcao}` }];
  }
  return [];
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
  return { query, aircraft: [], airports: [], atsPoints: [], navPoints: [], flights: [], actions: [] };
}

export async function searchGlobal(rawQuery: unknown, options: SearchOptions = {}): Promise<GlobalSearchResponse> {
  const validation = validateSearchQuery(rawQuery);
  if (!validation.query) return emptySearchResponse();

  const actions = smartSearchActions(validation.query);
  if (actions.length) {
    return {
      query: validation.query,
      aircraft: [],
      airports: [],
      atsPoints: [],
      navPoints: [],
      flights: [],
      actions,
    };
  }

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
  const [rankedAircraft, rankedAirports, rankedNavPoints, rankedFlights] = await Promise.all([
    Promise.resolve(rankAircraft(aircraft, validation.query)),
    loadAirports(validation.query, database).then((items) => rankAirports(items, validation.query!)),
    loadNavPoints(validation.query, options.navPoints).then((items) => rankNavPoints(items, validation.query!)),
    options.flights
      ? Promise.resolve(rankFlights(options.flights, validation.query))
      : loadRecentFlights(validation.query, database, options.now ?? new Date()).then((items) => rankFlights(items, validation.query!)),
  ]);
  const atsDocuments = options.atsDocuments ?? [loadCzAtsRoutes(), loadSkAtsRoutes(), loadAtAtsRoutes()];
  const rankedAtsPoints = rankAtsPoints(atsDocuments, validation.query);
  const selected: RankedSearchResult[] = [...rankedAircraft, ...rankedAirports, ...rankedAtsPoints, ...rankedNavPoints, ...rankedFlights]
    .sort(compareAnyScored)
    .slice(0, GLOBAL_SEARCH_RESULT_LIMIT);
  return {
    query: validation.query,
    aircraft: selected.filter((result): result is Scored<AircraftSearchResult> => result.item.kind === "aircraft").map((result) => result.item),
    airports: selected.filter((result): result is Scored<AirportSearchResult> => result.item.kind === "airport").map((result) => result.item),
    atsPoints: selected.filter((result): result is Scored<AtsPointSearchResult> => result.item.kind === "ats-point").map((result) => result.item),
    navPoints: selected.filter((result): result is Scored<NavPointSearchResult> => result.item.kind === "nav-point").map((result) => result.item),
    flights: selected.filter((result): result is Scored<FlightSearchResult> => result.item.kind === "flight").map((result) => result.item),
    actions: [],
  };
}
