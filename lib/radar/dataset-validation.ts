import type { FeatureCollection } from "geojson";
import type { Airport } from "@/lib/airports/types";
import type { AtcDataResponse } from "@/lib/atc/types";

/** Runtime validation for optional radar datasets; failures are isolated from the SSE lane. */
export interface AtsRoutesResponse { available: boolean; source?: { name: string; reference: string; effectiveDate: string; aipAmendment: string | null; airacAmendment: string | null }; counts?: { routes: number; points: number; segments: number; cdrSegments: number; discontinuities: number }; segments?: FeatureCollection; labels?: FeatureCollection; points?: FeatureCollection; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAirportDataset(value: unknown): value is Airport[] {
  return Array.isArray(value) && value.every((airport) => isRecord(airport)
    && typeof airport.icaoCode === "string"
    && typeof airport.name === "string"
    && typeof airport.latitude === "number"
    && Number.isFinite(airport.latitude)
    && typeof airport.longitude === "number"
    && Number.isFinite(airport.longitude));
}

export function parseAtcDataset(value: unknown): value is AtcDataResponse {
  return isRecord(value)
    && Array.isArray(value.sectors)
    && Array.isArray(value.transmitters)
    && isRecord(value.metadata);
}

export function parseAtsDataset(value: unknown): value is AtsRoutesResponse {
  return isRecord(value) && typeof value.available === "boolean";
}

export async function parseJsonDataset<T>(response: Response, validator: (value: unknown) => value is T): Promise<T> {
  const value: unknown = await response.json();
  if (!validator(value)) throw new SyntaxError("malformed dataset response");
  return value;
}

