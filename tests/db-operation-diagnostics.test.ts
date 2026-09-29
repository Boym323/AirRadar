import { describe, expect, it } from "vitest";
import {
  getDbOperationDiagnostics,
  resetDbOperationDiagnosticsForTests,
  trackDbOperation,
} from "@/lib/server/db-operation-diagnostics";

describe("db operation diagnostics", () => {
  it("tracks successful reads and writes with metadata", async () => {
    resetDbOperationDiagnosticsForTests();
    await trackDbOperation("weather.observation.query", async () => "ok", 2);
    await trackDbOperation("weather.observation.create", async () => "ok");
    const snapshot = getDbOperationDiagnostics();
    expect(snapshot.scope).toBe("process-local");
    expect(snapshot.lanes["weather.observation.query"].kind).toBe("READ");
    expect(snapshot.lanes["weather.observation.query"].operation).toBe("SELECT");
    expect(snapshot.lanes["weather.observation.query"].successes).toBe(1);
    expect(snapshot.lanes["weather.observation.query"].windows["5m"].workUnits).toBe(2);
    expect(snapshot.lanes["weather.observation.create"].kind).toBe("WRITE");
  });

  it("preserves failures and concurrency counters", async () => {
    resetDbOperationDiagnosticsForTests();
    const gate: { resolve?: () => void } = {};
    const wait = new Promise<void>((resolve) => { gate.resolve = resolve; });
    const first = trackDbOperation("navigation.anomaly.upsert", async () => { await wait; });
    const second = trackDbOperation("navigation.anomaly.upsert", async () => { await wait; });
    await Promise.resolve();
    expect(getDbOperationDiagnostics().lanes["navigation.anomaly.upsert"].active).toBe(2);
    gate.resolve?.();
    await Promise.all([first, second]);
    const error = new Error("expected");
    await expect(trackDbOperation("navigation.observation.create", async () => { throw error; })).rejects.toBe(error);
    const lane = getDbOperationDiagnostics().lanes["navigation.observation.create"];
    expect(lane.failures).toBe(1);
    expect(lane.windows["60m"].failures).toBe(1);
  });

  it("shares the global store across module instances", async () => {
    resetDbOperationDiagnosticsForTests();
    const duplicate = await import("@/lib/server/db-operation-diagnostics");
    await duplicate.trackDbOperation("atc.dataset.load", async () => undefined);
    expect(getDbOperationDiagnostics().lanes["atc.dataset.load"].successes).toBe(1);
    expect(duplicate.getDbOperationDiagnostics().diagnosticsStoreId).toBe(getDbOperationDiagnostics().diagnosticsStoreId);
  });
});
