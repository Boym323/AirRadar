import "temporal-polyfill/full/global";
import type { Aircraft } from "@/lib/aircraft/types";
import { COVERAGE_BUCKET_COUNT, COVERAGE_BUCKET_SIZE_DEGREES } from "@/lib/statistics-coverage";
import { dayKey, getAppTimezone } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { STATISTICS_FLUSH_INTERVAL_MS } from "@/lib/server/statistics";

export const ALTITUDE_COVERAGE_BANDS = [
  { id: 0, minFt: 0, maxFt: 5_000 },
  { id: 1, minFt: 5_000, maxFt: 15_000 },
  { id: 2, minFt: 15_000, maxFt: 30_000 },
  { id: 3, minFt: 30_000, maxFt: null },
] as const;

export const MIN_PLAUSIBLE_GROUND_SPEED_KT = 30;
export const MAX_PLAUSIBLE_GROUND_SPEED_KT = 800;

export interface ReceiverAltitudeCoverageRecord {
  azimuthBucket: number;
  altitudeBand: number;
  maxDistanceKm: number;
}

export interface ReceiverFastestRecord {
  speedKt: number;
  icaoHex: string;
  registration: string | null;
  callsign: string | null;
  recordedAt: string;
}

export interface ReceiverAdvancedStatisticsSnapshot {
  date: string;
  receiverMessagesCount: number | null;
  receiverMessagesRawLast: number | null;
  altitudeCoverage: ReceiverAltitudeCoverageRecord[];
  fastest: ReceiverFastestRecord | null;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function altitudeCoverageBand(altitudeFt: number | null | undefined): number | null {
  const altitude = finiteNonNegative(altitudeFt);
  if (altitude === null) return null;
  if (altitude < 5_000) return 0;
  if (altitude < 15_000) return 1;
  if (altitude < 30_000) return 2;
  return 3;
}

export function plausibleGroundSpeedKt(aircraft: Pick<Aircraft, "groundSpeed" | "onGround">): number | null {
  const speed = aircraft.groundSpeed;
  if (aircraft.onGround || speed === null || !Number.isFinite(speed)) return null;
  if (speed < MIN_PLAUSIBLE_GROUND_SPEED_KT || speed > MAX_PLAUSIBLE_GROUND_SPEED_KT) return null;
  return speed;
}

function coverageKey(azimuthBucket: number, altitudeBand: number): number {
  return azimuthBucket * ALTITUDE_COVERAGE_BANDS.length + altitudeBand;
}

function validPositionedAircraft(aircraft: Aircraft): boolean {
  return aircraft.lat !== null && Number.isFinite(aircraft.lat) && aircraft.lat >= -90 && aircraft.lat <= 90
    && aircraft.lon !== null && Number.isFinite(aircraft.lon) && aircraft.lon >= -180 && aircraft.lon <= 180
    && !(aircraft.lat === 0 && aircraft.lon === 0)
    && aircraft.distanceKm !== null && Number.isFinite(aircraft.distanceKm) && aircraft.distanceKm >= 0
    && aircraft.bearing !== null && Number.isFinite(aircraft.bearing) && aircraft.bearing >= 0 && aircraft.bearing < 360;
}

/**
 * Small receiver-intelligence sidecar. It is fed by the same local readsb
 * snapshots as the live radar and never starts a timer or another poller.
 * PostgreSQL writes are opportunistically throttled to the existing 30 s
 * statistics cadence and are never awaited by the live provider path.
 */
export class ReceiverAdvancedStatistics {
  private readonly timezone: string;
  private currentDate: string;
  private initializedDate: string | null = null;
  private receiverMessagesCount: number | null = null;
  private receiverMessagesRawLast: number | null = null;
  private altitudeCoverage = new Map<number, ReceiverAltitudeCoverageRecord>();
  private dirtyAltitude = new Set<number>();
  private fastest: ReceiverFastestRecord | null = null;
  private aggregateDirty = false;
  private lastFlushAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(timezone = getAppTimezone()) {
    this.timezone = timezone;
    this.currentDate = dayKey(new Date(), timezone);
  }

  observe(aircraft: Aircraft[], receiverMessagesTotal: number | null | undefined, observedAt = new Date()): void {
    const copied = aircraft.map((item) => ({ ...item }));
    this.queue = this.queue
      .then(() => this.observeInternal(copied, receiverMessagesTotal, observedAt))
      .catch((error) => {
        console.error("AirRadar advanced receiver statistics failed", error);
      });
  }

  async close(): Promise<void> {
    await this.queue;
    await this.flush(true);
  }

