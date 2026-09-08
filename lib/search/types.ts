export const MIN_GLOBAL_SEARCH_QUERY_LENGTH = 2;
export const MAX_GLOBAL_SEARCH_QUERY_LENGTH = 64;
export const GLOBAL_SEARCH_RESULT_LIMIT = 12;

export type SearchHref = `/aircraft/${string}` | `/airports/${string}`;

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

export interface GlobalSearchResponse {
  query: string;
  aircraft: AircraftSearchResult[];
  airports: AirportSearchResult[];
}
