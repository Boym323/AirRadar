import { describe, expect, it, beforeEach } from "vitest";
import {
  getDbTransactionDiagnostics,
  resetDbTransactionDiagnosticsForTests,
  trackDbTransaction,
} from "@/lib/server/db-transaction-diagnostics";

describe("database transaction attribution", () => {
  beforeEach(() => resetDbTransactionDiagnosticsForTests());

  it("records a successful transaction and its duration", async () => {
    await trackDbTransaction("history.snapshot", async () => 42, 1);
    const lane = getDbTransactionDiagnostics().lanes["history.snapshot"];
    expect(lane.attempts).toBe(1);
    expect(lane.commits).toBe(1);
    expect(lane.failures).toBe(0);
    expect(lane.active).toBe(0);
    expect(lane.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(lane.windows["5m"].workUnits).toBe(1);
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
});
