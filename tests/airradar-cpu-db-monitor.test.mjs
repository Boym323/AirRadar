import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createAdminCookie, projectRuntimeTelemetry } from "../scripts/monitoring/airradar-cpu-db-monitor.mjs";
import { summarize } from "../scripts/monitoring/airradar-monitor-report.mjs";

const runtime = (overrides = {}) => projectRuntimeTelemetry({
  schemaVersion: 4, scope: "process-local",
  runtime: { status: "enabled", cpuIntervalPercent: 12, cpuUserTimeMs: 100, cpuSystemTimeMs: 20,
    rssBytes: 20_000, heapUsedBytes: 10_000, eventLoopLagP95Ms: 4, eventLoopLagP99Ms: 9,
    eventLoopLagWindows: [], ...overrides },
});

describe("AirRadar CPU/DB monitoring contract", () => {
  it("does not deny V8 executable memory in the Node systemd sampler", () => {
    const unit = readFileSync(new URL("../deploy/systemd/airradar-cpu-db-monitor.service", import.meta.url), "utf8");
    assert.doesNotMatch(unit, /^MemoryDenyWriteExecute=yes$/m);
  });

  it("creates a bounded session cookie from the existing admin secret", () => {
    const cookie = createAdminCookie("test-secret", 1_700_000_000_000);
    assert.match(cookie, /^airradar_watchlist_session=1700028800\.[A-Za-z0-9_-]+$/);
  });

  it("accepts only the real admin runtime schema and projects bounded fields", () => {
    assert.equal(runtime().eventLoopP99Ms, 9);
    assert.throws(() => projectRuntimeTelemetry({ schemaVersion: 4, scope: "process-local", runtime: {} }), /disabled/);
    assert.throws(() => runtime({ status: "disabled" }), /disabled/);
    assert.throws(() => runtime({ rssBytes: null }), /required runtime telemetry/);
  });

  it("summarizes runtime and availability without turning missing DB-host CPU into zero", () => {
    const now = Date.now();
    const report = summarize([
      { schemaVersion: 1, recordedAt: new Date(now - 60_000).toISOString(), runtime: { cpuIntervalPercent: 10, rssBytes: 100, eventLoopP99Ms: 4 }, database: { wal: {}, database: { xact_commit: "10", xact_rollback: "1" }, activity: { lock_waiting: 0 } }, hostCpu: { status: "available" } },
      { schemaVersion: 1, recordedAt: new Date(now).toISOString(), runtime: { cpuIntervalPercent: 20, rssBytes: 200, eventLoopP99Ms: 8 }, database: { wal: null, database: { xact_commit: "15", xact_rollback: "2" }, activity: { lock_waiting: 2 } }, hostCpu: { status: "unavailable", reason: "not_configured" } },
    ], { hours: 1 });
    assert.deepEqual(report.runtime.cpuPercent, { count: 2, p50: 10, p95: 20, max: 20 });
    assert.equal(report.database.walSamples, 1);
    assert.equal(report.availabilityPercent, 3.33);
    assert.deepEqual(report.database.transactionDelta, { commits: 5, rollbacks: 1 });
    assert.equal(report.database.maxLockWaiting, 2);
    assert.equal(report.hostCpu.unavailableSamples, 1);
  });
});
