import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { collectDatabase, createAdminCookie, projectRuntimeTelemetry } from "../scripts/monitoring/airradar-cpu-db-monitor.mjs";
import { summarize } from "../scripts/monitoring/airradar-monitor-report.mjs";

const runtime = (overrides = {}) => projectRuntimeTelemetry({
  schemaVersion: 4, scope: "process-local",
  runtime: { status: "enabled", cpuIntervalPercent: 12, cpuUserTimeMs: 100, cpuSystemTimeMs: 20,
    rssBytes: 20_000, heapUsedBytes: 10_000, eventLoopLagP95Ms: 4, eventLoopLagP99Ms: 9,
    eventLoopLagWindows: [], ...overrides },
});

describe("AirRadar CPU/DB monitoring contract", () => {
  it("collects PostgreSQL statistics only inside an explicit read-only transaction", async () => {
    const queries = [];
    const client = {
      async query(text) {
        queries.push(text.replace(/\s+/g, " ").trim());
        if (text.includes("FROM pg_stat_database")) return { rows: [{ datname: "airradar", xact_commit: "1" }] };
        if (text.includes("FROM pg_stat_wal")) return { rows: [{ wal_records: "2" }] };
        if (text.includes("FROM pg_stat_activity")) return { rows: [{ active: 0, waiting: 0, lock_waiting: 0, idle_in_transaction: 0 }] };
        if (text.includes("FROM pg_stat_statements")) return { rows: [{ statement_count: 0, calls: "0", total_exec_time_ms: 0, max_mean_exec_time_ms: 0 }] };
        return { rows: [] };
      },
    };
    const result = await collectDatabase(client);
    assert.equal(result.database.datname, "airradar");
    assert.equal(queries[0], "BEGIN TRANSACTION READ ONLY");
    assert.equal(queries.at(-1), "COMMIT");
    assert.ok(queries.some((query) => query.startsWith("SAVEPOINT")));
    assert.ok(queries.every((query) => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(query)));
  });

  it("rolls back the shared-account read-only transaction when a required read fails", async () => {
    const queries = [];
    const client = {
      async query(text) {
        queries.push(text.replace(/\s+/g, " ").trim());
        if (text.includes("FROM pg_stat_database")) throw new Error("stats unavailable");
        return { rows: [] };
      },
    };
    await assert.rejects(() => collectDatabase(client), /stats unavailable/);
    assert.equal(queries[0], "BEGIN TRANSACTION READ ONLY");
    assert.match(queries[1], /^SELECT datname,/);
    assert.equal(queries.at(-1), "ROLLBACK");
  });

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

  it("uses actual elapsed cadence and rejects duplicate timestamps", () => {
    const now = Date.parse("2026-10-28T12:01:00.000Z");
    const report = summarize([
      { schemaVersion: 1, recordedAt: "2026-10-28T12:00:00.000Z", runtime: { cpuIntervalPercent: 10, rssBytes: 100, eventLoopP99Ms: 4 }, database: { wal: {}, database: { xact_commit: "10", xact_rollback: "1", stats_reset: "2026-10-01T00:00:00Z" }, activity: { lock_waiting: 0 } }, hostCpu: { status: "available" } },
      { schemaVersion: 1, recordedAt: "2026-10-28T12:01:00.000Z", runtime: { cpuIntervalPercent: 20, rssBytes: 200, eventLoopP99Ms: 8 }, database: { wal: null, database: { xact_commit: "15", xact_rollback: "2", stats_reset: "2026-10-01T00:00:00Z" }, activity: { lock_waiting: 2 } }, hostCpu: { status: "unavailable", reason: "not_configured" } },
      { schemaVersion: 1, recordedAt: "2026-10-28T12:01:00.000Z", runtime: { cpuIntervalPercent: 20, rssBytes: 200, eventLoopP99Ms: 8 }, database: { database: { xact_commit: "15", xact_rollback: "2", stats_reset: "2026-10-01T00:00:00Z" } } },
    ], { hours: 1, asOf: now, timerEvents: [
      { success: true, startedAt: "2026-10-28T12:00:00.000Z", finishedAt: "2026-10-28T12:00:01.000Z" },
      { success: true, startedAt: "2026-10-28T12:01:00.000Z", finishedAt: "2026-10-28T12:01:01.000Z" },
    ] });
    assert.deepEqual(report.runtime.cpuPercent, { count: 2, p50: 10, p95: 20, max: 20 });
    assert.equal(report.database.walSamples, 1);
    assert.equal(report.availabilityPercent, 100);
    assert.deepEqual(report.diagnostics.duplicates, ["2026-10-28T12:01:00.000Z"]);
    assert.deepEqual(report.database.transactionDelta, { commits: 5, rollbacks: 1 });
    assert.deepEqual(report.database.counterDiagnostics.continuity, { commits: "continuous_since_stats_reset", rollbacks: "continuous_since_stats_reset" });
    assert.equal(report.diagnostics.identityStatus, "unknown");
    assert.equal(report.qualityStatus, "INSUFFICIENT_EVIDENCE");
    assert.equal(report.database.maxLockWaiting, 2);
    assert.equal(report.hostCpu.unavailableSamples, 1);
    assert.equal(report.schedule.serviceDurationSeconds.p95, 1);
  });

  it("counts missing timer slots in journal-based availability", () => {
    const report = summarize([], { timerEvents: [
      { success: true, startedAt: "2026-10-28T12:00:00.000Z" },
      { success: false, startedAt: "2026-10-28T12:01:00.000Z" },
      { success: true, startedAt: "2026-10-28T12:03:16.000Z" },
    ] });
    assert.equal(report.availabilityPercent, 40);
    assert.equal(report.schedule.missedTimerIntervals, 2);
    assert.equal(report.schedule.expectedTimerEvents, 5);
    assert.equal(report.diagnostics.timerMissingIntervals[0].missedIntervals, 2);
  });

  it("reports missing intervals after the cadence plus randomized delay", () => {
    const report = summarize([
      { schemaVersion: 1, recordedAt: "2026-10-28T12:00:00.000Z", runtime: {}, database: {} },
      { schemaVersion: 1, recordedAt: "2026-10-28T12:03:16.000Z", runtime: {}, database: {} },
    ], { asOf: Date.parse("2026-10-28T12:04:00.000Z"), hours: 1 });
    assert.equal(report.diagnostics.missingIntervals[0].missedIntervals, 3);
    assert.equal(report.qualityStatus, "INSUFFICIENT_EVIDENCE");
  });

  it("marks a process restart and PostgreSQL counter reset as invalid evidence", () => {
    const base = { schemaVersion: 1, runtime: {}, database: { database: { xact_commit: "10", xact_rollback: "1", stats_reset: "2026-10-01T00:00:00Z" } } };
    const report = summarize([
      { ...base, recordedAt: "2026-10-28T12:00:00.000Z", processIdentity: "a" },
      { ...base, recordedAt: "2026-10-28T12:01:00.000Z", processIdentity: "b", database: { database: { xact_commit: "2", xact_rollback: "0", stats_reset: "2026-10-02T00:00:00Z" } } },
    ], { asOf: Date.parse("2026-10-28T12:02:00.000Z"), hours: 1 });
    assert.equal(report.diagnostics.restarts, true);
    assert.equal(report.database.transactionDelta.commits, null);
    assert.equal(report.database.counterDiagnostics.commits, "counter_reset");
    assert.equal(report.database.counterDiagnostics.continuity.commits, "reset_detected");
    assert.equal(report.diagnostics.identityStatus, "restart_detected");
  });

  it("does not claim a counter delta when stats_reset is missing", () => {
    const sample = (recordedAt, count) => ({ schemaVersion: 1, recordedAt, runtime: {}, database: { database: { xact_commit: String(count), xact_rollback: "0" } } });
    const report = summarize([sample("2026-10-28T12:00:00.000Z", 1), sample("2026-10-28T12:01:00.000Z", 2)], { asOf: Date.parse("2026-10-28T12:02:00.000Z"), hours: 1 });
    assert.equal(report.database.transactionDelta.commits, null);
    assert.equal(report.database.counterDiagnostics.commits, "stats_reset_missing");
    assert.equal(report.database.counterDiagnostics.continuity.commits, "unknown_stats_reset");
  });

  it("does not expose process identifiers and does not infer stability without one", () => {
    const sample = (recordedAt, processIdentity) => ({ schemaVersion: 1, recordedAt, processIdentity, runtime: {}, database: { database: { xact_commit: "1", xact_rollback: "0", stats_reset: "2026-10-01T00:00:00Z" } } });
    const report = summarize([sample("2026-10-28T12:00:00.000Z", "secret-pid-or-id"), sample("2026-10-28T12:01:00.000Z", "secret-pid-or-id")], { asOf: Date.parse("2026-10-28T12:02:00.000Z"), hours: 1 });
    assert.equal(report.diagnostics.identityStatus, "stable_observed");
    assert.equal(JSON.stringify(report).includes("secret-pid-or-id"), false);
    const unknown = summarize([sample("2026-10-28T12:00:00.000Z"), sample("2026-10-28T12:01:00.000Z")], { asOf: Date.parse("2026-10-28T12:02:00.000Z"), hours: 1 });
    assert.equal(unknown.diagnostics.identityStatus, "unknown");
    assert.equal(unknown.qualityStatus, "INSUFFICIENT_EVIDENCE");
  });

  it("supports an explicit post-activation audit window", () => {
    const sample = (recordedAt) => ({ schemaVersion: 1, recordedAt, runtime: {}, database: { database: { xact_commit: "1", xact_rollback: "0", stats_reset: "2026-10-01T00:00:00Z" } } });
    const report = summarize([
      sample("2026-10-28T17:03:01.000Z"),
      sample("2026-10-28T18:40:04.000Z"),
      sample("2026-10-28T18:41:04.000Z"),
    ], { startAt: "2026-10-28T18:40:00.000Z", endAt: "2026-10-28T18:42:00.000Z", asOf: Date.parse("2026-10-28T18:42:00.000Z"), hours: 24 });
    assert.equal(report.sampleCount, 2);
    assert.equal(report.windowStart, "2026-10-28T18:40:00.000Z");
    assert.equal(report.windowEnd, "2026-10-28T18:42:00.000Z");
  });
});