  getSnapshot(now = new Date()): ReceiverAdvancedStatisticsSnapshot {
    const date = dayKey(now, this.timezone);
    if (date !== this.currentDate) {
      return { date, receiverMessagesCount: null, receiverMessagesRawLast: null, altitudeCoverage: [], fastest: null };
    }
    return {
      date: this.currentDate,
      receiverMessagesCount: this.receiverMessagesCount,
      receiverMessagesRawLast: this.receiverMessagesRawLast,
      altitudeCoverage: [...this.altitudeCoverage.values()].map((row) => ({ ...row })),
      fastest: this.fastest ? { ...this.fastest } : null,
    };
  }

  private async observeInternal(aircraft: Aircraft[], receiverMessagesTotal: number | null | undefined, observedAt: Date): Promise<void> {
    const nextDate = dayKey(observedAt, this.timezone);
    if (nextDate !== this.currentDate) await this.rollover(nextDate);
    if (!await this.ensureLoaded()) return;
    this.observeMessages(receiverMessagesTotal);

    for (const item of aircraft) {
      if (!validPositionedAircraft(item)) continue;
      const azimuthBucket = Math.min(COVERAGE_BUCKET_COUNT - 1, Math.floor(item.bearing! / COVERAGE_BUCKET_SIZE_DEGREES));
      const altitudeBand = altitudeCoverageBand(item.altitude);
      if (altitudeBand !== null) {
        const key = coverageKey(azimuthBucket, altitudeBand);
        const previous = this.altitudeCoverage.get(key)?.maxDistanceKm ?? 0;
        if (item.distanceKm! > previous) {
          this.altitudeCoverage.set(key, { azimuthBucket, altitudeBand, maxDistanceKm: item.distanceKm! });
          this.dirtyAltitude.add(key);
        }
      }

      const speed = plausibleGroundSpeedKt(item);
      if (speed !== null && (!this.fastest || speed > this.fastest.speedKt)) {
        this.fastest = {
          speedKt: speed,
          icaoHex: item.icaoHex.trim().toUpperCase(),
          registration: clean(item.registration),
          callsign: clean(item.callsign),
          recordedAt: observedAt.toISOString(),
        };
        this.aggregateDirty = true;
      }
    }

    await this.flush(false, observedAt.getTime());
  }

  private observeMessages(receiverMessagesTotal: number | null | undefined): void {
    const raw = finiteNonNegative(receiverMessagesTotal);
    if (raw === null) return;
    if (this.receiverMessagesRawLast === null) {
      this.receiverMessagesRawLast = raw;
      this.receiverMessagesCount ??= 0;
      this.aggregateDirty = true;
      return;
    }
    const delta = raw >= this.receiverMessagesRawLast ? raw - this.receiverMessagesRawLast : raw;
    if (delta > 0) {
      this.receiverMessagesCount = (this.receiverMessagesCount ?? 0) + delta;
      this.aggregateDirty = true;
    }
    if (raw !== this.receiverMessagesRawLast) {
      this.receiverMessagesRawLast = raw;
      this.aggregateDirty = true;
    }
  }

  private async rollover(nextDate: string): Promise<void> {
    await this.flush(true);
    const crossDayRaw = this.receiverMessagesRawLast;
    this.currentDate = nextDate;
    this.initializedDate = null;
    this.receiverMessagesCount = crossDayRaw === null ? null : 0;
    this.receiverMessagesRawLast = crossDayRaw;
    this.altitudeCoverage = new Map();
    this.dirtyAltitude = new Set();
    this.fastest = null;
    this.aggregateDirty = crossDayRaw !== null;
    this.lastFlushAt = 0;
  }

