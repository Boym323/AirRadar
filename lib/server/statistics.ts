import "temporal-polyfill/full/global";
import type { Aircraft, RadarStats, ReceiverPosition, ReceiverStatisticsCoverageBucket, ReceiverStatisticsRange, ReceiverStatisticsRangeResponse, ReceiverStatisticsResponse } from "@/lib/aircraft/types";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { COVERAGE_BUCKET_COUNT, COVERAGE_BUCKET_SIZE_DEGREES, summarizeCoverage } from "@/lib/statistics-coverage";
import { dayKey, getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { getReceiverStatisticsRange } from "@/lib/server/statistics-range";
import type { CurrentDayStatisticsSnapshot } from "@/lib/server/statistics-range";

export { COVERAGE_BUCKET_COUNT, COVERAGE_BUCKET_SIZE_DEGREES } from "@/lib/statistics-coverage";
export const STATISTICS_FLUSH_INTERVAL_MS = 30_000;

export interface DailyAircraftStatisticsRecord {
  icaoHex: string;
  aircraftType: string | null;
  airline: string | null;
}

export interface DailyCoverageStatisticsRecord {
  azimuthBucket: number;
  maxDistanceKm: number;
}

export interface ReceiverStatisticsPersistenceSnapshot {
  date: string;
  uniqueAircraftCount: number;
  maxConcurrentAircraft: number;
  maxDistanceKm: number;
  maxDistanceIcaoHex: string | null;
  maxDistanceAt: Date | null;
  aircraft: DailyAircraftStatisticsRecord[];
  coverage: DailyCoverageStatisticsRecord[];
}

export interface ReceiverStatisticsPersistence {
  load(date: string): Promise<ReceiverStatisticsPersistenceSnapshot | null>;
  save(snapshot: ReceiverStatisticsPersistenceSnapshot): Promise<void>;
}

export interface ReceiverStatisticsPersistenceStatus {
  status: "ok" | "degraded" | "disabled";
  lastSuccessfulWriteAt: string | null;
  failureCount: number;
}

interface DirtyAircraftRecord {
  record: DailyAircraftStatisticsRecord;
  version: number;
}

interface DirtyCoverageRecord {
  record: DailyCoverageStatisticsRecord;
  version: number;
}

interface PendingStatisticsWrite {
  snapshot: ReceiverStatisticsPersistenceSnapshot;
  aircraftVersions: Map<string, number>;
  coverageVersions: Map<number, number>;
  aggregateVersion: number | null;
}

function validCoordinate(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validPosition(aircraft: Aircraft): aircraft is Aircraft & { lat: number; lon: number } {
  return aircraft.lat !== null && aircraft.lon !== null
    && validCoordinate(aircraft.lat, -90, 90)
    && validCoordinate(aircraft.lon, -180, 180)
    // (0, 0) is the common invalid ADS-B placeholder, not a useful position.
    && !(aircraft.lat === 0 && aircraft.lon === 0);
}

function validReceiver(receiver: ReceiverPosition): boolean {
  return validCoordinate(receiver.lat, -90, 90)
    && validCoordinate(receiver.lon, -180, 180)
    && !(receiver.lat === 0 && receiver.lon === 0);
}

function cleanValue(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function typeForAircraft(aircraft: Aircraft): string | null {
  return cleanValue(aircraft.enrichment?.metadata?.icaoTypeCode) ?? cleanValue(aircraft.aircraftType);
}

function airlineForAircraft(aircraft: Aircraft): string | null {
  return cleanValue(aircraft.enrichment?.route?.airline) ?? cleanValue(aircraft.enrichment?.metadata?.operator);
}

function normalizedHex(value: string): string {
  return value.trim().toUpperCase();
}

function timestampAsDate(value: Temporal.Instant | Date | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value.epochMilliseconds);
}

function sortBreakdown(entries: Map<string, number>): Array<{ name: string; count: number }> {
  return [...entries.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * PostgreSQL-backed persistence for the small daily statistics aggregate.
 * The store writes only changed aircraft and coverage rows in one transaction.
 */
export class DatabaseReceiverStatisticsPersistence implements ReceiverStatisticsPersistence {
  async load(date: string): Promise<ReceiverStatisticsPersistenceSnapshot | null> {
    const database = getPrisma();
    if (!database) return null;
    const schema = database.orm.public;
    const aggregate = await schema.ReceiverDailyStats.where({ date }).first();
    if (!aggregate) return null;
    const [aircraft, coverage] = await Promise.all([
      schema.ReceiverDailyAircraft.where({ date }).all(),
      schema.ReceiverDailyCoverage.where({ date }).all(),
    ]);
    return {
      date: aggregate.date,
      uniqueAircraftCount: aggregate.uniqueAircraftCount,
      maxConcurrentAircraft: aggregate.maxConcurrentAircraft,
      maxDistanceKm: aggregate.maxDistanceKm,
      maxDistanceIcaoHex: aggregate.maxDistanceIcaoHex,
      maxDistanceAt: timestampAsDate(aggregate.maxDistanceAt),
      aircraft: aircraft.map((item) => ({
        icaoHex: item.icaoHex,
        aircraftType: item.aircraftType,
        airline: item.airline,
      })),
      coverage: coverage.map((item) => ({
        azimuthBucket: item.azimuthBucket,
        maxDistanceKm: item.maxDistanceKm,
      })),
    };
  }

  async save(snapshot: ReceiverStatisticsPersistenceSnapshot): Promise<void> {
    const database = getPrisma();
    if (!database) return;
    const updatedAt = Temporal.Instant.fromEpochMilliseconds(Date.now());
    await database.transaction(async (transaction) => {
      const schema = transaction.orm.public;
      await schema.ReceiverDailyStats.upsert({
        update: {
          uniqueAircraftCount: snapshot.uniqueAircraftCount,
          maxConcurrentAircraft: snapshot.maxConcurrentAircraft,
          maxDistanceKm: snapshot.maxDistanceKm,
          maxDistanceIcaoHex: snapshot.maxDistanceIcaoHex,
          maxDistanceAt: snapshot.maxDistanceAt
            ? Temporal.Instant.fromEpochMilliseconds(snapshot.maxDistanceAt.getTime())
            : null,
          updatedAt,
        },
        create: {
          date: snapshot.date,
          uniqueAircraftCount: snapshot.uniqueAircraftCount,
          maxConcurrentAircraft: snapshot.maxConcurrentAircraft,
          maxDistanceKm: snapshot.maxDistanceKm,
          maxDistanceIcaoHex: snapshot.maxDistanceIcaoHex,
          maxDistanceAt: snapshot.maxDistanceAt
            ? Temporal.Instant.fromEpochMilliseconds(snapshot.maxDistanceAt.getTime())
            : null,
          updatedAt,
        },
      });

      for (const item of snapshot.aircraft) {
        const existing = await schema.ReceiverDailyAircraft
          .where({ date: snapshot.date, icaoHex: item.icaoHex })
          .first();
        if (existing) {
          await schema.ReceiverDailyAircraft.where({ date: snapshot.date, icaoHex: item.icaoHex }).update({
            aircraftType: item.aircraftType,
            airline: item.airline,
            updatedAt,
          });
        } else {
          await schema.ReceiverDailyAircraft.create({
            date: snapshot.date,
            icaoHex: item.icaoHex,
            aircraftType: item.aircraftType,
            airline: item.airline,
            updatedAt,
          });
        }
      }

      for (const item of snapshot.coverage) {
        const existing = await schema.ReceiverDailyCoverage
          .where({ date: snapshot.date, azimuthBucket: item.azimuthBucket })
          .first();
        if (existing) {
          await schema.ReceiverDailyCoverage.where({ date: snapshot.date, azimuthBucket: item.azimuthBucket }).update({
            maxDistanceKm: item.maxDistanceKm,
            updatedAt,
          });
        } else {
          await schema.ReceiverDailyCoverage.create({
            date: snapshot.date,
            azimuthBucket: item.azimuthBucket,
            maxDistanceKm: item.maxDistanceKm,
            updatedAt,
          });
        }
      }
    });
  }
}

function createDefaultPersistence(): ReceiverStatisticsPersistence | null {
  return process.env.DATABASE_URL?.trim() ? new DatabaseReceiverStatisticsPersistence() : null;
}

export interface ReceiverStatisticsOptions {
  timezone?: string;
  clock?: () => Date;
  persistence?: ReceiverStatisticsPersistence | null;
  flushIntervalMs?: number;
}

/**
 * In-memory daily statistics with a fixed-size coverage map and bounded
 * per-aircraft accounting. Persistence is deliberately best effort.
 */
export class ReceiverStatistics {
  private readonly timezone: string;
  private readonly clock: () => Date;
  private readonly persistence: ReceiverStatisticsPersistence | null;
  private readonly flushIntervalMs: number;
  private readonly aircraft = new Map<string, DailyAircraftStatisticsRecord>();
  private readonly typeCounts = new Map<string, number>();
  private readonly airlineCounts = new Map<string, number>();
  private readonly coverage = new Map<number, number>();
  private readonly dirtyAircraft = new Map<string, DirtyAircraftRecord>();
  private readonly dirtyCoverage = new Map<number, DirtyCoverageRecord>();
  private currentDate: string;
  private uniqueAircraftCount = 0;
  private maxConcurrentAircraft = 0;
  private maxDistanceKm = 0;
  private maxDistanceIcaoHex: string | null = null;
  private maxDistanceAt: Date | null = null;
  private version = 0;
  private aggregateDirtyVersion: number | null = null;
  private lastFlushAttemptAt = 0;
  private persistenceEnabled = true;
  private activeWrite: Promise<void> | null = null;
  private readonly queuedWrites = new Map<string, PendingStatisticsWrite>();
  private persistenceFailureCount = 0;
  private lastSuccessfulPersistenceAt: string | null = null;
  private loaded = false;

  constructor(options: ReceiverStatisticsOptions = {}) {
    this.timezone = options.timezone ?? getAppTimezone();
    this.clock = options.clock ?? (() => new Date());
    this.persistence = options.persistence === undefined ? createDefaultPersistence() : options.persistence;
    this.flushIntervalMs = Math.max(1_000, options.flushIntervalMs ?? STATISTICS_FLUSH_INTERVAL_MS);
    this.currentDate = dayKey(this.clock(), this.timezone);
  }

  async load(): Promise<void> {
    const date = dayKey(this.clock(), this.timezone);
    this.currentDate = date;
    this.lastFlushAttemptAt = this.clock().getTime();
    if (!this.persistence) {
      this.loaded = true;
      return;
    }
    try {
      const persisted = await this.persistence.load(date);
      if (this.currentDate === date && persisted) this.mergePersisted(persisted);
      this.loaded = true;
    } catch (error) {
      // Do not overwrite a persisted aggregate with an empty one after a
      // transient database outage during startup.
      this.persistenceEnabled = false;
      this.persistenceFailureCount += 1;
      this.loaded = true;
      console.error("AirRadar statistics load failed", error);
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  observe(aircraft: Aircraft[], receiver: ReceiverPosition, observedAt = this.clock()): void {
    this.ensureDay(observedAt);
    if (aircraft.length > this.maxConcurrentAircraft) {
      this.maxConcurrentAircraft = aircraft.length;
      this.markAggregateDirty();
    }

    const canCalculateCoverage = validReceiver(receiver);
    for (const item of aircraft) {
      const icaoHex = normalizedHex(item.icaoHex);
      if (!icaoHex) continue;
      this.accountAircraft(icaoHex, typeForAircraft(item), airlineForAircraft(item));

      if (!canCalculateCoverage || !validPosition(item)) continue;
      const distanceKm = Number.isFinite(item.distanceKm) && (item.distanceKm ?? -1) >= 0
        ? item.distanceKm!
        : haversineDistanceKm(receiver.lat, receiver.lon, item.lat, item.lon);
      if (!Number.isFinite(distanceKm) || distanceKm < 0) continue;
      const bearing = Number.isFinite(item.bearing) && item.bearing! >= 0 && item.bearing! < 360
        ? item.bearing!
        : initialBearing(receiver.lat, receiver.lon, item.lat, item.lon);
      if (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360) continue;

      if (distanceKm > this.maxDistanceKm) {
        this.maxDistanceKm = distanceKm;
        this.maxDistanceIcaoHex = icaoHex;
        this.maxDistanceAt = new Date(observedAt);
        this.markAggregateDirty();
      }

      const azimuthBucket = Math.min(COVERAGE_BUCKET_COUNT - 1, Math.floor(bearing / COVERAGE_BUCKET_SIZE_DEGREES));
      if (distanceKm > (this.coverage.get(azimuthBucket) ?? 0)) {
        this.coverage.set(azimuthBucket, distanceKm);
        this.markCoverageDirty(azimuthBucket, distanceKm);
      }
    }
    this.flushIfDue(observedAt.getTime());
  }

  getRadarStats(currentAircraft: number, messagesPerSecond: number | null): RadarStats {
    this.ensureDay(this.clock());
    return {
      currentAircraft,
      aircraftSeenToday: this.uniqueAircraftCount,
      uniqueAircraftToday: this.uniqueAircraftCount,
      maxConcurrentAircraft: this.maxConcurrentAircraft,
      maxDistanceKm: this.maxDistanceKm,
      aircraftTypes: sortBreakdown(this.typeCounts),
      airlines: sortBreakdown(this.airlineCounts),
      messagesPerSecond,
    };
  }

  getPersistenceStatus(): ReceiverStatisticsPersistenceStatus {
    if (!this.persistence) {
      return { status: "disabled", lastSuccessfulWriteAt: null, failureCount: 0 };
    }
    return {
      status: this.persistenceFailureCount ? "degraded" : "ok",
      lastSuccessfulWriteAt: this.lastSuccessfulPersistenceAt,
      failureCount: this.persistenceFailureCount,
    };
  }

  getResponse(currentAircraft: number, messagesPerSecond: number | null): ReceiverStatisticsResponse {
    this.ensureDay(this.clock());
    const coverage = this.getCoverage();
    return {
      date: this.currentDate,
      timezone: this.timezone,
      live: { aircraftCount: currentAircraft, messagesPerSecond },
      daily: {
        uniqueAircraft: this.uniqueAircraftCount,
        maxConcurrentAircraft: this.maxConcurrentAircraft,
        maxDistanceKm: this.maxDistanceKm,
      },
      coverage,
      coverageSummary: summarizeCoverage(coverage),
      topAircraftTypes: sortBreakdown(this.typeCounts).slice(0, 10),
      topAirlines: sortBreakdown(this.airlineCounts).slice(0, 10),
    };
  }

  async getRangeResponse(
    currentAircraft: number,
    messagesPerSecond: number | null,
    range: ReceiverStatisticsRange,
  ): Promise<ReceiverStatisticsRangeResponse> {
    const current = this.getResponse(currentAircraft, messagesPerSecond);
    const period = await getReceiverStatisticsRange({
      range,
      now: this.clock(),
      timezone: this.timezone,
      currentDay: this.getCurrentDaySnapshot(),
    });
    return {
      ...current,
      coverage: period.coverage,
      coverageSummary: period.coverageSummary,
      todayCoverageSummary: current.coverageSummary,
      period,
    };
  }

  getCurrentDaySnapshot(): CurrentDayStatisticsSnapshot {
    this.ensureDay(this.clock());
    return {
      date: this.currentDate,
      uniqueAircraftCount: this.uniqueAircraftCount,
      maxConcurrentAircraft: this.maxConcurrentAircraft,
      maxDistanceKm: this.maxDistanceKm,
      aircraft: [...this.aircraft.values()].map((item) => ({ ...item })),
      coverage: Array.from({ length: COVERAGE_BUCKET_COUNT }, (_, azimuthBucket) => ({
        azimuthBucket,
        maxDistanceKm: this.coverage.get(azimuthBucket) ?? 0,
      })),
    };
  }

  private getCoverage(): ReceiverStatisticsCoverageBucket[] {
    return Array.from({ length: COVERAGE_BUCKET_COUNT }, (_, azimuthBucket) => ({
      bearingFrom: azimuthBucket * COVERAGE_BUCKET_SIZE_DEGREES,
      bearingTo: (azimuthBucket + 1) * COVERAGE_BUCKET_SIZE_DEGREES,
      maxDistanceKm: this.coverage.get(azimuthBucket) ?? 0,
    }));
  }

  async close(): Promise<void> {
    this.flushIfDue(this.clock().getTime(), true);
    while (this.activeWrite) {
      const write = this.activeWrite;
      const failureCount = this.persistenceFailureCount;
      await write;
      if (this.persistenceFailureCount > failureCount) break;
      if (this.dirtyAircraft.size || this.dirtyCoverage.size || this.aggregateDirtyVersion !== null) {
        this.flushIfDue(this.clock().getTime(), true);
      }
    }
  }

  private ensureDay(date: Date): void {
    const nextDate = dayKey(date, this.timezone);
    if (nextDate === this.currentDate) return;
    this.flushIfDue(this.clock().getTime(), true);
    this.currentDate = nextDate;
    this.aircraft.clear();
    this.typeCounts.clear();
    this.airlineCounts.clear();
    this.coverage.clear();
    this.dirtyAircraft.clear();
    this.dirtyCoverage.clear();
    this.uniqueAircraftCount = 0;
    this.maxConcurrentAircraft = 0;
    this.maxDistanceKm = 0;
    this.maxDistanceIcaoHex = null;
    this.maxDistanceAt = null;
    this.aggregateDirtyVersion = null;
    this.lastFlushAttemptAt = this.clock().getTime();
    this.loaded = true;
  }

  private accountAircraft(icaoHex: string, aircraftType: string | null, airline: string | null): void {
    const previous = this.aircraft.get(icaoHex);
    if (!previous) {
      const record = { icaoHex, aircraftType, airline };
      this.aircraft.set(icaoHex, record);
      this.uniqueAircraftCount += 1;
      this.incrementBreakdown(this.typeCounts, aircraftType);
      this.incrementBreakdown(this.airlineCounts, airline);
      this.markAggregateDirty();
      this.markAircraftDirty(record);
      return;
    }

    const next = {
      icaoHex,
      aircraftType: aircraftType ?? previous.aircraftType,
      airline: airline ?? previous.airline,
    };
    if (next.aircraftType === previous.aircraftType && next.airline === previous.airline) return;
    this.decrementBreakdown(this.typeCounts, previous.aircraftType);
    this.decrementBreakdown(this.airlineCounts, previous.airline);
    this.incrementBreakdown(this.typeCounts, next.aircraftType);
    this.incrementBreakdown(this.airlineCounts, next.airline);
    this.aircraft.set(icaoHex, next);
    this.markAircraftDirty(next);
  }

  private mergePersisted(snapshot: ReceiverStatisticsPersistenceSnapshot): void {
    if (snapshot.date !== this.currentDate) return;
    this.uniqueAircraftCount = Math.max(this.uniqueAircraftCount, snapshot.uniqueAircraftCount);
    this.maxConcurrentAircraft = Math.max(this.maxConcurrentAircraft, snapshot.maxConcurrentAircraft);
    if (snapshot.maxDistanceKm > this.maxDistanceKm) {
      this.maxDistanceKm = snapshot.maxDistanceKm;
      this.maxDistanceIcaoHex = snapshot.maxDistanceIcaoHex;
      this.maxDistanceAt = snapshot.maxDistanceAt;
    }
    for (const item of snapshot.aircraft) {
      const icaoHex = normalizedHex(item.icaoHex);
      if (!icaoHex) continue;
      const record = { icaoHex, aircraftType: cleanValue(item.aircraftType), airline: cleanValue(item.airline) };
      const current = this.aircraft.get(icaoHex);
      if (current) {
        const merged = {
          icaoHex,
          aircraftType: current.aircraftType ?? record.aircraftType,
          airline: current.airline ?? record.airline,
        };
        if (merged.aircraftType !== current.aircraftType || merged.airline !== current.airline) {
          this.decrementBreakdown(this.typeCounts, current.aircraftType);
          this.decrementBreakdown(this.airlineCounts, current.airline);
          this.incrementBreakdown(this.typeCounts, merged.aircraftType);
          this.incrementBreakdown(this.airlineCounts, merged.airline);
          this.aircraft.set(icaoHex, merged);
        }
        continue;
      }
      this.aircraft.set(icaoHex, record);
      this.incrementBreakdown(this.typeCounts, record.aircraftType);
      this.incrementBreakdown(this.airlineCounts, record.airline);
    }
    for (const item of snapshot.coverage) {
      if (item.azimuthBucket < 0 || item.azimuthBucket >= COVERAGE_BUCKET_COUNT || !Number.isFinite(item.maxDistanceKm) || item.maxDistanceKm < 0) continue;
      this.coverage.set(item.azimuthBucket, Math.max(this.coverage.get(item.azimuthBucket) ?? 0, item.maxDistanceKm));
    }
  }

  private incrementBreakdown(map: Map<string, number>, value: string | null): void {
    if (value) map.set(value, (map.get(value) ?? 0) + 1);
  }

  private decrementBreakdown(map: Map<string, number>, value: string | null): void {
    if (!value) return;
    const next = (map.get(value) ?? 0) - 1;
    if (next > 0) map.set(value, next);
    else map.delete(value);
  }

  private markAggregateDirty(): void {
    this.version += 1;
    this.aggregateDirtyVersion = this.version;
  }

  private markAircraftDirty(record: DailyAircraftStatisticsRecord): void {
    this.version += 1;
    this.dirtyAircraft.set(record.icaoHex, { record, version: this.version });
  }

  private markCoverageDirty(azimuthBucket: number, maxDistanceKm: number): void {
    this.version += 1;
    this.dirtyCoverage.set(azimuthBucket, {
      record: { azimuthBucket, maxDistanceKm },
      version: this.version,
    });
  }

  private createPersistenceSnapshot(): ReceiverStatisticsPersistenceSnapshot {
    return {
      date: this.currentDate,
      uniqueAircraftCount: this.uniqueAircraftCount,
      maxConcurrentAircraft: this.maxConcurrentAircraft,
      maxDistanceKm: this.maxDistanceKm,
      maxDistanceIcaoHex: this.maxDistanceIcaoHex,
      maxDistanceAt: this.maxDistanceAt ? new Date(this.maxDistanceAt) : null,
      aircraft: [...this.dirtyAircraft.values()].map((item) => ({ ...item.record })),
      coverage: [...this.dirtyCoverage.values()].map((item) => ({ ...item.record })),
    };
  }

  private capturePendingWrite(): PendingStatisticsWrite {
    return {
      snapshot: this.createPersistenceSnapshot(),
      aircraftVersions: new Map([...this.dirtyAircraft].map(([hex, item]) => [hex, item.version])),
      coverageVersions: new Map([...this.dirtyCoverage].map(([bucket, item]) => [bucket, item.version])),
      aggregateVersion: this.aggregateDirtyVersion,
    };
  }

  private flushIfDue(now: number, force = false): void {
    if (!this.persistence || !this.persistenceEnabled) return;
    const dirty = this.dirtyAircraft.size > 0 || this.dirtyCoverage.size > 0 || this.aggregateDirtyVersion !== null;
    if (!dirty || !force && now - this.lastFlushAttemptAt < this.flushIntervalMs) return;
    const pending = this.capturePendingWrite();
    this.lastFlushAttemptAt = now;
    if (this.activeWrite) {
      // A date rollover can happen while the previous write is in flight.
      // Keep an immutable write for that date instead of clearing its dirty
      // state along with the new day's RAM state.
      if (force) this.queuedWrites.set(pending.snapshot.date, pending);
      return;
    }
    this.startWrite(pending);
  }

  private startWrite(pending: PendingStatisticsWrite): void {
    if (!this.persistence) return;
    const write = this.persistence.save(pending.snapshot)
      .then(() => {
        this.lastSuccessfulPersistenceAt = new Date(this.clock().getTime()).toISOString();
        for (const [hex, version] of pending.aircraftVersions) {
          if (this.dirtyAircraft.get(hex)?.version === version) this.dirtyAircraft.delete(hex);
        }
        for (const [bucket, version] of pending.coverageVersions) {
          if (this.dirtyCoverage.get(bucket)?.version === version) this.dirtyCoverage.delete(bucket);
        }
        if (this.aggregateDirtyVersion === pending.aggregateVersion) this.aggregateDirtyVersion = null;
      })
      .catch((error) => {
        // Keep dirty state for the next throttled attempt; live tracking is
        // entirely independent from this optional persistence lane.
        this.persistenceFailureCount += 1;
        console.error("AirRadar statistics persistence failed", error);
      })
      .finally(() => {
        this.activeWrite = null;
        const next = this.queuedWrites.entries().next();
        if (!next.done) {
          this.queuedWrites.delete(next.value[0]);
          this.startWrite(next.value[1]);
        }
      });
    this.activeWrite = write;
  }
}

const globalForStatistics = globalThis as unknown as { receiverStatistics?: ReceiverStatistics };

export function getReceiverStatistics(): ReceiverStatistics {
  globalForStatistics.receiverStatistics ??= new ReceiverStatistics();
  return globalForStatistics.receiverStatistics;
}
