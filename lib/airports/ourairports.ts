import type { Airport } from "./types";

export const OURAIRPORTS_AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
export const OURAIRPORTS_RUNWAYS_URL = "https://davidmegginson.github.io/ourairports-data/runways.csv";
export const OURAIRPORTS_FREQUENCIES_URL = "https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv";
export const OURAIRPORTS_NAVAIDS_URL = "https://davidmegginson.github.io/ourairports-data/navaids.csv";
/** Backward-compatible name used by the original core-only importer. */
export const OURAIRPORTS_DATA_URL = OURAIRPORTS_AIRPORTS_URL;

const GLOBAL_AIRPORT_TYPES = new Set(["large_airport", "medium_airport"]);
const REGIONAL_AIRPORT_TYPES = new Set(["small_airport", "heliport", "seaplane_base"]);
const REGIONAL_COUNTRIES = new Set(["AT", "CZ", "DE", "PL", "SK"]);

export interface ImportDiagnostics {
  skipped: number;
  reasons: Record<string, number>;
}

export interface OurAirportsAirport extends Airport {
  ourAirportsId: number;
  ourAirportsIdent: string;
}

export interface OurAirportsRunway {
  id: number;
  airportIdent: string;
  lengthFt: number | null;
  widthFt: number | null;
  surface: string | null;
  lighted: boolean | null;
  closed: boolean | null;
  leIdent: string | null;
  leLatitude: number | null;
  leLongitude: number | null;
  leElevationFt: number | null;
  leHeadingDegT: number | null;
  leDisplacedThresholdFt: number | null;
  heIdent: string | null;
  heLatitude: number | null;
  heLongitude: number | null;
  heElevationFt: number | null;
  heHeadingDegT: number | null;
  heDisplacedThresholdFt: number | null;
}

export interface OurAirportsFrequency {
  id: number;
  airportIdent: string;
  type: string;
  description: string | null;
  frequencyMhz: number;
}

export interface OurAirportsNavaid {
  id: number;
  filename: string;
  ident: string;
  name: string;
  type: string;
  frequencyKhz: number | null;
  latitude: number;
  longitude: number;
  elevationFt: number | null;
  country: string | null;
  dmeFrequencyKhz: number | null;
  dmeChannel: string | null;
  dmeLatitude: number | null;
  dmeLongitude: number | null;
  dmeElevationFt: number | null;
  slavedVariationDeg: number | null;
  magneticVariationDeg: number | null;
  usageType: string | null;
  power: string | null;
  associatedAirportIdent: string | null;
}

export interface OurAirportsImportResult<T> {
  records: T[];
  skipped: number;
  diagnostics: ImportDiagnostics;
}

export type OurAirportsAirportImportResult = OurAirportsImportResult<OurAirportsAirport> & { airports: OurAirportsAirport[] };