  private async ensureLoaded(): Promise<boolean> {
    if (this.initializedDate === this.currentDate) return true;
    const database = getPrisma();
    if (!database) {
      this.initializedDate = this.currentDate;
      return true;
    }
    try {
      const schema = database.orm.public;
      const [aggregate, altitudeRows] = await Promise.all([
        schema.ReceiverDailyStats.where({ date: this.currentDate }).first(),
        schema.ReceiverDailyCoverageAltitude.where({ date: this.currentDate }).all(),
      ]);
      if (aggregate) {
        this.receiverMessagesCount = finiteNonNegative(aggregate.receiverMessagesCount);
        this.receiverMessagesRawLast = finiteNonNegative(aggregate.receiverMessagesRawLast);
        const speed = finiteNonNegative(aggregate.maxGroundSpeedKt);
        if (speed !== null && aggregate.maxGroundSpeedIcaoHex && aggregate.maxGroundSpeedAt) {
          const recordedAt = aggregate.maxGroundSpeedAt instanceof Date
            ? aggregate.maxGroundSpeedAt.toISOString()
            : aggregate.maxGroundSpeedAt.toString();
          this.fastest = {
            speedKt: speed,
            icaoHex: aggregate.maxGroundSpeedIcaoHex,
            registration: aggregate.maxGroundSpeedRegistration,
            callsign: aggregate.maxGroundSpeedCallsign,
            recordedAt,
          };
        }
      }
      for (const row of altitudeRows) {
        if (!Number.isInteger(row.azimuthBucket) || row.azimuthBucket < 0 || row.azimuthBucket >= COVERAGE_BUCKET_COUNT) continue;
        if (!Number.isInteger(row.altitudeBand) || row.altitudeBand < 0 || row.altitudeBand >= ALTITUDE_COVERAGE_BANDS.length) continue;
        const distance = finiteNonNegative(row.maxDistanceKm);
        if (distance === null) continue;
        const key = coverageKey(row.azimuthBucket, row.altitudeBand);
        this.altitudeCoverage.set(key, { azimuthBucket: row.azimuthBucket, altitudeBand: row.altitudeBand, maxDistanceKm: distance });
      }
      this.initializedDate = this.currentDate;
      return true;
    } catch (error) {
      console.error("AirRadar advanced receiver statistics load failed", error);
      return false;
    }
  }

  private async flush(force: boolean, now = Date.now()): Promise<void> {
    const database = getPrisma();
    if (!database || this.initializedDate !== this.currentDate) return;
    if (!this.aggregateDirty && this.dirtyAltitude.size === 0) return;
    if (!force && now - this.lastFlushAt < STATISTICS_FLUSH_INTERVAL_MS) return;
    this.lastFlushAt = now;

    const aggregateDirty = this.aggregateDirty;
    const dirtyKeys = [...this.dirtyAltitude];
    const altitudeRows = dirtyKeys
      .map((key) => this.altitudeCoverage.get(key))
      .filter((row): row is ReceiverAltitudeCoverageRecord => Boolean(row));
    const fastest = this.fastest ? { ...this.fastest } : null;
    const receiverMessagesCount = this.receiverMessagesCount;
    const receiverMessagesRawLast = this.receiverMessagesRawLast;
    const date = this.currentDate;

    try {
      await database.transaction(async (transaction) => {
        const schema = transaction.orm.public;
        const updatedAt = Temporal.Instant.fromEpochMilliseconds(Date.now());
        if (aggregateDirty || altitudeRows.length) {
          const aggregateValues = {
            receiverMessagesCount,
            receiverMessagesRawLast,
            maxGroundSpeedKt: fastest?.speedKt ?? null,
            maxGroundSpeedIcaoHex: fastest?.icaoHex ?? null,
            maxGroundSpeedRegistration: fastest?.registration ?? null,
            maxGroundSpeedCallsign: fastest?.callsign ?? null,
            maxGroundSpeedAt: fastest ? Temporal.Instant.from(fastest.recordedAt) : null,
            updatedAt,
          };
          await schema.ReceiverDailyStats.upsert({
            update: aggregateValues,
            create: { date, ...aggregateValues },
          });
        }
        for (const row of altitudeRows) {
          const existing = await schema.ReceiverDailyCoverageAltitude
            .where({ date, azimuthBucket: row.azimuthBucket, altitudeBand: row.altitudeBand })
            .first();
          if (existing) {
            await schema.ReceiverDailyCoverageAltitude
              .where({ date, azimuthBucket: row.azimuthBucket, altitudeBand: row.altitudeBand })
              .update({ maxDistanceKm: Math.max(existing.maxDistanceKm, row.maxDistanceKm), updatedAt });
          } else {
            await schema.ReceiverDailyCoverageAltitude.create({
              date,
              azimuthBucket: row.azimuthBucket,
              altitudeBand: row.altitudeBand,
              maxDistanceKm: row.maxDistanceKm,
              updatedAt,
            });
          }
        }
      });
      if (date === this.currentDate) {
        if (aggregateDirty) this.aggregateDirty = false;
        for (const key of dirtyKeys) this.dirtyAltitude.delete(key);
      }
    } catch (error) {
      console.error("AirRadar advanced receiver statistics persistence failed", error);
    }
  }
}

const globalForReceiverAdvancedStatistics = globalThis as unknown as { receiverAdvancedStatistics?: ReceiverAdvancedStatistics };

export function getReceiverAdvancedStatistics(): ReceiverAdvancedStatistics {
  globalForReceiverAdvancedStatistics.receiverAdvancedStatistics ??= new ReceiverAdvancedStatistics();
  return globalForReceiverAdvancedStatistics.receiverAdvancedStatistics;
}
