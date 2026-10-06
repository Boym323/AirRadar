import "temporal-polyfill/full/global";
import {
  OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION,
  OPERATIONAL_TWIN_OUTCOME_VERSION,
  OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION,
  REGIONAL_ATTENTION_OUTCOME_VERSION,
  type OperationalTwinEventOutcomeValidator,
  type OperationalTwinOutcomeValidator,
  type OperationalTwinTrajectoryQualityOutcomeValidator,
  type RegionalAttentionOutcomeValidator,
} from "@/lib/operational-twin";
import { getPrisma } from "@/lib/server/db";
import { trackDbTransaction } from "@/lib/server/db-transaction-diagnostics";
import { logger } from "@/lib/server/logger";

const FLUSH_DELAY_MS = 60_000;
const RETENTION_MS = 26 * 60 * 60_000;
const LANE_OUTCOME = "CORRIDOR_OUTCOME";
const LANE_EVENT_OUTCOME = "EVENT_OUTCOME";
const LANE_TRAJECTORY_QUALITY_OUTCOME = "TRAJECTORY_QUALITY_OUTCOME";
const LANE_REGIONAL_ATTENTION_OUTCOME = "REGIONAL_ATTENTION_OUTCOME";

type Lane =
  | typeof LANE_OUTCOME
  | typeof LANE_EVENT_OUTCOME
  | typeof LANE_TRAJECTORY_QUALITY_OUTCOME
  | typeof LANE_REGIONAL_ATTENTION_OUTCOME;

interface PersistedRow {
  lane: Lane;
  version: string;
  bucketStartMs: number;
  payloadJson: string;
}

export interface OperationalTwinCalibrationPersistenceStatus {
  version: "operational-digital-twin-calibration-persistence-v1";
  storage: "POSTGRESQL_5M_AGGREGATES";
  loaded: boolean;
  databaseAvailable: boolean;
  hydratedOutcomeBuckets: number;
  hydratedEventOutcomeBuckets: number;
  hydratedTrajectoryQualityOutcomeBuckets: number;
  hydratedRegionalAttentionOutcomeBuckets: number;
  trackedPersistedBuckets: number;
  rowsWritten: number;
  rowsDeleted: number;
  loadFailures: number;
  flushFailures: number;
  lastLoadAt: string | null;
  lastFlushAt: string | null;
}

function instant(ms: number): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(ms);
}

function timestampMs(value: Temporal.Instant | Date): number {
  return value instanceof Date ? value.getTime() : value.epochMilliseconds;
}

export class OperationalTwinCalibrationPersistence {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight: Promise<void> | null = null;
  private readonly persistedPayloads = new Map<string, string>();
  private status: OperationalTwinCalibrationPersistenceStatus = {
    version: "operational-digital-twin-calibration-persistence-v1",
    storage: "POSTGRESQL_5M_AGGREGATES",
    loaded: false,
    databaseAvailable: false,
    hydratedOutcomeBuckets: 0,
    hydratedEventOutcomeBuckets: 0,
    hydratedTrajectoryQualityOutcomeBuckets: 0,
    hydratedRegionalAttentionOutcomeBuckets: 0,
    trackedPersistedBuckets: 0,
    rowsWritten: 0,
    rowsDeleted: 0,
    loadFailures: 0,
    flushFailures: 0,
    lastLoadAt: null,
    lastFlushAt: null,
  };

  constructor(
    private readonly outcome: OperationalTwinOutcomeValidator,
    private readonly eventOutcome: OperationalTwinEventOutcomeValidator,
    private readonly trajectoryQualityOutcome: OperationalTwinTrajectoryQualityOutcomeValidator,
    private readonly regionalAttentionOutcome: RegionalAttentionOutcomeValidator,
  ) {}

  getStatus(): OperationalTwinCalibrationPersistenceStatus {
    return { ...this.status, trackedPersistedBuckets: this.persistedPayloads.size };
  }

  async load(now = Date.now()): Promise<void> {
    if (this.status.loaded) return;
    const database = getPrisma();
    this.status.databaseAvailable = Boolean(database);
    if (!database) {
      this.status.loaded = true;
      return;
    }

    try {
      const cutoff = instant(now - RETENTION_MS);
      const rows = await database.orm.public.OperationalTwinCalibrationBucket
        .where((row) => row.bucketStart.gte(cutoff))
        .all();

      const outcomeRows = rows
        .filter((row) => row.lane === LANE_OUTCOME && row.version === OPERATIONAL_TWIN_OUTCOME_VERSION)
        .map((row) => ({ startMs: timestampMs(row.bucketStart), payloadJson: row.payloadJson }));
      const eventRows = rows
        .filter((row) => row.lane === LANE_EVENT_OUTCOME && row.version === OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION)
        .map((row) => ({ startMs: timestampMs(row.bucketStart), payloadJson: row.payloadJson }));
      const trajectoryQualityRows = rows
        .filter((row) =>
          row.lane === LANE_TRAJECTORY_QUALITY_OUTCOME
          && row.version === OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION
        )
        .map((row) => ({ startMs: timestampMs(row.bucketStart), payloadJson: row.payloadJson }));
      const regionalAttentionRows = rows
        .filter((row) => row.lane === LANE_REGIONAL_ATTENTION_OUTCOME && row.version === REGIONAL_ATTENTION_OUTCOME_VERSION)
        .map((row) => ({ startMs: timestampMs(row.bucketStart), payloadJson: row.payloadJson }));

      this.status.hydratedOutcomeBuckets = this.outcome.hydrateCalibrationBuckets(outcomeRows, now);
      this.status.hydratedEventOutcomeBuckets = this.eventOutcome.hydrateCalibrationBuckets(eventRows, now);
      this.status.hydratedTrajectoryQualityOutcomeBuckets =
        this.trajectoryQualityOutcome.hydrateCalibrationBuckets(trajectoryQualityRows, now);
      this.status.hydratedRegionalAttentionOutcomeBuckets = this.regionalAttentionOutcome.hydrateCalibrationBuckets(regionalAttentionRows, now);
      for (const row of rows) {
        if (
          (row.lane !== LANE_OUTCOME || row.version !== OPERATIONAL_TWIN_OUTCOME_VERSION)
          && (row.lane !== LANE_EVENT_OUTCOME || row.version !== OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION)
          && (
            row.lane !== LANE_TRAJECTORY_QUALITY_OUTCOME
            || row.version !== OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION
          )
          && (row.lane !== LANE_REGIONAL_ATTENTION_OUTCOME || row.version !== REGIONAL_ATTENTION_OUTCOME_VERSION)
        ) continue;
        const bucketStartMs = timestampMs(row.bucketStart);
        this.persistedPayloads.set(this.key(row.lane as Lane, row.version, bucketStartMs), row.payloadJson);
      }
      this.status.loaded = true;
      this.status.lastLoadAt = new Date(now).toISOString();
    } catch (error) {
      this.status.loaded = true;
      this.status.loadFailures += 1;
      logger.warn({ error }, "Operational Digital Twin calibration persistence load failed");
    }
  }

