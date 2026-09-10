import { normalizeAtcActivationStatus, type AtcDataResponse, type AtcDatasetMetadata, type AtcSector, type AtcTransmitter } from "@/lib/atc/types";
import { isSupportedAtcFrequencyMhz } from "@/lib/atc/frequency-policy";
import type { AtcSectorProvider } from "@/lib/server/provider";
import { getPrisma } from "@/lib/server/db";

// DEMO DATA ONLY. These simplified polygons and frequencies are not current
// Czech AIP data and must never be presented as guaranteed operational data.
export const SAMPLE_ATC_SECTORS: AtcSector[] = [
  {
    id: "CZ-PRAGUE-RADAR",
    name: "Praha Radar",
    atcCallsign: "PRAGUE RADAR",
    service: "Area control",
    polygons: [[
      [11.4, 48.8], [18.5, 48.8], [18.5, 51.4], [11.4, 51.4], [11.4, 48.8],
    ]],
    lowerAltitudeFt: 24500,
    upperAltitudeFt: null,
    frequencies: [
      { frequencyMhz: 127.350, label: "Praha Radar", isPrimary: true },
      { frequencyMhz: 128.650, label: "Praha Radar", isPrimary: false },
    ],
    validFrom: null,
    validTo: null,
    country: "CZ",
    source: "AirRadar sample data",
    sourceReference: "demo://airradar-sample-atc",
    lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    activationStatus: normalizeAtcActivationStatus("UNKNOWN"),
  },
  {
    id: "CZ-PRAGUE-APPROACH",
    name: "Praha Approach",
    atcCallsign: "PRAGUE APPROACH",
    service: "Approach",
    polygons: [[
      [13.4, 49.4], [15.5, 49.4], [15.5, 50.8], [13.4, 50.8], [13.4, 49.4],
    ]],
    lowerAltitudeFt: 3000,
    upperAltitudeFt: 24500,
    frequencies: [
      { frequencyMhz: 118.100, label: "Approach", isPrimary: true },
      { frequencyMhz: 119.175, label: "Approach", isPrimary: false },
    ],
    validFrom: null,
    validTo: null,
    country: "CZ",
    source: "AirRadar sample data",
    sourceReference: "demo://airradar-sample-atc",
    lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    activationStatus: normalizeAtcActivationStatus("UNKNOWN"),
  },
];

