import { normalizeAtcActivationStatus, type AtcDataResponse, type AtcDatasetMetadata, type AtcSector, type AtcTransmitter } from "@/lib/atc/types";
import { isSupportedAtcFrequencyMhz } from "@/lib/atc/frequency-policy";
import type { AtcSectorProvider } from "@/lib/server/provider";
import { getPrisma } from "@/lib/server/db";
import { trackDbOperation } from "@/lib/server/db-operation-diagnostics";
import { isAtcValidityValid } from "@/lib/server/atc-validity";
import { measureRuntime, measureRuntimeAsync } from "@/lib/server/runtime-performance";

const ATC_PREPARATION_SLICE_MS = 6;

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

// Sample data is also a process-owned snapshot. Freeze it once so the
// assignment/context builders can safely share geometry without cloning it.
SAMPLE_ATC_SECTORS.forEach(freezeAtcSector);
SAMPLE_ATC_TRANSMITTERS.forEach((transmitter) => Object.freeze(transmitter));
Object.freeze(SAMPLE_ATC_SECTORS);
Object.freeze(SAMPLE_ATC_TRANSMITTERS);

export class SampleAtcSectorProvider implements AtcSectorProvider {
  readonly name = "sample-atc";

  async getSectors(): Promise<AtcSector[]> {
    return SAMPLE_ATC_SECTORS;
  }

  async getSectorsSnapshot(): Promise<ReadonlyArray<AtcSector>> {
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
  const rawPolygons = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    && ((parsed as Record<string, unknown>).type === "Polygon" || (parsed as Record<string, unknown>).type === "MultiPolygon")
    ? ((parsed as Record<string, unknown>).type === "Polygon"
      ? [[(parsed as Record<string, unknown>).coordinates]]
      : [(parsed as Record<string, unknown>).coordinates])
    : parsed;
  if (!Array.isArray(rawPolygons)) return [];
  return rawPolygons.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];
    // Accept both AirRadar's flat polygon ring and GeoJSON's polygon-with-
    // rings shape. Older SK/AT imports used the latter.
    const ring = Array.isArray(polygon[0]) && Array.isArray(polygon[0][0]) ? polygon[0] : polygon;
    return [ring.flatMap((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length !== 2) return [];
      const lon = finiteNumber(coordinate[0]);
      const lat = finiteNumber(coordinate[1]);
      return lon !== null && lat !== null ? [[lon, lat] as [number, number]] : [];
    })].filter((item) => item.length >= 3);
  });
}

