import "temporal-polyfill/full/global";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { createGunzip } from "node:zlib";
import type { AircraftMetadata } from "@/lib/aircraft/types";
import { getAircraftMetadataUrl } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { Tar1090DbProvider } from "@/lib/server/tar1090-db-provider";
import type { AircraftMetadataProvider } from "@/lib/server/provider";
import { BoundedTtlLruCache } from "@/lib/server/bounded-cache";

export { BoundedTtlLruCache } from "@/lib/server/bounded-cache";

const SOURCE = "tar1090-db";
const SYNC_ID = "tar1090-db";
const SYNC_INTERVAL_MS = 24 * 60 * 60_000;
const MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 80 * 1024 * 1024;
export const METADATA_HOT_CACHE_MAX_ENTRIES = 4_096;
export const METADATA_HOT_CACHE_TTL_MS = 24 * 60 * 60_000;
export const METADATA_IMPORT_BATCH_SIZE = 2_000;

interface AircraftMetadataRecord {
  icaoHex: string;
  registration: string | null;
  icaoTypeCode: string | null;
  aircraftDescription: string | null;
  operator: string | null;
  flags: string | null;
  year: string | null;
  source: string;
  sourceReference: string;
  datasetVersion: string | null;
}

type AirRadarDatabase = NonNullable<ReturnType<typeof getPrisma>>;
type AirRadarTransaction = Parameters<Parameters<AirRadarDatabase["transaction"]>[0]>[0];

interface DownloadedCatalog {
  etag: string | null;
  datasetVersion: string;
  stream: Readable;
  recordCount: number;
}

function field(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === ";") {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (escaped) current += "\\";
  fields.push(current);
  return fields;
}

export function parseAircraftMetadataCsv(csv: string, sourceReference: string, datasetVersion: string | null): AircraftMetadataRecord[] {
  const records: AircraftMetadataRecord[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const record = parseAircraftMetadataCsvLine(line, sourceReference, datasetVersion);
    if (record) records.push(record);
  }
  return records;
}

function parseAircraftMetadataCsvLine(line: string, sourceReference: string, datasetVersion: string | null): AircraftMetadataRecord | null {
  if (!line.trim()) return null;
  const values = splitCsvRow(line);
  const icaoHex = field(values[0])?.toUpperCase() ?? null;
  if (!icaoHex || !/^[0-9A-F]{6}$/.test(icaoHex)) return null;
  return {
    icaoHex,
    registration: field(values[1]),
    icaoTypeCode: field(values[2]),
    aircraftDescription: field(values[4]),
    operator: field(values[6]),
    flags: field(values[3]),
    year: field(values[5]),
    source: SOURCE,
    sourceReference,
    datasetVersion,
  };
}

function metadataFromRecord(record: AircraftMetadataRecord): AircraftMetadata {
  return {
    registration: record.registration,
    registrationCountry: null,
    registrationCountryCode: null,
    aircraftType: record.icaoTypeCode,
    icaoTypeCode: record.icaoTypeCode,
    aircraftDescription: record.aircraftDescription,
    operator: record.operator,
    manufacturer: null,
    flags: record.flags,
    year: record.year,
    source: record.source,
    retrievedAt: new Date().toISOString(),
  };
}

function hasMetadata(record: AircraftMetadataRecord): boolean {
  return Boolean(record.registration || record.icaoTypeCode || record.aircraftDescription || record.operator);
}

function instantMilliseconds(value: Temporal.Instant | Date | null | undefined): number | null {
  if (!value) return null;
  return value instanceof Date ? value.getTime() : value.epochMilliseconds;
}

function syncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * Maintains a PostgreSQL-backed aircraft catalog. RAM is deliberately limited
 * to recently requested records; the primary-key lookup remains in the
 * indexed persistent table. The local tar1090 block database remains the
 * fallback when PostgreSQL or the daily GitHub synchronization is unavailable.
 */
export class AircraftMetadataCatalog implements AircraftMetadataProvider {
  readonly name = SOURCE;
  private readonly fallback: Tar1090DbProvider | null;
  private readonly sourceUrl: string;
  private readonly hotCache = new BoundedTtlLruCache<AircraftMetadataRecord | null>(METADATA_HOT_CACHE_MAX_ENTRIES, METADATA_HOT_CACHE_TTL_MS);
  private initialLoad: Promise<void> | null = null;
  private syncInFlight: Promise<void> | null = null;
  private lastCheckedAt = 0;
  private etag: string | null = null;

  constructor(readsbBaseUrl: string | null, sourceUrl = getAircraftMetadataUrl()) {
    this.fallback = readsbBaseUrl ? new Tar1090DbProvider(readsbBaseUrl) : null;
    this.sourceUrl = sourceUrl;
  }

