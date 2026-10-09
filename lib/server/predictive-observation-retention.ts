import { Temporal } from "temporal-polyfill";

export const PREDICTIVE_RETENTION_DAYS = 90;
export const PREDICTIVE_RETENTION_BATCH_SIZE = 1_000;
export const PREDICTIVE_RETENTION_MAX_BATCHES = 10;

interface ObservationRow { observationKey: string }
interface ObservationQuery {
  where(predicate: (row: { predictedAt: { lt(value: unknown): unknown }; observationKey: { in(value: string[]): unknown } }) => unknown): ObservationQuery;
  orderBy(order: (row: { predictedAt: { asc(): unknown } }) => unknown): ObservationQuery;
  limit(limit: number): ObservationQuery;
  select(field: "observationKey"): ObservationQuery;
  all(): Promise<ObservationRow[]>;
  deleteAndCount(): Promise<number>;
}
export interface PredictiveObservationRetentionDatabase {
  orm: { public: { PredictiveObservation: ObservationQuery } };
}
export interface PredictiveObservationRetentionReport {
  version: "predictive-retention-v1";
  cutoff: string;
  mode: "DRY_RUN" | "APPLY";
  rowsSelected: number;
  rowsDeleted: number;
  batches: number;
  complete: boolean;
}

/** Explicit maintenance lane only. No live receiver/aircraft or prediction writes. */
export async function prunePredictiveObservationRetention(
  database: PredictiveObservationRetentionDatabase,
  options: { now?: Date; apply?: boolean; batchSize?: number; maxBatches?: number } = {},
): Promise<PredictiveObservationRetentionReport> {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid retention clock");
  const batchSize = Math.min(5_000, Math.max(1, Math.trunc(options.batchSize ?? PREDICTIVE_RETENTION_BATCH_SIZE)));
  const maxBatches = Math.min(50, Math.max(1, Math.trunc(options.maxBatches ?? PREDICTIVE_RETENTION_MAX_BATCHES)));
  const cutoff = new Date(now.getTime() - PREDICTIVE_RETENTION_DAYS * 86_400_000);
  const cutoffInstant = Temporal.Instant.fromEpochMilliseconds(cutoff.getTime());
  const table = database.orm.public.PredictiveObservation;
  let rowsSelected = 0;
  let rowsDeleted = 0;
  let batches = 0;
  let complete = false;
  // A dry run inspects just one bounded window; it never reads all old rows.
  for (let index = 0; index < (options.apply ? maxBatches : 1); index++) {
    const rows = await table
      .where((row) => row.predictedAt.lt(cutoffInstant))
      .orderBy((row) => row.predictedAt.asc())
      .limit(batchSize + 1)
      .select("observationKey").all();
    const keys = rows.slice(0, batchSize).map((row) => row.observationKey);
    rowsSelected += keys.length;
    batches += 1;
    if (options.apply && keys.length) {
      rowsDeleted += await table.where((row) => row.observationKey.in(keys)).deleteAndCount();
    }
    complete = rows.length <= batchSize;
    if (complete || !options.apply) break;
  }
  return {
    version: "predictive-retention-v1", cutoff: cutoff.toISOString(),
    mode: options.apply ? "APPLY" : "DRY_RUN",
    rowsSelected, rowsDeleted, batches, complete,
  };
}
