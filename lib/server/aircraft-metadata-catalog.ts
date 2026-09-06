import "temporal-polyfill/full/global";
import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { AircraftMetadata } from "@/lib/aircraft/types";
import { getAircraftMetadataUrl } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { Tar1090DbProvider } from "@/lib/server/tar1090-db-provider";
import type { AircraftMetadataProvider } from "@/lib/server/provider";

const gunzipAsync = promisify(gunzip);
const SOURCE = "tar1090-db";
const SYNC_ID = "tar1090-db";
const SYNC_INTERVAL_MS = 24 * 60 * 60_000;
const MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 80 * 1024 * 1024;

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

interface DownloadedCatalog {
  records: AircraftMetadataRecord[];
  etag: string | null;
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
    if (!line.trim()) continue;
    const values = splitCsvRow(line);
    const icaoHex = field(values[0])?.toUpperCase() ?? null;
    if (!icaoHex || !/^[0-9A-F]{6}$/.test(icaoHex)) continue;
    records.push({
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
    });
  }
  return records;
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
 * Maintains a PostgreSQL-backed aircraft catalog and mirrors it in RAM. The
 * local tar1090 block database remains the fallback when PostgreSQL or the
 * daily GitHub synchronization is unavailable.
 */
export class AircraftMetadataCatalog implements AircraftMetadataProvider {
  readonly name = SOURCE;
  private readonly fallback: Tar1090DbProvider | null;
  private readonly sourceUrl: string;
  private readonly memory = new Map<string, AircraftMetadataRecord>();
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
    const cached = this.memory.get(hex);
    if (cached && hasMetadata(cached)) return metadataFromRecord(cached);
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
      const rows = await database.orm.public.AircraftMetadataCache
        .select("icaoHex", "registration", "icaoTypeCode", "aircraftDescription", "operator", "flags", "year", "source", "sourceReference", "datasetVersion")
        .all();
      for (const row of rows) {
        this.memory.set(row.icaoHex.toUpperCase(), {
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
        });
      }
      const sync = await database.orm.public.AircraftMetadataSync.first({ id: SYNC_ID });
      const sameSource = sync?.sourceUrl === this.sourceUrl;
      this.etag = sameSource ? sync?.etag ?? null : null;
      this.lastCheckedAt = sameSource ? instantMilliseconds(sync?.lastCheckedAt) ?? 0 : 0;
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

  private async synchronize(database: NonNullable<ReturnType<typeof getPrisma>>): Promise<void> {
    const checkedAt = new Date();
    try {
      let response = await this.downloadCatalog();
      // A 304 is only useful when the local rows are present. If the cache was
      // cleared or a previous load was incomplete, force one full download so
      // the catalog can self-heal instead of remaining empty forever.
      if (response === null && this.memory.size === 0 && this.etag) {
        this.etag = null;
        response = await this.downloadCatalog();
      }
      if (response === null) {
        await this.updateSyncRow(database, {
          etag: this.etag,
          lastCheckedAt: checkedAt,
          lastUpdatedAt: null,
          recordCount: this.memory.size,
          lastError: null,
        });
        return;
      }

      await this.writeCatalog(database, response.records);
      this.memory.clear();
      for (const record of response.records) this.memory.set(record.icaoHex, record);
      this.etag = response.etag;
      const updatedAt = new Date();
      await this.updateSyncRow(database, {
        etag: response.etag,
        lastCheckedAt: checkedAt,
        lastUpdatedAt: updatedAt,
        recordCount: response.records.length,
        lastError: null,
      });
    } catch (error) {
      await this.updateSyncRow(database, {
        etag: this.etag,
        lastCheckedAt: checkedAt,
        lastUpdatedAt: null,
        recordCount: this.memory.size,
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
      const compressed = Buffer.from(await response.arrayBuffer());
      if (compressed.byteLength > MAX_COMPRESSED_BYTES) throw new Error("Aircraft metadata source response is too large");
      const decompressed = await gunzipAsync(compressed, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
      if (decompressed.byteLength > MAX_DECOMPRESSED_BYTES) throw new Error("Aircraft metadata catalog is too large");
      const datasetVersion = response.headers.get("etag") ?? createHash("sha256").update(compressed).digest("hex");
      const records = parseAircraftMetadataCsv(decompressed.toString("utf8"), this.sourceUrl, datasetVersion);
      if (!records.length) throw new Error("Aircraft metadata catalog contained no valid records");
      return { records, etag: response.headers.get("etag") };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async writeCatalog(database: NonNullable<ReturnType<typeof getPrisma>>, records: AircraftMetadataRecord[]): Promise<void> {
    const payload = JSON.stringify(records);
    const plan = database.raw.sql`
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(${payload}::jsonb) AS incoming_row(
          "icaoHex" text,
          "registration" text,
          "icaoTypeCode" text,
          "aircraftDescription" text,
          "operator" text,
          "flags" text,
          "year" text,
          "source" text,
          "sourceReference" text,
          "datasetVersion" text
        )
      ), upserted AS (
        INSERT INTO "public"."aircraftMetadataCache" (
          "icaoHex", "registration", "icaoTypeCode", "aircraftDescription", "operator",
          "flags", "year", "source", "sourceReference", "datasetVersion"
        )
        SELECT "icaoHex", "registration", "icaoTypeCode", "aircraftDescription", "operator",
          "flags", "year", "source", "sourceReference", "datasetVersion"
        FROM incoming
        ON CONFLICT ("icaoHex") DO UPDATE SET
          "registration" = EXCLUDED."registration",
          "icaoTypeCode" = EXCLUDED."icaoTypeCode",
          "aircraftDescription" = EXCLUDED."aircraftDescription",
          "operator" = EXCLUDED."operator",
          "flags" = EXCLUDED."flags",
          "year" = EXCLUDED."year",
          "source" = EXCLUDED."source",
          "sourceReference" = EXCLUDED."sourceReference",
          "datasetVersion" = EXCLUDED."datasetVersion",
          "updatedAt" = now()
        RETURNING "icaoHex"
      )
      DELETE FROM "public"."aircraftMetadataCache"
      WHERE "source" = ${SOURCE}
        AND "icaoHex" NOT IN (SELECT "icaoHex" FROM incoming)
    `.affectedCount().build();
    await database.runtime().execute(plan);
  }

  private async updateSyncRow(
    database: NonNullable<ReturnType<typeof getPrisma>>,
    values: { etag: string | null; lastCheckedAt: Date; lastUpdatedAt: Date | null; recordCount: number; lastError: string | null },
  ): Promise<void> {
    const checkedAt = Temporal.Instant.fromEpochMilliseconds(values.lastCheckedAt.getTime());
    const updatedAt = Temporal.Instant.fromEpochMilliseconds(Date.now());
    const lastUpdatedAt = values.lastUpdatedAt ? Temporal.Instant.fromEpochMilliseconds(values.lastUpdatedAt.getTime()) : null;
    await database.orm.public.AircraftMetadataSync.where({ id: SYNC_ID }).upsert({
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