function preparationYield(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function materializeAtcRows(
  sectorRows: Array<Parameters<typeof storedSector>[0]>,
  transmitterRows: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    service: string | null;
    frequencyMhz: number;
    notes: string | null;
    source: string;
    sourceReference: string;
    validFrom: Temporal.Instant | null;
    validTo: Temporal.Instant | null;
    lastVerifiedAt: Temporal.Instant;
  }>,
): Promise<AtcDatasetRows> {
  const sectors: AtcSector[] = [];
  let sliceStarted = performance.now();
  for (const row of sectorRows) {
    const sector = storedSector(row);
    if (sector) sectors.push(sector);
    if (performance.now() - sliceStarted >= ATC_PREPARATION_SLICE_MS) {
      await preparationYield();
      sliceStarted = performance.now();
    }
  }
  const transmitters: AtcTransmitter[] = [];
  for (const transmitter of transmitterRows) {
    if (isSupportedAtcFrequencyMhz(transmitter.frequencyMhz)) {
      transmitters.push({
        id: transmitter.id, name: transmitter.name, latitude: transmitter.latitude,
        longitude: transmitter.longitude, service: transmitter.service,
        frequencyMhz: transmitter.frequencyMhz, notes: transmitter.notes,
        source: transmitter.source, sourceReference: transmitter.sourceReference,
        validFrom: transmitter.validFrom?.toString() ?? null,
        validTo: transmitter.validTo?.toString() ?? null,
        lastVerifiedAt: transmitter.lastVerifiedAt.toString(),
      });
    }
    if (performance.now() - sliceStarted >= ATC_PREPARATION_SLICE_MS) {
      await preparationYield();
      sliceStarted = performance.now();
    }
  }
  return { sectors, transmitters };
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
  airspaceType: string | null;
  airspaceClass: string | null;
  remarks: string | null;
  primaryFrequencyMhz: number | null;
  alternateFrequenciesJson: string | null;
  country: string | null;
  source: string;
  sourceReference: string;
  validFrom: Temporal.Instant | null;
  validTo: Temporal.Instant | null;
  lastVerifiedAt: Temporal.Instant;
}): AtcSector | null {
  const polygons = measureRuntime("atc.dataset.polygon-json-parse", 0, () => polygonsFromJson(record.polygonJson));
  if (!polygons.length) return null;
  return measureRuntime("atc.dataset.sector-object", 0, () => ({
    id: record.id,
    name: record.name,
    atcCallsign: record.atcCallsign,
    service: record.service,
    airspaceType: record.airspaceType,
    airspaceClass: record.airspaceClass,
    remarks: record.remarks,
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
  }));
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

type AtcMetadataSectorRow = {
  source: string;
  sourceReference: string;
  validFrom: Temporal.Instant | null;
  validTo: Temporal.Instant | null;
  lastVerifiedAt: Temporal.Instant;
};

type AtcMetadataTransmitterRow = {
  source: string;
  sourceReference: string;
  validFrom: Temporal.Instant | null;
  validTo: Temporal.Instant | null;
  lastVerifiedAt: Temporal.Instant;
  frequencyMhz: number;
};

function metadataSector(row: AtcMetadataSectorRow): AtcSector {
  return {
    id: "metadata",
    name: "metadata",
    atcCallsign: null,
    service: null,
    polygons: [],
    lowerAltitudeFt: null,
    upperAltitudeFt: null,
    frequencies: [],
    validFrom: row.validFrom?.toString() ?? null,
    validTo: row.validTo?.toString() ?? null,
    country: null,
    source: row.source,
    sourceReference: row.sourceReference,
    lastVerifiedAt: row.lastVerifiedAt.toString(),
    activationStatus: normalizeAtcActivationStatus("UNKNOWN"),
  };
}

function metadataTransmitter(row: AtcMetadataTransmitterRow): AtcTransmitter {
  return {
    id: "metadata",
    name: "metadata",
    latitude: 0,
    longitude: 0,
    service: null,
    frequencyMhz: row.frequencyMhz,
    notes: null,
    source: row.source,
    sourceReference: row.sourceReference,
    validFrom: row.validFrom?.toString() ?? null,
    validTo: row.validTo?.toString() ?? null,
    lastVerifiedAt: row.lastVerifiedAt.toString(),
  };
}

function metadataFromRows(
  sectorRows: AtcMetadataSectorRow[],
  transmitterRows: AtcMetadataTransmitterRow[],
): AtcDatasetMetadata {
  const { sectors, transmitters } = measureRuntime("health.atc.data-transformation", 0, () => ({
    sectors: sectorRows.filter((row) => isAtcValidityValid(row.validFrom?.toString() ?? null, row.validTo?.toString() ?? null)).map(metadataSector),
    transmitters: transmitterRows
      .filter((row) => isSupportedAtcFrequencyMhz(row.frequencyMhz))
      .filter((row) => isAtcValidityValid(row.validFrom?.toString() ?? null, row.validTo?.toString() ?? null))
      .map(metadataTransmitter),
  }));
  return measureRuntime("health.atc.metadata-assembly", 0, () => datasetMetadata(
    sectors.length || transmitters.length ? "configured" : "empty", sectors, transmitters,
  ));
}

const globalAtcMetadata = globalThis as typeof globalThis & {
  __airRadarAtcMetadata?: { value: AtcDatasetMetadata; fingerprint: string; expiresAtMs: number };
  __airRadarAtcMetadataFlight?: Promise<AtcDatasetMetadata | null>;
  __airRadarAtcDataset?: { value: AtcDatasetRows; fingerprint: string; expiresAtMs: number; generation: number };
  __airRadarAtcDatasetFlight?: Promise<AtcDataResponse | null>;
  __airRadarAtcDatasetGeneration?: number;
  __airRadarAtcDatasetDiagnostics?: AtcDatasetCacheDiagnostics;
};
const atcInvalidationListeners = new Set<() => void>();
const ATC_METADATA_CACHE_MS = 30_000;
// Imported ATC data changes on publication/import boundaries, not per request.
// The import path invalidates this cache explicitly; the TTL is a second line
// of defence for out-of-process/manual changes. Never serve stale geometry.
const ATC_DATASET_CACHE_MS = 5 * 60_000;
const ATC_DATASET_ROW_LIMIT = 2000;

type AtcDatasetRows = { sectors: AtcSector[]; transmitters: AtcTransmitter[] };

export type AtcDatasetCacheDiagnostics = {
  scope: "process-local";
  hits: number;
  misses: number;
  invalidations: number;
  loadFailures: number;
  entries: number;
  inFlight: boolean;
  ttlMs: number;
  generation: number;
};

function datasetCacheDiagnostics(): AtcDatasetCacheDiagnostics {
  return globalAtcMetadata.__airRadarAtcDatasetDiagnostics ??= {
    scope: "process-local", hits: 0, misses: 0, invalidations: 0, loadFailures: 0,
    entries: 0, inFlight: false, ttlMs: ATC_DATASET_CACHE_MS,
    generation: globalAtcMetadata.__airRadarAtcDatasetGeneration ?? 0,
  };
}

function cloneAtcData(value: AtcDataResponse | null): AtcDataResponse | null {
  if (value === null) return null;
  // The cached value remains process-owned; callers must not be able to
  // mutate polygon/frequency data for subsequent requests.
  return structuredClone(value);
}

function freezeAtcSector(sector: AtcSector): AtcSector {
  for (const polygon of sector.polygons) {
    for (const point of polygon) Object.freeze(point);
    Object.freeze(polygon);
  }
  Object.freeze(sector.polygons);
  for (const frequency of sector.frequencies) Object.freeze(frequency);
  Object.freeze(sector.frequencies);
  return Object.freeze(sector);
}

function* atcCoordinates(value: AtcDatasetRows): Generator<readonly [number, number]> {
  for (const sector of value.sectors) {
    for (const polygon of sector.polygons) {
      for (const point of polygon) yield point;
    }
  }
}

function* atcPolygons(value: AtcDatasetRows): Generator<AtcSector["polygons"][number]> {
  for (const sector of value.sectors) {
    for (const polygon of sector.polygons) yield polygon;
  }
}

function* atcContainers(value: AtcDatasetRows): Generator<object> {
  for (const sector of value.sectors) {
    yield sector.polygons;
    yield sector.frequencies;
    for (const frequency of sector.frequencies) yield frequency;
  }
}

function* atcRows(value: AtcDatasetRows): Generator<AtcSector | AtcTransmitter> {
  for (const sector of value.sectors) yield sector;
  for (const transmitter of value.transmitters) yield transmitter;
}

async function freezeObjectsInSlices<T extends object>(
  name: string,
  objects: Iterable<T>,
): Promise<void> {
  const iterator = objects[Symbol.iterator]();
  let done = false;
  while (!done) {
    const slice = measureRuntime(name, 0, () => {
      const started = performance.now();
      let processed = 0;
      while (performance.now() - started < ATC_PREPARATION_SLICE_MS) {
        const next = iterator.next();
        if (next.done) {
          done = true;
          break;
        }
        Object.freeze(next.value);
        processed += 1;
      }
      return processed;
    });
    if (!done && slice === 0) {
      const next = iterator.next();
      if (next.done) {
        done = true;
      } else {
        Object.freeze(next.value);
      }
    }
    if (!done) await preparationYield();
  }
}

async function freezeAtcRowsAsync(value: AtcDatasetRows): Promise<AtcDatasetRows> {
  await freezeObjectsInSlices("atc.dataset.freeze.coordinates", atcCoordinates(value));
  await freezeObjectsInSlices("atc.dataset.freeze.polygons", atcPolygons(value));
  await freezeObjectsInSlices("atc.dataset.freeze.containers", atcContainers(value));
  await freezeObjectsInSlices("atc.dataset.freeze.rows", atcRows(value));
  Object.freeze(value.sectors);
  Object.freeze(value.transmitters);
  return Object.freeze(value);
}

function activeAtcData(value: AtcDatasetRows, observedAtMs = Date.now()): AtcDataResponse {
  const sectors = value.sectors.filter((sector) => isAtcValidityValid(sector.validFrom, sector.validTo, observedAtMs));
  const transmitters = value.transmitters.filter((transmitter) => isAtcValidityValid(transmitter.validFrom, transmitter.validTo, observedAtMs));
  const metadata = measureRuntime("atc.dataset.metadata-assembly", 0, () => datasetMetadata(sectors.length || transmitters.length ? "configured" : "empty", sectors, transmitters));
  return { sectors: Object.freeze(sectors) as AtcSector[], transmitters: Object.freeze(transmitters) as AtcTransmitter[], metadata };
}

async function setAtcDatasetCache(value: AtcDatasetRows, fingerprint: string, generation: number): Promise<void> {
  globalAtcMetadata.__airRadarAtcDataset = {
    value: await freezeAtcRowsAsync(value), fingerprint, expiresAtMs: Date.now() + ATC_DATASET_CACHE_MS, generation,
  };
  const diagnostics = datasetCacheDiagnostics();
  diagnostics.entries = 1;
  diagnostics.generation = generation;
}

async function readAtcDatasetFingerprint(
  database: NonNullable<ReturnType<typeof getPrisma>>,
  schema = database.orm.public,
): Promise<string> {
  const rows = await trackDbOperation("atc.dataset.version", async () => await schema.AtcDatasetVersion
    .where({ id: "atc" }).select("version").limit(1).all());
  const version = rows[0]?.version;
  if (!version) throw new Error("ATC dataset version row is missing");
  return version;
}

export function invalidateAtcDataCache(): void {
  const generation = (globalAtcMetadata.__airRadarAtcDatasetGeneration ?? 0) + 1;
  globalAtcMetadata.__airRadarAtcDatasetGeneration = generation;
  delete globalAtcMetadata.__airRadarAtcDataset;
  delete globalAtcMetadata.__airRadarAtcMetadata;
  const diagnostics = datasetCacheDiagnostics();
  diagnostics.invalidations += 1;
  diagnostics.entries = 0;
  diagnostics.generation = generation;
  for (const listener of atcInvalidationListeners) listener();
}

export function onAtcDataCacheInvalidated(listener: () => void): () => void {
  atcInvalidationListeners.add(listener);
  return () => atcInvalidationListeners.delete(listener);
}

export function getAtcDatasetCacheDiagnostics(): AtcDatasetCacheDiagnostics {
  const diagnostics = datasetCacheDiagnostics();
  diagnostics.inFlight = Boolean(globalAtcMetadata.__airRadarAtcDatasetFlight);
  diagnostics.entries = globalAtcMetadata.__airRadarAtcDataset ? 1 : 0;
  diagnostics.generation = globalAtcMetadata.__airRadarAtcDatasetGeneration ?? 0;
  return { ...diagnostics };
}

/** Health-only projection: it deliberately never selects or parses polygon geometry. */
export async function getStoredAtcMetadata(): Promise<AtcDatasetMetadata | null> {
  const dataset = globalAtcMetadata.__airRadarAtcDataset;
  if (dataset && dataset.expiresAtMs > Date.now() && dataset.generation === (globalAtcMetadata.__airRadarAtcDatasetGeneration ?? 0)) {
    const database = getPrisma();
    if (database) {
      try {
        const fingerprint = await readAtcDatasetFingerprint(database);
        if (globalAtcMetadata.__airRadarAtcDataset === dataset && fingerprint === dataset.fingerprint) {
          datasetCacheDiagnostics().hits += 1;
          return activeAtcData(dataset.value).metadata;
        }
        invalidateAtcDataCache();
      } catch (error) {
        datasetCacheDiagnostics().loadFailures += 1;
        console.error("AirRadar stored ATC metadata freshness unavailable", error);
        invalidateAtcDataCache();
      }
    }
  }
  const cached = globalAtcMetadata.__airRadarAtcMetadata;
  if (cached && cached.expiresAtMs > Date.now()) {
    const database = getPrisma();
    if (database) {
      try {
        const fingerprint = await readAtcDatasetFingerprint(database);
        if (globalAtcMetadata.__airRadarAtcMetadata === cached && fingerprint === cached.fingerprint) return cached.value;
        invalidateAtcDataCache();
      } catch (error) {
        datasetCacheDiagnostics().loadFailures += 1;
        console.error("AirRadar stored ATC metadata freshness unavailable", error);
        invalidateAtcDataCache();
      }
    }
  }
  if (globalAtcMetadata.__airRadarAtcMetadataFlight) return globalAtcMetadata.__airRadarAtcMetadataFlight;

  const flight = (async () => {
    const database = getPrisma();
    if (!database) return null;
    try {
      const [sectorRows, transmitterRows] = await Promise.all([
        measureRuntimeAsync("health.atc.db-query.sectors", 0, () => trackDbOperation("atc.dataset.load", async () => await database.orm.public.AtcSector
          .select("source", "sourceReference", "validFrom", "validTo", "lastVerifiedAt").limit(2000).all())),
        measureRuntimeAsync("health.atc.db-query.transmitters", 0, () => trackDbOperation("atc.dataset.load", async () => await database.orm.public.AtcTransmitter
          .select("source", "sourceReference", "validFrom", "validTo", "lastVerifiedAt", "frequencyMhz").limit(2000).all())),
      ]);
      const metadata = metadataFromRows(sectorRows, transmitterRows);
      const fingerprint = await readAtcDatasetFingerprint(database);
      globalAtcMetadata.__airRadarAtcMetadata = { value: metadata, fingerprint, expiresAtMs: Date.now() + ATC_METADATA_CACHE_MS };
      return metadata;
    } catch (error) {
      console.error("AirRadar stored ATC metadata unavailable", error);
      return null;
    }
  })();
  globalAtcMetadata.__airRadarAtcMetadataFlight = flight;
  try { return await flight; } finally { delete globalAtcMetadata.__airRadarAtcMetadataFlight; }
}

export function resetAtcMetadataCacheForTests(): void {
  delete globalAtcMetadata.__airRadarAtcMetadata;
  delete globalAtcMetadata.__airRadarAtcMetadataFlight;
  delete globalAtcMetadata.__airRadarAtcDataset;
  delete globalAtcMetadata.__airRadarAtcDatasetFlight;
  globalAtcMetadata.__airRadarAtcDatasetGeneration = 0;
  delete globalAtcMetadata.__airRadarAtcDatasetDiagnostics;
}

export async function getStoredAtcDataSnapshot(): Promise<AtcDataResponse | null> {
  const cached = globalAtcMetadata.__airRadarAtcDataset;
  const now = Date.now();
  if (cached && cached.expiresAtMs > now && cached.generation === (globalAtcMetadata.__airRadarAtcDatasetGeneration ?? 0)) {
    const database = getPrisma();
    if (database) {
      try {
        const fingerprint = await readAtcDatasetFingerprint(database);
        if (globalAtcMetadata.__airRadarAtcDataset === cached && fingerprint === cached.fingerprint) {
          datasetCacheDiagnostics().hits += 1;
          return activeAtcData(cached.value, now);
        }
        invalidateAtcDataCache();
      } catch (error) {
        datasetCacheDiagnostics().loadFailures += 1;
        console.error("AirRadar stored ATC dataset freshness unavailable", error);
        invalidateAtcDataCache();
      }
    }
  }
  if (cached) {
    delete globalAtcMetadata.__airRadarAtcDataset;
    datasetCacheDiagnostics().entries = 0;
  }
  datasetCacheDiagnostics().misses += 1;
  if (globalAtcMetadata.__airRadarAtcDatasetFlight) return await globalAtcMetadata.__airRadarAtcDatasetFlight;

  const flight = (async () => {
    // A bounded two-attempt check prevents publishing rows from before an
    // external import with that import's new version. The version row and all
    // dataset rows are read in one transaction; the post-load read detects a
    // commit between statements under READ COMMITTED.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generation = globalAtcMetadata.__airRadarAtcDatasetGeneration ?? 0;
      const database = getPrisma();
      if (!database) return null;
      try {
        const loaded = await database.transaction(async (transaction) => {
          const before = await readAtcDatasetFingerprint(database, transaction.orm.public);
          const [sectorRows, transmitterRows] = await Promise.all([
            measureRuntimeAsync("atc.dataset.db-query.sectors", 0, () => trackDbOperation("atc.dataset.load", async () => await transaction.orm.public.AtcSector.limit(ATC_DATASET_ROW_LIMIT).all())),
            measureRuntimeAsync("atc.dataset.db-query.transmitters", 0, () => trackDbOperation("atc.dataset.load", async () => await transaction.orm.public.AtcTransmitter.limit(ATC_DATASET_ROW_LIMIT).all())),
          ]);
          const after = await readAtcDatasetFingerprint(database, transaction.orm.public);
          const rows = await measureRuntimeAsync("atc.dataset.orm-materialization", sectorRows.length + transmitterRows.length, () => materializeAtcRows(sectorRows, transmitterRows));
          return { before, after, ...rows };
        });
        if (loaded.before !== loaded.after) continue;
        const value = { sectors: loaded.sectors, transmitters: loaded.transmitters };
        const fingerprint = loaded.after;
        if (generation !== (globalAtcMetadata.__airRadarAtcDatasetGeneration ?? 0)) continue;
        await setAtcDatasetCache(value, fingerprint, generation);
        const active = activeAtcData(value);
        globalAtcMetadata.__airRadarAtcMetadata = { value: active.metadata, fingerprint, expiresAtMs: Date.now() + ATC_METADATA_CACHE_MS };
        return active;
      } catch (error) {
        datasetCacheDiagnostics().loadFailures += 1;
        console.error("AirRadar stored ATC data unavailable", error);
        return null;
      }
    }
    datasetCacheDiagnostics().loadFailures += 1;
    console.error("AirRadar stored ATC data changed during bounded consistency check");
    return null;
  })();
  globalAtcMetadata.__airRadarAtcDatasetFlight = flight;
  try { return await flight; }
  finally {
    if (globalAtcMetadata.__airRadarAtcDatasetFlight === flight) delete globalAtcMetadata.__airRadarAtcDatasetFlight;
  }
}

