export const MIN_GLOBAL_SEARCH_QUERY_LENGTH = 2;
export const MAX_GLOBAL_SEARCH_QUERY_LENGTH = 64;
export const GLOBAL_SEARCH_RESULT_LIMIT = 12;

export type SearchHref = `/aircraft/${string}` | `/airports/${string}` | `/airports/${string}#${string}` | `/flights/${string}` | `/flights?${string}` | `/recap/daily#${string}` | `/?aircraft=${string}` | `/?atsPoint=${string}` | `/?navPoint=${string}`;

export interface AircraftSearchResult {
  kind: "aircraft";
  icaoHex: string;
  registration: string | null;
  callsign: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  href: SearchHref;
}

export interface AirportSearchResult {
  kind: "airport";
  icaoCode: string;
  iataCode: string | null;
  name: string;
  city: string | null;
  href: SearchHref;
}

export interface AtsPointSearchResult {
  kind: "ats-point";
  id: string;
  name: string;
  countryCode: string;
  pointKind: "DESIGNATED_POINT" | "NAVAID";
  routeDesignators: string[];
  latitude: number;
  longitude: number;
  href: SearchHref;
}

export interface NavPointSearchResult {
  kind: "nav-point";
  id: string;
  name: string;
  pointKind: "NAVAID" | "FIX";
  type: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  frequencyMhz: number | null;
  href: SearchHref;
}

export interface FlightSearchResult {
  kind: "flight";
  id: number;
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  origin: string | null;
  destination: string | null;
  startTime: string;
  href: SearchHref;
}

export type SmartSearchIntent =
  | "go_arounds_today"
  | "rare_aircraft_today"
  | "airport_operations"
  | "flights_to_airport";

export interface SmartSearchActionResult {
  kind: "action";
  intent: SmartSearchIntent;
  airportIcao: string | null;
  href: SearchHref;
}

export interface GlobalSearchResponse {
  query: string;
  aircraft: AircraftSearchResult[];
  airports: AirportSearchResult[];
  atsPoints: AtsPointSearchResult[];
  navPoints: NavPointSearchResult[];
  flights: FlightSearchResult[];
  actions: SmartSearchActionResult[];
}
