#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

function percentile(values, p) { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null; }
function summary(values) { const valid = values.filter(Number.isFinite); return { count: valid.length, p50: percentile(valid, .5), p95: percentile(valid, .95), max: valid.length ? Math.max(...valid) : null }; }
function parseTime(value) { const time = Date.parse(value); return Number.isFinite(time) ? time : null; }
function round(value) { return Number(value.toFixed(2)); }
function timerEventTime(event) { return parseTime(event?.startedAt ?? event?.recordedAt ?? event?.finishedAt); }

export function summarize(samples, {
  hours = 24, asOf = Date.now(), cadenceSeconds = 60, randomizedDelaySeconds = 15,
  timerEvents = [], startAt = null, endAt = null,
} = {}) {
  const windowHours = Math.min(168, Math.max(1, Number(hours) || 24));
  const windowStart = startAt === null ? Number(asOf) - windowHours * 3_600_000 : parseTime(startAt);
  const windowEnd = endAt === null ? Number(asOf) : parseTime(endAt);
  const candidates = samples.filter((x) => x?.schemaVersion === 1 && parseTime(x.recordedAt) !== null)
    .filter((x) => parseTime(x.recordedAt) >= windowStart && parseTime(x.recordedAt) <= windowEnd)
    .sort((a, b) => parseTime(a.recordedAt) - parseTime(b.recordedAt));
  const seen = new Set();
  const duplicates = [];
  const valid = candidates.filter((sample) => {
    if (seen.has(sample.recordedAt)) { duplicates.push(sample.recordedAt); return false; }
    seen.add(sample.recordedAt);
    return true;
  });
  const first = valid[0];
  const last = valid.at(-1);
  const elapsedSeconds = first && last ? Math.max(0, (parseTime(last.recordedAt) - parseTime(first.recordedAt)) / 1000) : 0;
  const gapLimitSeconds = Number(cadenceSeconds) + Math.max(0, Number(randomizedDelaySeconds) || 0);
  const missingIntervals = [];
  for (let index = 1; index < valid.length; index += 1) {
    const from = parseTime(valid[index - 1].recordedAt);
    const to = parseTime(valid[index].recordedAt);
    if (to - from > gapLimitSeconds * 1000) {
      missingIntervals.push({
        from: valid[index - 1].recordedAt, to: valid[index].recordedAt,
        gapSeconds: round((to - from) / 1000),
        missedIntervals: Math.max(1, Math.ceil(((to - from) / 1000 - randomizedDelaySeconds) / cadenceSeconds) - 1),
      });
    }
  }
  const identityValues = valid.map((sample) => sample.processIdentity ?? sample.runtime?.processIdentity ?? sample.runtime?.startedAt).filter(Boolean);
  const identityCount = new Set(identityValues).size;
  const identityStatus = identityCount === 0 ? "unknown" : identityCount === 1 ? "stable_observed" : "restart_detected";
  const restarts = identityStatus === "restart_detected";
  const counterDelta = (field) => {
    const before = Number(first?.database?.database?.[field]);
    const after = Number(last?.database?.database?.[field]);
    const resets = valid.slice(1).some((sample, index) => Number(sample.database?.database?.[field]) < Number(valid[index].database?.database?.[field]));
    const statsReset = valid.map((sample) => sample.database?.database?.stats_reset).filter((value) => value !== undefined);
    const missingStatsReset = statsReset.length === 0 || statsReset.some((value) => value === null || value === "");
    const changedStatsReset = statsReset.filter(Boolean).some((value) => value !== statsReset.find(Boolean));
    const continuity = missingStatsReset ? "unknown_stats_reset" : changedStatsReset || resets ? "reset_detected" : "continuous_since_stats_reset";
    return {
      value: continuity === "continuous_since_stats_reset" && Number.isFinite(before) && Number.isFinite(after) ? after - before : null,
      reason: continuity === "unknown_stats_reset" ? "stats_reset_missing" : continuity === "reset_detected" ? "counter_reset" : null,
      continuity,
    };
  };
  const timerSuccesses = timerEvents.filter((event) => event?.success === true).length;
  const timedEvents = timerEvents.map((event) => ({ event, time: timerEventTime(event) }))
    .filter((entry) => entry.time !== null).sort((a, b) => a.time - b.time);
  const timerMissingIntervals = [];
  for (let index = 1; index < timedEvents.length; index += 1) {
    const gapSeconds = (timedEvents[index].time - timedEvents[index - 1].time) / 1000;
    if (gapSeconds > gapLimitSeconds) {
      timerMissingIntervals.push({
        from: new Date(timedEvents[index - 1].time).toISOString(),
        to: new Date(timedEvents[index].time).toISOString(), gapSeconds: round(gapSeconds),
        missedIntervals: Math.max(1, Math.ceil((gapSeconds - randomizedDelaySeconds) / cadenceSeconds) - 1),
      });
    }
  }
  const missedTimerIntervals = timerMissingIntervals.reduce((sum, gap) => sum + gap.missedIntervals, 0);
  const timerExpectedEvents = timerEvents.length > 0 ? timerEvents.length + missedTimerIntervals : 0;
  const timerAvailability = timerEvents.length > 0
    ? round(timerSuccesses / Math.max(1, timerExpectedEvents) * 100) : null;
  const serviceDurations = timerEvents.map((event) => {
    const started = parseTime(event?.startedAt); const finished = parseTime(event?.finishedAt);
    return started !== null && finished !== null && finished >= started ? (finished - started) / 1000 : null;
  }).filter((value) => value !== null);
  // Without the journal, only a conservative lower-bound estimate is possible:
  // OnUnitActiveSec plus the maximum RandomizedDelaySec is the widest legal
  // interval. Exact availability therefore requires timerEvents.
  const inferredExpectedSamples = elapsedSeconds > 0 ? Math.floor(elapsedSeconds / (Number(cadenceSeconds) + Math.max(0, Number(randomizedDelaySeconds) || 0))) + 1 : valid.length;
  const availabilityPercent = timerAvailability ?? (valid.length > 0 ? round(valid.length / Math.max(1, inferredExpectedSamples) * 100) : 0);
  const commits = counterDelta("xact_commit");
  const rollbacks = counterDelta("xact_rollback");
  return {
    schemaVersion: 1, windowHours, windowStart: new Date(windowStart).toISOString(), windowEnd: new Date(windowEnd).toISOString(), sampleCount: valid.length,
    firstRecordedAt: valid[0]?.recordedAt ?? null, lastRecordedAt: valid.at(-1)?.recordedAt ?? null,
    elapsedHours: round(elapsedSeconds / 3_600),
    elapsed24h: elapsedSeconds >= 24 * 3_600,
    qualityStatus: elapsedSeconds >= 24 * 3_600 && duplicates.length === 0 && missingIntervals.length === 0
      && identityStatus === "stable_observed"
      && commits.continuity === "continuous_since_stats_reset"
      && rollbacks.continuity === "continuous_since_stats_reset" ? "SUFFICIENT" : "INSUFFICIENT_EVIDENCE",
    availabilityPercent,
    availabilityMethod: timerEvents.length > 0 ? "journal_timer_events" : "sample_cadence_inference",
    schedule: { cadenceSeconds, randomizedDelaySeconds, inferredExpectedSamples, timerEvents: timerEvents.length, successfulTimerEvents: timerSuccesses, missedTimerIntervals, expectedTimerEvents: timerExpectedEvents, serviceDurationSeconds: summary(serviceDurations) },
    diagnostics: { duplicates, missingIntervals, timerMissingIntervals, restarts, identityStatus },
    runtime: {
      cpuPercent: summary(valid.map((x) => x.runtime?.cpuIntervalPercent)),
      rssBytes: summary(valid.map((x) => x.runtime?.rssBytes)),
      eventLoopP99Ms: summary(valid.map((x) => x.runtime?.eventLoopP99Ms)),
    },
    database: {
      walSamples: valid.filter((x) => x.database?.wal).length,
      transactionSamples: valid.filter((x) => x.database?.database).length,
      lockWaitSamples: valid.filter((x) => x.database?.activity).length,
      transactionDelta: { commits: commits.value, rollbacks: rollbacks.value },
      counterDiagnostics: { commits: commits.reason, rollbacks: rollbacks.reason, continuity: { commits: commits.continuity, rollbacks: rollbacks.continuity } },
      maxLockWaiting: valid.reduce((max, x) => Math.max(max, Number(x.database?.activity?.lock_waiting) || 0), 0),
    },
    hostCpu: { availableSamples: valid.filter((x) => x.hostCpu?.status === "available").length, unavailableSamples: valid.filter((x) => x.hostCpu?.status !== "available").length },
  };
}
export async function readSamples(directory) {
  const names = (await readdir(directory)).filter((name) => /^sample-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();
  const rows = [];
  for (const name of names) for (const line of (await readFile(join(directory, name), "utf8")).split("\n")) if (line.trim()) { try { rows.push(JSON.parse(line)); } catch { /* ignore a truncated final line */ } }
  return rows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const directory = process.env.AIRRADAR_MONITOR_OUTPUT_DIR ?? "/var/lib/airradar/monitoring";
  const hours = Number(process.env.AIRRADAR_MONITOR_REPORT_HOURS ?? 24);
  readSamples(directory).then((samples) => console.log(JSON.stringify(summarize(samples, { hours }), null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