/** Cheap version-only read used by long-lived assignment indexes. */
export async function getStoredAtcDatasetFingerprint(): Promise<string | null> {
  const database = getPrisma();
  if (!database) return null;
  try {
    return await readAtcDatasetFingerprint(database);
  } catch (error) {
    datasetCacheDiagnostics().loadFailures += 1;
    console.error("AirRadar stored ATC dataset freshness unavailable", error);
    return null;
  }
}

/** Public callers receive a defensive projection; internal indexes use the immutable snapshot. */
export async function getStoredAtcData(): Promise<AtcDataResponse | null> {
  return cloneAtcData(await getStoredAtcDataSnapshot());
}

/** Production provider: no sample fallback when the real ATC tables are empty or unavailable. */
export class DatabaseAtcSectorProvider implements AtcSectorProvider {
  readonly name = "postgres-atc";

  async getSectors(): Promise<AtcSector[]> {
    return (await getStoredAtcData())?.sectors ?? [];
  }

  async getSectorsSnapshot(): Promise<ReadonlyArray<AtcSector>> {
    return (await getStoredAtcDataSnapshot())?.sectors ?? [];
  }

  async getDatasetFingerprint(): Promise<string | null> {
    return getStoredAtcDatasetFingerprint();
  }

  onDatasetInvalidated(listener: () => void): () => void {
    return onAtcDataCacheInvalidated(listener);
  }
}
