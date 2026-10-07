import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDbTransactionDiagnostics,
  resetDbTransactionDiagnosticsForTests,
  trackDbTransaction,
} from "@/lib/server/db-transaction-diagnostics";

describe("database transaction attribution", () => {
  beforeEach(() => resetDbTransactionDiagnosticsForTests());

  it("records a successful transaction and its duration", async () => {
    await trackDbTransaction("history.snapshot", async () => 42, 1);
    const diagnostics = getDbTransactionDiagnostics();
    const lane = diagnostics.lanes["history.snapshot"];
    expect(diagnostics.scope).toBe("process-local");
    expect(diagnostics.processId).toBe(process.pid);
    expect(diagnostics.diagnosticsStoreId).toMatch(/^dbtx-/);
    expect(lane.attempts).toBe(1);
    expect(lane.commits).toBe(1);
    expect(lane.failures).toBe(0);
    expect(lane.active).toBe(0);
    expect(lane.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(lane.workUnits).toBe(1);
    expect(lane.windows["5m"].workUnits).toBe(1);
  });

  it("reads deferred work units after the transaction finishes", async () => {
    let statements = 1;
    await trackDbTransaction("history.snapshot", async () => {
      statements = 6;
    }, () => statements);
    const lane = getDbTransactionDiagnostics().lanes["history.snapshot"];
    expect(lane.workUnits).toBe(6);
    expect(lane.windows["5m"].workUnits).toBe(6);
  });

  it("records failures without changing the original error", async () => {
    const error = new Error("database failure");
    await expect(trackDbTransaction("receiver.coverage", async () => { throw error; })).rejects.toBe(error);
    const lane = getDbTransactionDiagnostics().lanes["receiver.coverage"];
    expect(lane.attempts).toBe(1);
    expect(lane.commits).toBe(0);
    expect(lane.failures).toBe(1);
    expect(lane.active).toBe(0);
  });

  it("tracks bounded concurrency and rejects unknown labels", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const first = trackDbTransaction("receiver.daily-stats", async () => wait);
    const second = trackDbTransaction("receiver.daily-stats", async () => wait);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getDbTransactionDiagnostics().lanes["receiver.daily-stats"].active).toBe(2);
    release();
    await Promise.all([first, second]);
    expect(getDbTransactionDiagnostics().lanes["receiver.daily-stats"].maxConcurrent).toBe(2);
    await expect(trackDbTransaction("unknown.lane" as never, async () => undefined)).rejects.toThrow("Unknown DB transaction diagnostics lane");
  });

  it("expires old rolling buckets", async () => {
    await trackDbTransaction("receiver.advanced-stats", async () => undefined);
    const now = Date.now();
    const snapshot = getDbTransactionDiagnostics(now + 61 * 60_000);
    expect(snapshot.lanes["receiver.advanced-stats"].windows["60m"].attempts).toBe(0);
  });

  it("keeps the store identity and start time across test resets", async () => {
    const before = getDbTransactionDiagnostics();
    await trackDbTransaction("history.snapshot", async () => undefined);
    resetDbTransactionDiagnosticsForTests();
    const after = getDbTransactionDiagnostics();
    expect(after.diagnosticsStoreId).toBe(before.diagnosticsStoreId);
    expect(after.startedAt).toBe(before.startedAt);
    expect(after.lanes["history.snapshot"].attempts).toBe(0);
  });

  it("shares counters across independently evaluated module consumers", async () => {
    await trackDbTransaction("receiver.coverage", async () => undefined);
    const first = getDbTransactionDiagnostics();

    vi.resetModules();

    const duplicateModule = await import("@/lib/server/db-transaction-diagnostics");
    const second = duplicateModule.getDbTransactionDiagnostics();

    expect(second.lanes["receiver.coverage"].attempts)
      .toBe(first.lanes["receiver.coverage"].attempts);
    expect(second.diagnosticsStoreId).toBe(first.diagnosticsStoreId);

    await duplicateModule.trackDbTransaction("receiver.coverage", async () => undefined);

    expect(getDbTransactionDiagnostics().lanes["receiver.coverage"].attempts).toBe(2);
  });
});
