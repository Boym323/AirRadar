import { describe, expect, it } from "vitest";
import { HistoryPersistenceCanary } from "@/lib/server/history-persistence-canary";

describe("HistoryPersistenceCanary", () => {
  it("records measured current transactions and models batch 4/8 commit boundaries", () => {
    const canary = new HistoryPersistenceCanary();

    canary.observeSnapshot({ eligibleAircraft: 10, succeededAircraft: 9, failedAircraft: 1, nowMs: 0 });
    for (let index = 0; index < 10; index += 1) {
      canary.observeTransaction({
        durationMs: 5 + index,
        statements: 6,
        success: index !== 9,
        nowMs: 0,
      });
    }

    const diagnostics = canary.diagnostics(0);
    expect(diagnostics.scope).toBe("process-local-shadow");
    expect(diagnostics.semantics).toEqual({
      productionWritesChanged: false,
      statementCountModeledAsUnchanged: true,
      batchLatencyMeasured: false,
      walMeasured: false,
      failureIsolationPreservedInProduction: true,
    });
    expect(diagnostics.lifetime).toMatchObject({
      snapshots: 1,
      eligibleAircraft: 10,
      succeededAircraft: 9,
      failedAircraft: 1,
      transactionAttempts: 10,
      transactionCommits: 9,
      transactionFailures: 1,
      statements: 60,
      modeledBatch4Transactions: 3,
      modeledBatch8Transactions: 2,
      modeledBatch4TransactionReductionPct: 70,
      modeledBatch8TransactionReductionPct: 80,
    });
    expect(diagnostics.lifetime.meanStatementsPerTransaction).toBe(6);
    expect(diagnostics.lifetime.meanTransactionDurationMs).toBe(9.5);
    expect(diagnostics.lifetime.transactionFailureRate).toBe(0.1);
    expect(diagnostics.sampleReady).toBe(false);
  });

  it("requires a meaningful transaction sample before declaring the shadow ready", () => {
    const canary = new HistoryPersistenceCanary();
    for (let index = 0; index < 60; index += 1) {
      canary.observeTransaction({ durationMs: 1, statements: 5, success: true, nowMs: index });
    }
    expect(canary.diagnostics(60).sampleReady).toBe(true);
  });

  it("expires old rolling buckets without losing lifetime evidence", () => {
    const canary = new HistoryPersistenceCanary();
    canary.observeSnapshot({ eligibleAircraft: 8, succeededAircraft: 8, failedAircraft: 0, nowMs: 0 });
    canary.observeTransaction({ durationMs: 4, statements: 5, success: true, nowMs: 0 });

    const diagnostics = canary.diagnostics(61 * 60_000);
    expect(diagnostics.lifetime.transactionAttempts).toBe(1);
    expect(diagnostics.windows.find((window) => window.minutes === 60)?.values.transactionAttempts).toBe(0);
  });
});