/** Parses RFC 4180-style CSV, including quoted commas and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") { record.push(field); field = ""; }
    else if (character === "\n") { record.push(field.replace(/\r$/, "")); records.push(record); record = []; field = ""; }
    else field += character;
  }
  if (field.length > 0 || record.length > 0) { record.push(field.replace(/\r$/, "")); records.push(record); }
  return records;
}

function diagnostics(): ImportDiagnostics { return { skipped: 0, reasons: {} }; }
function skip(result: ImportDiagnostics, reason: string): void { result.skipped += 1; result.reasons[reason] = (result.reasons[reason] ?? 0) + 1; }
function value(row: string[], columns: Map<string, number>, column: string): string { return row[columns.get(column) ?? -1]?.trim() ?? ""; }
function columnsFor(text: string, required: readonly string[], dataset: string): { rows: string[][]; columns: Map<string, number> } {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error(`${dataset} CSV is empty`);
  const columns = new Map(header.map((name, index) => [name.replace(/^\uFEFF/, ""), index]));
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length) throw new Error(`${dataset} CSV is missing required column(s): ${missing.join(", ")}`);
  return { rows, columns };
}
function integer(raw: string): number | null { if (!/^[-+]?\d+$/.test(raw)) return null; const parsed = Number(raw); return Number.isSafeInteger(parsed) ? parsed : null; }
function number(raw: string): number | null { if (!raw) return null; const parsed = Number(raw); return Number.isFinite(parsed) ? parsed : null; }
function optionalInteger(row: string[], columns: Map<string, number>, column: string): number | null { return integer(value(row, columns, column)); }
function optionalNumber(row: string[], columns: Map<string, number>, column: string): number | null { return number(value(row, columns, column)); }
function coordinate(row: string[], columns: Map<string, number>, latitudeColumn: string, longitudeColumn: string): [number, number] | null | "invalid" {
  const latRaw = value(row, columns, latitudeColumn); const lonRaw = value(row, columns, longitudeColumn);
  if (!latRaw && !lonRaw) return null;
  const lat = number(latRaw); const lon = number(lonRaw);
  return lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [lat, lon] : "invalid";
}
function flag(raw: string): boolean | null { return raw === "0" ? false : raw === "1" ? true : null; }
function makeResult<T>(records: T[], info: ImportDiagnostics): OurAirportsImportResult<T> { return { records, skipped: info.skipped, diagnostics: info }; }
function isSelected(type: string, country: string): boolean { return GLOBAL_AIRPORT_TYPES.has(type) || (REGIONAL_AIRPORT_TYPES.has(type) && REGIONAL_COUNTRIES.has(country)); }

export function parseOurAirportsCsv(text: string): OurAirportsAirportImportResult {
  const { rows, columns } = columnsFor(text, ["id", "ident", "type", "name", "latitude_deg", "longitude_deg", "iso_country", "gps_code"], "OurAirports");
  const info = diagnostics(); const airports = new Map<string, OurAirportsAirport>(); const sourceIds = new Map<number, string>();
  for (const row of rows) {
    const type = value(row, columns, "type"); const country = value(row, columns, "iso_country"); if (!isSelected(type, country)) continue;
    const sourceId = integer(value(row, columns, "id")); const ident = value(row, columns, "ident").toUpperCase();
    const icaoCode = (value(row, columns, "gps_code") || ident).toUpperCase(); const latitude = number(value(row, columns, "latitude_deg")); const longitude = number(value(row, columns, "longitude_deg"));
    if (sourceId === null || sourceId <= 0 || !ident || !value(row, columns, "name") || !/^[A-Z]{4}$/.test(icaoCode) || latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { skip(info, "invalid data"); continue; }
    if (sourceIds.has(sourceId) && sourceIds.get(sourceId) !== icaoCode) throw new Error(`OurAirports has conflicting canonical code for source airport id ${sourceId}`);
    const existing = airports.get(icaoCode); if (existing && existing.ourAirportsId !== sourceId) throw new Error(`OurAirports has conflicting selected airport rows for canonical ICAO ${icaoCode}`);
    sourceIds.set(sourceId, icaoCode);
    const iata = value(row, columns, "iata_code").toUpperCase();
    airports.set(icaoCode, { icaoCode, iataCode: /^[A-Z]{3}$/.test(iata) ? iata : null, name: value(row, columns, "name"), city: value(row, columns, "municipality") || null, country: country || null, latitude, longitude, ourAirportsId: sourceId, ourAirportsIdent: ident, type, elevationFt: optionalInteger(row, columns, "elevation_ft"), scheduledService: value(row, columns, "scheduled_service") === "yes" ? true : value(row, columns, "scheduled_service") === "no" ? false : null, region: value(row, columns, "iso_region") || null, localCode: value(row, columns, "local_code") || null });
  }
  const records = [...airports.values()]; return { ...makeResult(records, info), airports: records };
}

export function parseOurAirportsRunwaysCsv(text: string): OurAirportsImportResult<OurAirportsRunway> {
  const { rows, columns } = columnsFor(text, ["id", "airport_ident", "length_ft", "width_ft", "surface", "lighted", "closed", "le_ident", "le_latitude_deg", "le_longitude_deg", "le_elevation_ft", "le_heading_degT", "le_displaced_threshold_ft", "he_ident", "he_latitude_deg", "he_longitude_deg", "he_elevation_ft", "he_heading_degT", "he_displaced_threshold_ft"], "OurAirports runways");
  const info = diagnostics(); const records: OurAirportsRunway[] = [];
  for (const row of rows) {
    if (!row.some((part) => part.trim())) continue;
    const id = integer(value(row, columns, "id")); const airportIdent = value(row, columns, "airport_ident").toUpperCase(); const le = coordinate(row, columns, "le_latitude_deg", "le_longitude_deg"); const he = coordinate(row, columns, "he_latitude_deg", "he_longitude_deg");
    if (id === null || id <= 0 || !airportIdent || le === "invalid" || he === "invalid") { skip(info, "invalid data"); continue; }
    records.push({ id, airportIdent, lengthFt: optionalInteger(row, columns, "length_ft"), widthFt: optionalInteger(row, columns, "width_ft"), surface: value(row, columns, "surface").toUpperCase() || null, lighted: flag(value(row, columns, "lighted")), closed: flag(value(row, columns, "closed")), leIdent: value(row, columns, "le_ident") || null, leLatitude: le ? le[0] : null, leLongitude: le ? le[1] : null, leElevationFt: optionalInteger(row, columns, "le_elevation_ft"), leHeadingDegT: optionalNumber(row, columns, "le_heading_degT"), leDisplacedThresholdFt: optionalInteger(row, columns, "le_displaced_threshold_ft"), heIdent: value(row, columns, "he_ident") || null, heLatitude: he ? he[0] : null, heLongitude: he ? he[1] : null, heElevationFt: optionalInteger(row, columns, "he_elevation_ft"), heHeadingDegT: optionalNumber(row, columns, "he_heading_degT"), heDisplacedThresholdFt: optionalInteger(row, columns, "he_displaced_threshold_ft") });
  }
  return makeResult(records, info);
}

export function parseOurAirportsFrequenciesCsv(text: string): OurAirportsImportResult<OurAirportsFrequency> {
  const { rows, columns } = columnsFor(text, ["id", "airport_ident", "type", "description", "frequency_mhz"], "OurAirports frequencies"); const info = diagnostics(); const records: OurAirportsFrequency[] = [];
  for (const row of rows) {
    const id = integer(value(row, columns, "id")); const frequencyMhz = number(value(row, columns, "frequency_mhz")); const airportIdent = value(row, columns, "airport_ident").toUpperCase(); const type = value(row, columns, "type");
    if (id === null || id <= 0 || !airportIdent || !type || frequencyMhz === null || frequencyMhz <= 0) { skip(info, "invalid data"); continue; }
    records.push({ id, airportIdent, type, description: value(row, columns, "description") || null, frequencyMhz });
  }
  return makeResult(records, info);
}

export function parseOurAirportsNavaidsCsv(text: string): OurAirportsImportResult<OurAirportsNavaid> {
  const { rows, columns } = columnsFor(text, ["id", "filename", "ident", "name", "type", "frequency_khz", "latitude_deg", "longitude_deg", "elevation_ft", "iso_country", "dme_frequency_khz", "dme_channel", "dme_latitude_deg", "dme_longitude_deg", "dme_elevation_ft", "slaved_variation_deg", "magnetic_variation_deg", "usageType", "power", "associated_airport"], "OurAirports navaids"); const info = diagnostics(); const records: OurAirportsNavaid[] = [];
  for (const row of rows) {
    const id = integer(value(row, columns, "id")); const point = coordinate(row, columns, "latitude_deg", "longitude_deg"); const ident = value(row, columns, "ident"); const type = value(row, columns, "type");
    if (id === null || id <= 0 || !value(row, columns, "filename") || !ident || !type || point === null || point === "invalid") { skip(info, "invalid data"); continue; }
    const dme = coordinate(row, columns, "dme_latitude_deg", "dme_longitude_deg"); if (dme === "invalid") { skip(info, "invalid data"); continue; }
    records.push({ id, filename: value(row, columns, "filename"), ident, name: value(row, columns, "name"), type, frequencyKhz: optionalInteger(row, columns, "frequency_khz"), latitude: point[0], longitude: point[1], elevationFt: optionalInteger(row, columns, "elevation_ft"), country: value(row, columns, "iso_country") || null, dmeFrequencyKhz: optionalInteger(row, columns, "dme_frequency_khz"), dmeChannel: value(row, columns, "dme_channel") || null, dmeLatitude: dme ? dme[0] : null, dmeLongitude: dme ? dme[1] : null, dmeElevationFt: optionalInteger(row, columns, "dme_elevation_ft"), slavedVariationDeg: optionalNumber(row, columns, "slaved_variation_deg"), magneticVariationDeg: optionalNumber(row, columns, "magnetic_variation_deg"), usageType: value(row, columns, "usageType") || null, power: value(row, columns, "power") || null, associatedAirportIdent: value(row, columns, "associated_airport").toUpperCase() || null });
  }
  return makeResult(records, info);
}
