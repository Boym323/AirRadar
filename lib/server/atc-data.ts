import type { AtcSector, AtcTransmitter } from "@/lib/atc/types";
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
  },
];

export const SAMPLE_ATC_TRANSMITTERS: AtcTransmitter[] = [
  { id: "LKPR-APP", name: "Praha Approach", latitude: 50.1008, longitude: 14.26, service: "Approach", frequencyMhz: 118.1, notes: "Sample transmitter location" },
  { id: "LKPR-RADAR", name: "Praha Radar", latitude: 50.0755, longitude: 14.4378, service: "Area control", frequencyMhz: 127.35, notes: "Sample transmitter location" },
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
  const frequencies: AtcSector["frequencies"] = primary === null ? [] : [{ frequencyMhz: primary, label: null, isPrimary: true }];
  const alternate = jsonValue(alternateJson);
  if (!Array.isArray(alternate)) return frequencies;
  for (const value of alternate) {
    const frequency = typeof value === "number" ? value : value && typeof value === "object"
      ? finiteNumber((value as Record<string, unknown>).frequencyMhz)
      : null;
    if (frequency === null) continue;
    const label = value && typeof value === "object" && typeof (value as Record<string, unknown>).label === "string"
      ? (value as Record<string, unknown>).label as string
      : null;
    frequencies.push({ frequencyMhz: frequency, label, isPrimary: false });
  }
  return frequencies;
}

function storedSector(record: {
  id: string;
  name: string;
  polygonJson: string;
  lowerAltitudeFt: number | null;
  upperAltitudeFt: number | null;
  atcCallsign: string | null;
  service: string | null;
  primaryFrequencyMhz: number | null;
  alternateFrequenciesJson: string | null;
  country: string | null;
  source: string;
  validFrom: Temporal.Instant | null;
  validTo: Temporal.Instant | null;
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
    frequencies: frequenciesFromRecord(record.primaryFrequencyMhz, record.alternateFrequenciesJson),
    validFrom: record.validFrom?.toString() ?? null,
    validTo: record.validTo?.toString() ?? null,
    country: record.country,
    source: record.source,
  };
}

/**
 * Reads an imported ATC dataset from PostgreSQL. Importers should write
 * AtcSector.polygonJson as GeoJSON-style [[lon, lat], ...] rings and
 * alternateFrequenciesJson as [{ frequencyMhz, label? }, ...].
 */
export async function getStoredAtcData(): Promise<{ sectors: AtcSector[]; transmitters: AtcTransmitter[] } | null> {
  const database = getPrisma();
  if (!database) return null;
  try {
    const [sectorRows, transmitterRows] = await Promise.all([
      database.orm.public.AtcSector.limit(2000).all(),
      database.orm.public.AtcTransmitter.limit(2000).all(),
    ]);
    return {
      sectors: sectorRows.map(storedSector).filter((sector): sector is AtcSector => sector !== null),
      transmitters: transmitterRows.map((transmitter) => ({
        id: transmitter.id,
        name: transmitter.name,
        latitude: transmitter.latitude,
        longitude: transmitter.longitude,
        service: transmitter.service,
        frequencyMhz: transmitter.frequencyMhz,
        notes: transmitter.notes,
      })),
    };
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
