import type { Airport } from "./types";

export const OURAIRPORTS_DATA_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

const GLOBAL_AIRPORT_TYPES = new Set(["large_airport", "medium_airport"]);
const REGIONAL_AIRPORT_TYPES = new Set(["small_airport", "heliport", "seaplane_base"]);
const REGIONAL_COUNTRIES = new Set(["AT", "CZ", "DE", "PL", "SK"]);

export interface OurAirportsImportResult {
  airports: Airport[];
  skipped: number;
}

/** Parses RFC 4180-style CSV, including quoted commas and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  return records;
}

function value(row: string[], columns: Map<string, number>, column: string): string {
  return row[columns.get(column) ?? -1]?.trim() ?? "";
}

function isSelected(type: string, country: string): boolean {
  return GLOBAL_AIRPORT_TYPES.has(type) || (REGIONAL_AIRPORT_TYPES.has(type) && REGIONAL_COUNTRIES.has(country));
}

export function parseOurAirportsCsv(text: string): OurAirportsImportResult {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("OurAirports CSV is empty");
  const columns = new Map(header.map((name, index) => [name, index]));
  for (const required of ["type", "name", "latitude_deg", "longitude_deg", "iso_country", "gps_code", "ident"]) {
    if (!columns.has(required)) throw new Error(`OurAirports CSV is missing required column: ${required}`);
  }

  const airports = new Map<string, Airport>();
  let skipped = 0;
  for (const row of rows) {
    const type = value(row, columns, "type");
    const country = value(row, columns, "iso_country");
    if (!isSelected(type, country)) continue;
    const icaoCode = (value(row, columns, "gps_code") || value(row, columns, "ident")).toUpperCase();
    const iataCandidate = value(row, columns, "iata_code").toUpperCase();
    const latitude = Number(value(row, columns, "latitude_deg"));
    const longitude = Number(value(row, columns, "longitude_deg"));
    if (!/^[A-Z]{4}$/.test(icaoCode) || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      skipped += 1;
      continue;
    }
    airports.set(icaoCode, {
      icaoCode,
      iataCode: /^[A-Z]{3}$/.test(iataCandidate) ? iataCandidate : null,
      name: value(row, columns, "name"),
      city: value(row, columns, "municipality") || null,
      country: country || null,
      latitude,
      longitude,
    });
  }
  return { airports: [...airports.values()], skipped };
}