  scheduleFlush(): void {
    if (this.timer || !this.status.databaseAvailable) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  async flush(now = Date.now()): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushInFlight) return this.flushInFlight;

    const database = getPrisma();
    this.status.databaseAvailable = Boolean(database);
    if (!database) return;

    const rows: PersistedRow[] = [
      ...this.outcome.exportCalibrationBuckets(now).map<PersistedRow>((bucket) => ({
        lane: LANE_OUTCOME,
        version: OPERATIONAL_TWIN_OUTCOME_VERSION,
        bucketStartMs: bucket.startMs,
        payloadJson: bucket.payloadJson,
      })),
      ...this.eventOutcome.exportCalibrationBuckets(now).map<PersistedRow>((bucket) => ({
        lane: LANE_EVENT_OUTCOME,
        version: OPERATIONAL_TWIN_EVENT_OUTCOME_VERSION,
        bucketStartMs: bucket.startMs,
        payloadJson: bucket.payloadJson,
      })),
      ...this.trajectoryQualityOutcome.exportCalibrationBuckets(now).map<PersistedRow>((bucket) => ({
        lane: LANE_TRAJECTORY_QUALITY_OUTCOME,
        version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION,
        bucketStartMs: bucket.startMs,
        payloadJson: bucket.payloadJson,
      })),
      ...this.regionalAttentionOutcome.exportCalibrationBuckets(now).map<PersistedRow>((bucket) => ({
        lane: LANE_REGIONAL_ATTENTION_OUTCOME,
        version: REGIONAL_ATTENTION_OUTCOME_VERSION,
        bucketStartMs: bucket.startMs,
        payloadJson: bucket.payloadJson,
      })),
    ];
    const changed = rows.filter((row) =>
      this.persistedPayloads.get(this.key(row.lane, row.version, row.bucketStartMs)) !== row.payloadJson
    );
    const cutoffMs = now - RETENTION_MS;

    this.flushInFlight = (async () => {
      try {
        let written = 0;
        let deleted = 0;
        await trackDbTransaction("operational-twin.calibration", () => database.transaction(async (transaction) => {
          const table = transaction.orm.public.OperationalTwinCalibrationBucket;
          for (const row of changed) {
            const bucketStart = instant(row.bucketStartMs);
            const existing = await table.where({
              lane: row.lane,
              version: row.version,
              bucketStart,
            }).first();
            const values = {
              payloadJson: row.payloadJson,
              updatedAt: instant(now),
            };
            if (existing) {
              await table.where({
                lane: row.lane,
                version: row.version,
                bucketStart,
              }).update(values);
            } else {
              await table.create({
                lane: row.lane,
                version: row.version,
                bucketStart,
                payloadJson: row.payloadJson,
                updatedAt: instant(now),
              });
            }
            written += 1;
          }
          deleted = await table
            .where((row) => row.bucketStart.lt(instant(cutoffMs)))
            .deleteAndCount();
        }), changed.length + 1);

        for (const row of changed) {
          this.persistedPayloads.set(this.key(row.lane, row.version, row.bucketStartMs), row.payloadJson);
        }
        for (const key of [...this.persistedPayloads.keys()]) {
          const startMs = Number(key.slice(key.lastIndexOf(":") + 1));
          if (Number.isFinite(startMs) && startMs < cutoffMs) this.persistedPayloads.delete(key);
        }
        this.status.rowsWritten += written;
        this.status.rowsDeleted += deleted;
        this.status.lastFlushAt = new Date(now).toISOString();
      } catch (error) {
        this.status.flushFailures += 1;
        logger.warn({ error }, "Operational Digital Twin calibration persistence flush failed");
      }
    })().finally(() => {
      this.flushInFlight = null;
    });
    return this.flushInFlight;
  }

  async stop(now = Date.now()): Promise<void> {
    await this.flush(now);
  }

  private key(lane: Lane, version: string, bucketStartMs: number): string {
    return `${lane}:${version}:${bucketStartMs}`;
  }
}
