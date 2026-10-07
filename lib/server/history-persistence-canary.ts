const WINDOW_MS = 60 * 60_000;
const BUCKET_MS = 60_000;
const MIN_TRANSACTION_SAMPLE = 60;

type Counts = {
  snapshots: number;
  eligibleAircraft: number;
  succeededAircraft: number;
  failedAircraft: number;
  transactionAttempts: number;
  transactionCommits: number;
  transactionFailures: number;
  statements: number;
  totalTransactionDurationMs: number;
  maxTransactionDurationMs: number;
  modeledBatch4Transactions: number;
  modeledBatch8Transactions: number;
};

type Bucket = Counts & { at: number };

const zero = (): Counts => ({
  snapshots: 0,
  eligibleAircraft: 0,
  succeededAircraft: 0,
  failedAircraft: 0,
  transactionAttempts: 0,
  transactionCommits: 0,
  transactionFailures: 0,
  statements: 0,
  totalTransactionDurationMs: 0,
  maxTransactionDurationMs: 0,
  modeledBatch4Transactions: 0,
  modeledBatch8Transactions: 0,
});

function add(target: Counts, source: Counts): void {
  target.snapshots += source.snapshots;
  target.eligibleAircraft += source.eligibleAircraft;
  target.succeededAircraft += source.succeededAircraft;
  target.failedAircraft += source.failedAircraft;
  target.transactionAttempts += source.transactionAttempts;
  target.transactionCommits += source.transactionCommits;
  target.transactionFailures += source.transactionFailures;
  target.statements += source.statements;
  target.totalTransactionDurationMs += source.totalTransactionDurationMs;
  target.maxTransactionDurationMs = Math.max(target.maxTransactionDurationMs, source.maxTransactionDurationMs);
  target.modeledBatch4Transactions += source.modeledBatch4Transactions;
  target.modeledBatch8Transactions += source.modeledBatch8Transactions;
}

function reductionPct(current: number, modeled: number): number | null {
  if (current <= 0) return null;
  return Math.max(0, Number((((current - modeled) / current) * 100).toFixed(1)));
}

function summarize(counts: Counts) {
  const idealPerAircraftTransactions = counts.eligibleAircraft;
  return {
    ...counts,
    meanStatementsPerTransaction: counts.transactionAttempts
      ? Number((counts.statements / counts.transactionAttempts).toFixed(2))
      : null,
    meanTransactionDurationMs: counts.transactionAttempts
      ? Number((counts.totalTransactionDurationMs / counts.transactionAttempts).toFixed(2))
      : null,
    transactionFailureRate: counts.transactionAttempts
      ? Number((counts.transactionFailures / counts.transactionAttempts).toFixed(4))
      : null,
    modeledBatch4TransactionReductionPct: reductionPct(idealPerAircraftTransactions, counts.modeledBatch4Transactions),
    modeledBatch8TransactionReductionPct: reductionPct(idealPerAircraftTransactions, counts.modeledBatch8Transactions),
  };
}

export interface HistoryPersistenceCanaryDiagnostics {
  scope: "process-local-shadow";
  startedAt: string;
  sampleReady: boolean;
  minimumTransactionSample: number;
  semantics: {
    productionWritesChanged: false;
    statementCountModeledAsUnchanged: true;
    batchLatencyMeasured: false;
    walMeasured: false;
    failureIsolationPreservedInProduction: true;
  };
  lifetime: ReturnType<typeof summarize>;
  windows: Array<{ minutes: 5 | 15 | 60; values: ReturnType<typeof summarize> }>;
}

export class HistoryPersistenceCanary {
  private readonly lifetime = zero();
  private readonly buckets: Bucket[] = [];
  private readonly startedAt = new Date().toISOString();

  observeTransaction(input: { durationMs: number; statements: number; success: boolean; nowMs?: number }): void {
    const now = input.nowMs ?? Date.now();
    const row = zero();
    row.transactionAttempts = 1;
    row.transactionCommits = input.success ? 1 : 0;
    row.transactionFailures = input.success ? 0 : 1;
    row.statements = Math.max(0, Math.trunc(input.statements));
    row.totalTransactionDurationMs = Math.max(0, input.durationMs);
    row.maxTransactionDurationMs = row.totalTransactionDurationMs;
    add(this.lifetime, row);
    this.record(row, now);
  }

  observeSnapshot(input: { eligibleAircraft: number; succeededAircraft: number; failedAircraft: number; nowMs?: number }): void {
    const now = input.nowMs ?? Date.now();
    const eligibleAircraft = Math.max(0, Math.trunc(input.eligibleAircraft));
    const row = zero();
    row.snapshots = 1;
    row.eligibleAircraft = eligibleAircraft;
    row.succeededAircraft = Math.max(0, Math.trunc(input.succeededAircraft));
    row.failedAircraft = Math.max(0, Math.trunc(input.failedAircraft));
    row.modeledBatch4Transactions = eligibleAircraft ? Math.ceil(eligibleAircraft / 4) : 0;
    row.modeledBatch8Transactions = eligibleAircraft ? Math.ceil(eligibleAircraft / 8) : 0;
    add(this.lifetime, row);
    this.record(row, now);
  }

  diagnostics(nowMs = Date.now()): HistoryPersistenceCanaryDiagnostics {
    this.expire(nowMs);
    return {
      scope: "process-local-shadow",
      startedAt: this.startedAt,
      sampleReady: this.lifetime.transactionAttempts >= MIN_TRANSACTION_SAMPLE,
      minimumTransactionSample: MIN_TRANSACTION_SAMPLE,
      semantics: {
        productionWritesChanged: false,
        statementCountModeledAsUnchanged: true,
        batchLatencyMeasured: false,
        walMeasured: false,
        failureIsolationPreservedInProduction: true,
      },
      lifetime: summarize(this.lifetime),
      windows: ([5, 15, 60] as const).map((minutes) => ({
        minutes,
        values: summarize(this.window(minutes, nowMs)),
      })),
    };
  }

  private record(row: Counts, now: number): void {
    const at = Math.floor(now / BUCKET_MS) * BUCKET_MS;
    let bucket = this.buckets.at(-1);
    if (!bucket || bucket.at !== at) {
      bucket = { ...zero(), at };
      this.buckets.push(bucket);
    }
    add(bucket, row);
    this.expire(now);
  }

  private expire(now: number): void {
    while (this.buckets.length && this.buckets[0]!.at < now - WINDOW_MS) this.buckets.shift();
  }

  private window(minutes: 5 | 15 | 60, now: number): Counts {
    const result = zero();
    const cutoff = now - minutes * 60_000;
    for (const bucket of this.buckets) {
      if (bucket.at >= cutoff) add(result, bucket);
    }
    return result;
  }
}

export const historyPersistenceCanary = new HistoryPersistenceCanary();