export const SAMPLE_ATC_TRANSMITTERS: AtcTransmitter[] = [
  { id: "LKPR-APP", name: "Praha Approach", latitude: 50.1008, longitude: 14.26, service: "Approach", frequencyMhz: 118.1, notes: "Sample transmitter location", source: "AirRadar sample data", sourceReference: "demo://airradar-sample-atc", validFrom: null, validTo: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
  { id: "LKPR-RADAR", name: "Praha Radar", latitude: 50.0755, longitude: 14.4378, service: "Area control", frequencyMhz: 127.35, notes: "Sample transmitter location", source: "AirRadar sample data", sourceReference: "demo://airradar-sample-atc", validFrom: null, validTo: null, lastVerifiedAt: "2026-01-01T00:00:00.000Z" },
];

export class SampleAtcSectorProvider implements AtcSectorProvider {
  readonly name = "sample-atc";

  async getSectors(): Promise<AtcSector[]> {
    return SAMPLE_ATC_SECTORS;
  }
}

function jsonValue(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function polygonsFromJson(value: string): AtcSector["polygons"] {
  const parsed = jsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((polygon) => {
    if (!Array.isArray(polygon)) return [];
    return polygon.flatMap((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length !== 2) return [];
      const lon = finiteNumber(coordinate[0]);
      const lat = finiteNumber(coordinate[1]);
      return lon !== null && lat !== null ? [[lon, lat] as [number, number]] : [];
    });
  }).filter((polygon) => polygon.length >= 3);
}

function frequenciesFromRecord(primary: number | null, alternateJson: string | null): AtcSector["frequencies"] {
  const frequencies: AtcSector["frequencies"] = primary !== null && isSupportedAtcFrequencyMhz(primary)
    ? [{ frequencyMhz: primary, label: null, isPrimary: true }]
    : [];
  const alternate = jsonValue(alternateJson);
  if (!Array.isArray(alternate)) return frequencies;
  for (const value of alternate) {
    const frequency = typeof value === "number" ? value : value && typeof value === "object"
      ? finiteNumber((value as Record<string, unknown>).frequencyMhz)
      : null;
    if (frequency === null || !isSupportedAtcFrequencyMhz(frequency)) continue;
    const label = value && typeof value === "object" && typeof (value as Record<string, unknown>).label === "string"
      ? (value as Record<string, unknown>).label as string
      : null;
    frequencies.push({ frequencyMhz: frequency, label, isPrimary: false });
  }
  return frequencies.map((frequency, index) => ({ ...frequency, isPrimary: index === 0 }));
}

function storedSector(record: {
  id: string;
  name: string;
  polygonJson: string;
  lowerAltitudeFt: number | null;
  upperAltitudeFt: number | null;
  lowerAltitudeReference: string | null;
  upperAltitudeReference: string | null;
  atcCallsign: string | null;
  service: string | null;
  primaryFrequencyMhz: number | null;
  alternateFrequenciesJson: string | null;
  country: string | null;
  source: string;
  sourceReference: string;
  validFrom: Temporal.Instant | null;
  validTo: Temporal.Instant | null;
  lastVerifiedAt: Temporal.Instant;
}): AtcSector | null {
  const polygons = polygonsFromJson(record.polygonJson);
  if (!polygons.length) return null;
  return {
    id: record.id,
    name: record.name,
    atcCallsign: record.atcCallsign,
    service: record.service,
    polygons,
    lowerAltitudeFt: record.lowerAltitudeFt,
    upperAltitudeFt: record.upperAltitudeFt,
    lowerAltitudeReference: record.lowerAltitudeReference,
    upperAltitudeReference: record.upperAltitudeReference,
    frequencies: frequenciesFromRecord(record.primaryFrequencyMhz, record.alternateFrequenciesJson),
    validFrom: record.validFrom?.toString() ?? null,
    validTo: record.validTo?.toString() ?? null,
    country: record.country,
    source: record.source,
    sourceReference: record.sourceReference,
    lastVerifiedAt: record.lastVerifiedAt.toString(),
    activationStatus: normalizeAtcActivationStatus("UNKNOWN"),
  };
}

/**
 * Reads an imported ATC dataset from PostgreSQL. Importers should write
 * AtcSector.polygonJson as GeoJSON-style [[lon, lat], ...] rings and
 * alternateFrequenciesJson as [{ frequencyMhz, label? }, ...].
 */
function datasetMetadata(
  status: AtcDatasetMetadata["status"],
  sectors: AtcSector[],
  transmitters: AtcTransmitter[],
): AtcDatasetMetadata {
  const rows = [...sectors, ...transmitters];
  const sources = [...new Set(rows.map((row) => row.source))];
  const references = [...new Set(rows.map((row) => row.sourceReference))];
  const effectiveDates = [...new Set(rows.map((row) => row.validFrom).filter((value): value is string => value !== null))];
  const lastVerifiedAt = rows
    .map((row) => row.lastVerifiedAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right))
    .at(-1) ?? null;
  return {
    status,
    source: sources.length === 1 ? sources[0] : sources.length > 1 ? "multiple sources" : null,
    sourceReference: references.length === 1 ? references[0] : null,
    effectiveDate: effectiveDates.length === 1 ? effectiveDates[0] : null,
    lastVerifiedAt,
    sectorCount: sectors.length,
    transmitterCount: transmitters.length,
  };
}

function validAt(validFrom: string | null, validTo: string | null, observedAt = Date.now()): boolean {
  const from = validFrom ? Date.parse(validFrom) : Number.NEGATIVE_INFINITY;
  const to = validTo ? Date.parse(validTo) : Number.POSITIVE_INFINITY;
  return Number.isFinite(from) && Number.isFinite(to) ? observedAt >= from && observedAt <= to : from === Number.NEGATIVE_INFINITY || to === Number.POSITIVE_INFINITY;
}

export async function getStoredAtcData(): Promise<AtcDataResponse | null> {
  const database = getPrisma();
  if (!database) return null;
  try {
    const [sectorRows, transmitterRows] = await Promise.all([
      database.orm.public.AtcSector.limit(2000).all(),
      database.orm.public.AtcTransmitter.limit(2000).all(),
    ]);
    const sectors = sectorRows.map(storedSector).filter((sector): sector is AtcSector => sector !== null && validAt(sector.validFrom, sector.validTo));
    const transmitters = transmitterRows.map((transmitter) => ({
        id: transmitter.id,
        name: transmitter.name,
        latitude: transmitter.latitude,
        longitude: transmitter.longitude,
        service: transmitter.service,
        frequencyMhz: transmitter.frequencyMhz,
        notes: transmitter.notes,
        source: transmitter.source,
        sourceReference: transmitter.sourceReference,
        validFrom: transmitter.validFrom?.toString() ?? null,
        validTo: transmitter.validTo?.toString() ?? null,
        lastVerifiedAt: transmitter.lastVerifiedAt.toString(),
    })).filter((transmitter) => isSupportedAtcFrequencyMhz(transmitter.frequencyMhz) && validAt(transmitter.validFrom, transmitter.validTo));
    return { sectors, transmitters, metadata: datasetMetadata(sectors.length || transmitters.length ? "configured" : "empty", sectors, transmitters) };
  } catch (error) {
    console.error("AirRadar stored ATC data unavailable", error);
    return null;
  }
}

/** Production provider: no sample fallback when the real ATC tables are empty or unavailable. */
export class DatabaseAtcSectorProvider implements AtcSectorProvider {
  readonly name = "postgres-atc";

  async getSectors(): Promise<AtcSector[]> {
    return (await getStoredAtcData())?.sectors ?? [];
  }
}