  async getMetadata(icaoHex: string): Promise<AircraftMetadata | null> {
    await this.ensureLoaded();
    this.triggerSyncIfDue();
    const hex = icaoHex.trim().toUpperCase();
    const cached = this.getHot(hex);
    if (cached !== undefined) return cached && hasMetadata(cached) ? metadataFromRecord(cached) : null;
    const database = getPrisma();
    if (database) {
      try {
        const row = await database.orm.public.AircraftMetadataCache
          .where({ icaoHex: hex })
          .first();
        const record = row ? {
          icaoHex: row.icaoHex.toUpperCase(),
          registration: row.registration,
          icaoTypeCode: row.icaoTypeCode,
          aircraftDescription: row.aircraftDescription,
          operator: row.operator,
          flags: row.flags,
          year: row.year,
          source: row.source,
          sourceReference: row.sourceReference,
          datasetVersion: row.datasetVersion,
        } satisfies AircraftMetadataRecord : null;
        this.setHot(hex, record && hasMetadata(record) ? record : null);
        if (record && hasMetadata(record)) return metadataFromRecord(record);
      } catch (error) {
        console.error("AirRadar aircraft metadata lookup failed", error);
      }
    }
    return this.fallback?.getMetadata(hex) ?? null;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.initialLoad) {
      this.initialLoad = this.loadDatabase()
        .catch((error) => {
          console.error("AirRadar aircraft metadata cache load failed", error);
        });
    }
    await this.initialLoad;
  }

  private async loadDatabase(): Promise<void> {
    const database = getPrisma();
    if (!database) return;
    try {
      const sync = await database.orm.public.AircraftMetadataSync.first({ id: SYNC_ID });
      const sameSource = sync?.sourceUrl === this.sourceUrl;
      this.etag = sameSource ? sync?.etag ?? null : null;
      this.lastCheckedAt = sameSource ? instantMilliseconds(sync?.lastCheckedAt) ?? 0 : 0;
      this.storedRecordCount = sameSource ? sync?.recordCount ?? 0 : 0;
    } catch (error) {
      console.error("AirRadar aircraft metadata cache load failed", error);
    }
  }

  private triggerSyncIfDue(): void {
    const database = getPrisma();
    if (!database || this.syncInFlight || Date.now() - this.lastCheckedAt < SYNC_INTERVAL_MS) return;
    this.lastCheckedAt = Date.now();
    this.syncInFlight = this.synchronize(database)
      .catch((error) => {
        console.error("AirRadar aircraft metadata cache sync failed", error);
      })
      .finally(() => {
        this.syncInFlight = null;
      });
  }

  private storedRecordCount = 0;

  private async synchronize(database: AirRadarDatabase): Promise<void> {
    const checkedAt = new Date();
    try {
      let response = await this.downloadCatalog();
      // A 304 is only useful when the local rows are present. If the cache was
      // cleared or a previous load was incomplete, force one full download so
      // the catalog can self-heal instead of remaining empty forever.
      if (response === null && this.storedRecordCount === 0 && this.etag) {
        this.etag = null;
        response = await this.downloadCatalog();
      }
      if (response === null) {
        await this.updateSyncRow(database, {
          etag: this.etag,
          lastCheckedAt: checkedAt,
          lastUpdatedAt: null,
          recordCount: this.storedRecordCount,
          lastError: null,
        });
        return;
      }

      await this.writeCatalog(database, response);
      this.hotCache.clear();
      this.etag = response.etag;
      this.storedRecordCount = response.recordCount;
      const updatedAt = new Date();
      await this.updateSyncRow(database, {
        etag: response.etag,
        lastCheckedAt: checkedAt,
        lastUpdatedAt: updatedAt,
        recordCount: response.recordCount,
        lastError: null,
      });
    } catch (error) {
      await this.updateSyncRow(database, {
        etag: this.etag,
        lastCheckedAt: checkedAt,
        lastUpdatedAt: null,
        recordCount: this.storedRecordCount,
        lastError: syncErrorMessage(error),
      }).catch(() => undefined);
      throw error;
    }
  }

  private async downloadCatalog(): Promise<DownloadedCatalog | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(this.sourceUrl, {
        cache: "no-store",
        signal: controller.signal,
        headers: this.etag ? { "If-None-Match": this.etag } : undefined,
      });
      if (response.status === 304) return null;
      if (!response.ok) throw new Error(`Aircraft metadata source returned HTTP ${response.status}`);
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_COMPRESSED_BYTES) {
        throw new Error("Aircraft metadata source response is too large");
      }
      if (!response.body) throw new Error("Aircraft metadata source returned an empty body");
      const etag = response.headers.get("etag");
      const datasetVersion = etag ?? response.headers.get("last-modified") ?? `checked-${Date.now()}`;
      const body = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
      let compressedBytes = 0;
      body.on("data", (chunk: Buffer) => {
        compressedBytes += chunk.byteLength;
        if (compressedBytes > MAX_COMPRESSED_BYTES) body.destroy(new Error("Aircraft metadata source response is too large"));
      });
      const timer = setTimeout(() => body.destroy(new Error("Aircraft metadata source timed out")), 20_000);
      body.once("close", () => clearTimeout(timer));
      return { etag, datasetVersion, stream: body, recordCount: 0 };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async writeCatalog(
    database: AirRadarDatabase,
    catalog: DownloadedCatalog,
  ): Promise<void> {
    let recordCount = 0;
    await database.transaction(async (transaction) => {
      await transaction.execute(
        transaction.sql.public.aircraftMetadataCache
          .delete()
          .where((fields, fns) => fns.eq(fields.source, SOURCE))
          .build(),
      );
      const input = catalog.stream.pipe(createGunzip());
      let decompressedBytes = 0;
      input.on("data", (chunk: Buffer) => {
        decompressedBytes += chunk.byteLength;
        if (decompressedBytes > MAX_DECOMPRESSED_BYTES) input.destroy(new Error("Aircraft metadata catalog is too large"));
      });
      const lines = createInterface({ input });
      let batch: AircraftMetadataRecord[] = [];
      for await (const line of lines) {
        const record = parseAircraftMetadataCsvLine(String(line), this.sourceUrl, catalog.datasetVersion);
        if (!record) continue;
        batch.push(record);
        recordCount += 1;
        if (batch.length >= METADATA_IMPORT_BATCH_SIZE) {
          await this.insertCatalogBatch(transaction, batch);
          batch = [];
        }
      }
      if (batch.length) await this.insertCatalogBatch(transaction, batch);
    });
    if (recordCount === 0) throw new Error("Aircraft metadata catalog contained no valid records");
    catalog.recordCount = recordCount;
  }

  private async insertCatalogBatch(transaction: AirRadarTransaction, records: AircraftMetadataRecord[]): Promise<void> {
    await transaction.execute(
      transaction.sql.public.aircraftMetadataCache
        .insert(records.map((record) => ({
          icaoHex: record.icaoHex,
          registration: record.registration,
          icaoTypeCode: record.icaoTypeCode,
          aircraftDescription: record.aircraftDescription,
          operator: record.operator,
          flags: record.flags,
          year: record.year,
          source: record.source,
          sourceReference: record.sourceReference,
          datasetVersion: record.datasetVersion,
        })))
        .build(),
    );
  }

  private getHot(hex: string): AircraftMetadataRecord | null | undefined {
    return this.hotCache.get(hex);
  }

  private setHot(hex: string, record: AircraftMetadataRecord | null): void {
    this.hotCache.set(hex, record);
  }

  getDiagnostics(): { hotCacheSize: number; hotCacheLimit: number; syncInFlight: boolean; catalogRecordCount: number | null } {
    return {
      hotCacheSize: this.hotCache.size,
      hotCacheLimit: METADATA_HOT_CACHE_MAX_ENTRIES,
      syncInFlight: this.syncInFlight !== null,
      catalogRecordCount: this.storedRecordCount,
    };
  }

  private async updateSyncRow(
    database: NonNullable<ReturnType<typeof getPrisma>>,
    values: { etag: string | null; lastCheckedAt: Date; lastUpdatedAt: Date | null; recordCount: number; lastError: string | null },
  ): Promise<void> {
    const checkedAt = Temporal.Instant.fromEpochMilliseconds(values.lastCheckedAt.getTime());
    const updatedAt = Temporal.Instant.fromEpochMilliseconds(Date.now());
    const lastUpdatedAt = values.lastUpdatedAt ? Temporal.Instant.fromEpochMilliseconds(values.lastUpdatedAt.getTime()) : null;
    await database.orm.public.AircraftMetadataSync.upsert({
      conflictOn: { id: SYNC_ID },
      create: {
        id: SYNC_ID,
        sourceUrl: this.sourceUrl,
        etag: values.etag,
        lastCheckedAt: checkedAt,
        lastUpdatedAt,
        recordCount: values.recordCount,
        lastError: values.lastError,
        updatedAt,
      },
      update: {
        sourceUrl: this.sourceUrl,
        etag: values.etag,
        lastCheckedAt: checkedAt,
        ...(lastUpdatedAt ? { lastUpdatedAt } : {}),
        recordCount: values.recordCount,
        lastError: values.lastError,
        updatedAt,
      },
    });
  }
}
