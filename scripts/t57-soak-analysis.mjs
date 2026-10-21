// T5.7C: allowlisted, read-only projections and offline 24-hour analysis.
// No raw API response, aircraft identity, position, token, cookie, PID or
// diagnostics store ID may be written to an output report. Process continuity
// uses a one-way process key derived from the private diagnostics identity.
import { createHash } from "node:crypto";
import { stats } from "./soak-statistics.mjs";

const MiB = 1024 * 1024;
const AUXILIARY_NAMES = [
  "sourcePreferences", "sourcePreferenceMissingSince", "lastHistorySample",
  "predictiveEvaluatedAt", "atcResolutionKeys", "atcShadowPredictionKeys",
];
const ROUTE_METRIC_NAMES = [
  "ramHit", "dbHit", "dbMiss", "dbWrite", "dbError", "dbBypassed",
  "adsbdbLookup",
  "dbLatencySamples", "dbLatencyTotalMs",
];
const ROUTE_PHASE_NAMES = [
  "routeResolution", "memoryLookup", "readThroughLoad", "postgresCacheRequest",
  "concurrencyBudget", "dbConnection", "resultProcessing", "cacheUpdate", "callerTimeout",
  "dbCallSettlement", "dbReadSettlement", "dbWriteSettlement", "dbMaintenanceSettlement",
  "dbMaintenanceCount", "dbMaintenancePrune",
  "dbLateSettlement", "callerTimeoutOvershoot",
];
const TWIN_PHASE_NAMES = [
  "truthInputFingerprint", "truthPoints", "truthStateDiff", "pendingTraversal",
  "pendingTruthEvaluation", "spatialTruthMatches", "atcContextComputation",
  "atcCacheOperations", "expiryHeap", "capacityEviction", "cleanup",
];
// These scopes are disjoint within the measured flow: pendingTraversal owns
// all of its truth/ATC descendants; the remaining scopes run outside it.
const TWIN_NON_OVERLAPPING_CPU_PHASES = ["pendingTraversal", "expiryHeap", "capacityEviction", "cleanup"];
const TWIN_LONG_OPERATION_PHASES = ["pendingTraversal", "truthStateDiff", "expiryHeap", "capacityEviction", "cleanup"];
const safe = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
const stamp = (x) => typeof x === "string" && Number.isFinite(Date.parse(x)) ? x : null;
const rounded = (x) => x === null ? null : Number(x.toFixed(3));
const median = (values) => stats(values)?.p50 ?? null;
const megabytes = (value) => value === null ? null : value / MiB;

function retentionMember(value) {
  if (!value || safe(value.count) === null) throw new Error("retention_member_unavailable");
  return {
    count: safe(value.count),
    oldestAgeMs: safe(value.oldestAgeMs),
    staleRetained: safe(value.staleRetained),
    ...(safe(value.points) !== null ? { points: safe(value.points) } : {}),
    ...(safe(value.maxPointsPerAircraft) !== null ? { maxPointsPerAircraft: safe(value.maxPointsPerAircraft) } : {}),
  };
}

function twinForensics(value) {
  if (!value || value.enabled !== true) return { enabled: false };
  const phase = (item) => ({
    calls: safe(item?.calls), sampledCalls: safe(item?.sampledCalls ?? item?.sampledPhaseCalls),
    sampledCpuMs: safe(item?.sampledCpuMs), sampledWallMs: safe(item?.sampledWallMs),
    estimatedCpuMs: safe(item?.estimatedCpuMs), estimatedWallMs: safe(item?.estimatedWallMs),
    p50Ms: safe(item?.sampleP50Ms), p95Ms: safe(item?.sampleP95Ms),
    p99Ms: safe(item?.sampleP99Ms), maxMs: safe(item?.sampleMaxMs),
    cpuP50Ms: safe(item?.sampleCpuP50Ms), cpuP95Ms: safe(item?.sampleCpuP95Ms),
    cpuP99Ms: safe(item?.sampleCpuP99Ms), cpuMaxMs: safe(item?.sampleCpuMaxMs),
    longOperationCount: safe(item?.longOperationCount),
    longOperationMaxWallMs: safe(item?.longOperationMaxWallMs),
  });
  const projectWindow = (window) => {
    const from = stamp(window?.from), to = stamp(window?.to);
    if (!from || !to || !window?.phases) return null;
    return {
      from, to,
      phases: Object.fromEntries(TWIN_PHASE_NAMES.map((name) => [name, phase(window.phases[name])])),
      counters: Object.fromEntries(["captures", "expirations", "truthInvalidations", "actualTruthResolutions", "pendingCapacityEvictions", "atcCacheEvictions", "atcCacheExpirations", "cacheHits", "cacheMisses"]
        .map((name) => [name, safe(window.counters?.[name])])),
    };
  };
  return {
    enabled: true,
    sampling: {
      every: safe(value.sampling?.every),
      longOperationThresholdMs: safe(value.sampling?.longOperationThresholdMs),
      longOperationPhases: TWIN_LONG_OPERATION_PHASES,
      cpuLatencyReservoirPerPhase: safe(value.sampling?.cpuLatencyReservoirPerPhase),
      wallLatencyReservoirPerPhase: safe(value.sampling?.wallLatencyReservoirPerPhase),
    },
    phases: Object.fromEntries(TWIN_PHASE_NAMES.map((name) => [name, phase(value.phases?.[name])])),
    windows: Array.isArray(value.windows) ? value.windows.slice(-30).map(projectWindow).filter(Boolean) : [],
    snapshotInvocationIntervalMs: value.snapshotInvocationIntervalMs ?? null,
    pendingPopulation: value.pendingPopulation ?? null,
    pendingAircraftPopulation: value.pendingAircraftPopulation ?? null,
    pendingPerAircraftDistribution: Object.fromEntries(["one", "two", "threeToFour", "fiveToEight", "overEight"]
      .map((name) => [name, safe(value.pendingPerAircraftDistribution?.[name])])),
    counters: Object.fromEntries(["captures", "expirations", "truthInvalidations", "actualTruthResolutions", "pendingCapacityEvictions", "atcCacheEvictions", "atcCacheExpirations", "cacheHits", "cacheMisses"]
      .map((name) => [name, safe(value.counters?.[name])])),
    cacheHitRate: safe(value.cacheHitRate),
    ratesPerMinute: Object.fromEntries(["captures", "expirations", "truthInvalidations", "actualTruthResolutions", "pendingCapacityEvictions", "atcCacheEvictions", "atcCacheExpirations", "cacheHits", "cacheMisses"]
      .map((name) => [name, safe(value.ratesPerMinute?.[name])])),
    attribution: "sampled synchronous scopes; nested phase timings are inclusive",
  };
}

function windows(items, type) {
  if (!Array.isArray(items)) return [];
  return items.slice(-15).flatMap((x) => {
    const from = stamp(x?.from), to = stamp(x?.to);
    if (!from || !to || Date.parse(to) <= Date.parse(from)) return [];
    if (type === "loop") {
      const p95Ms = safe(x.p95Ms), p99Ms = safe(x.p99Ms), maxMs = safe(x.maxMs);
      return p95Ms === null || p99Ms === null || maxMs === null ? [] : [{
        from, to, p95Ms, p99Ms, maxMs,
        gcCount: safe(x.gcCount), gcPauseMs: safe(x.gcPauseMs),
      }];
    }
    const calls = safe(x.calls), cpuMs = safe(x.cpuMs), waitMs = safe(x.waitMs);
    return calls === null || cpuMs === null || waitMs === null ? [] : [{
      from, to, calls, cpuMs, waitMs, p95Ms: safe(x.p95Ms), p99Ms: safe(x.p99Ms),
    }];
  });
}

export function projectT57SoakSample(status, metrics, at = new Date().toISOString()) {
  const runtime = metrics?.runtime;
  const system = status?.runtime;
  // readSystemStatus() flattens readRuntimeDiagnostics() onto runtime.
  // There is no runtime.diagnostics wrapper in the admin API response.
  const retention = system?.retentionAttribution;
  const process = system?.autocommitOperationAttribution;
  if (status?.detailLevel !== "admin" || ![2, 3, 4].includes(metrics?.schemaVersion) ||
      metrics?.scope !== "process-local" || runtime?.status !== "enabled" ||
      retention?.scope !== "process-local" ||
      !status.application?.commit || !Number.isSafeInteger(process?.processId) ||
      typeof process?.diagnosticsStoreId !== "string" || !process.diagnosticsStoreId) {
    throw new Error("t57_admin_telemetry_unavailable");
  }
  const local = retentionMember(retention.aircraft?.local);
  const network = retentionMember(retention.aircraft?.network);
  const trailsLocal = retentionMember(retention.trails?.local);
  const trailsNetwork = retentionMember(retention.trails?.network);
  const auxiliaryMaps = Object.fromEntries(AUXILIARY_NAMES.map((name) =>
    [name, safe(retention.auxiliaryMaps?.[name])]));
  if (Object.values(auxiliaryMaps).some((value) => value === null)) {
    throw new Error("t57_auxiliary_map_telemetry_unavailable");
  }
  if ([runtime.rssBytes, runtime.heapUsedBytes, system.aircraftCount,
      system.activeSseClients, system.localTrailOverLimitAircraftCount,
      system.networkTrailOverLimitAircraftCount, retention.snapshotCacheEntries,
      retention.listeners].some((value) => safe(value) === null)) {
    throw new Error("t57_required_diagnostic_missing");
  }
  const topPaths = Array.isArray(metrics.hotPaths) ? metrics.hotPaths.slice(0, 12) : [];
  const twinPaths = Array.isArray(metrics.validatorPaths) ? metrics.validatorPaths.slice(0, 5) : [];
  const metricPaths = [...new Map([...topPaths, ...twinPaths]
    .filter((p) => typeof p?.name === "string")
    .map((p) => [p.name, p])).values()];
  const hotPaths = metricPaths.flatMap((p) => {
    const name = p?.name;
    if (typeof name !== "string" || name.length > 80 || !/^[A-Za-z0-9_.:-]+$/.test(name)) return [];
    return [{
      name,
      calls: safe(p.calls),
      cpuMs: safe(p.cpuMs),
      waitMs: safe(p.waitMs),
      windows: windows(p.windows, "path"),
    }];
  });
  const oldSpace = Array.isArray(runtime.v8HeapSpaces)
    ? runtime.v8HeapSpaces.find((s) => s?.name === "old_space") : null;
  const gc = runtime.postMajorGc;
  const route = status?.routeEnrichment;
  const routeCache = route && typeof route === "object" ? {
    enabled: route.enabled === true,
    windowHours: safe(route.windowHours),
    buckets: Array.isArray(route.buckets) ? route.buckets.slice(-25).map((bucket) => ({
      hour: stamp(bucket?.hour),
      ...Object.fromEntries(ROUTE_METRIC_NAMES.map((name) => [name, safe(bucket?.[name])])),
    })) : [],
    totals: Object.fromEntries(ROUTE_METRIC_NAMES.map((name) => [name, safe(route.totals?.[name])])),
    databaseHitRate: typeof route.databaseHitRate === "number" && Number.isFinite(route.databaseHitRate) ? route.databaseHitRate : null,
    databaseAverageLatencyMs: safe(route.databaseAverageLatencyMs),
    phases: Object.fromEntries(ROUTE_PHASE_NAMES.map((name) => [name, route.phases?.[name] ? {
      measured: route.phases[name].measured === true,
      count: safe(route.phases[name].count), sampleCount: safe(route.phases[name].sampleCount),
      errors: safe(route.phases[name].errors), timeouts: safe(route.phases[name].timeouts),
      p50Ms: safe(route.phases[name].p50Ms), p95Ms: safe(route.phases[name].p95Ms),
      p99Ms: safe(route.phases[name].p99Ms), maxMs: safe(route.phases[name].maxMs),
    } : null])),
    sql: route.sql ? {
      active: safe(route.sql.active), activeWrites: safe(route.sql.activeWrites),
      maxActive: safe(route.sql.maxActive), rejected: safe(route.sql.rejected),
      probeAttempts: safe(route.sql.probeAttempts), probeFailures: safe(route.sql.probeFailures),
      failureStreak: safe(route.sql.failureStreak), halfOpenProbe: route.sql.halfOpenProbe === true,
      callerTimeouts: safe(route.sql.callerTimeouts), completedAfterCallerTimeout: safe(route.sql.completedAfterCallerTimeout),
      eventLoopAtTimeout: route.sql.eventLoopAtTimeout ? {
        sampleCount: safe(route.sql.eventLoopAtTimeout.sampleCount),
        p50Percent: safe(route.sql.eventLoopAtTimeout.p50Percent),
        p95Percent: safe(route.sql.eventLoopAtTimeout.p95Percent),
        p99Percent: safe(route.sql.eventLoopAtTimeout.p99Percent),
      } : null,
      circuit: { state: route.sql.circuit?.state === "open" ? "open" : "closed", openSince: stamp(route.sql.circuit?.openSince), openDurationMs: safe(route.sql.circuit?.openDurationMs) },
      timing: { measurement: "db_call_elapsed", serverSideOnly: false },
    } : null,
  } : null;
  return {
    // Identity MUST remain in memory; do not write this object to disk.
    identity: {
      commit: status.application.commit,
      pid: process.processId,
      storeId: process.diagnosticsStoreId,
    },
    sample: {
      at, commit: status.application.commit,
      version: typeof status.application.version === "string" ? status.application.version : null,
      processIdentity: createHash("sha256")
        .update(`${process.processId}:${process.diagnosticsStoreId}`)
        .digest("hex").slice(0, 24),
      rssBytes: safe(runtime.rssBytes),
      heapUsedBytes: safe(runtime.heapUsedBytes),
      heapTotalBytes: safe(runtime.heapTotalBytes),
      externalBytes: safe(runtime.externalBytes),
      oldSpaceBytes: safe(oldSpace?.usedBytes),
      cpuPercent: safe(runtime.cpuIntervalPercent),
      cgroupCpuQuotaCores: safe(system.cgroupCpuQuotaCores),
      cgroupCpuNrThrottled: safe(system.cgroupCpuNrThrottled),
      cgroupCpuThrottledUsec: safe(system.cgroupCpuThrottledUsec),
      cgroupCpuThrottleStatus: ["available", "controller_disabled", "unavailable"].includes(system.cgroupCpuThrottleStatus)
        ? system.cgroupCpuThrottleStatus : null,
      majorGcCount: safe(runtime.majorGcCount),
      postMajorGc: gc && safe(gc.observedAtMs) !== null ? {
        observedAtMs: safe(gc.observedAtMs), heapUsedBytes: safe(gc.heapUsedBytes),
        rssBytes: safe(gc.rssBytes), oldSpaceUsedBytes: safe(gc.oldSpaceUsedBytes),
      } : null,
      aircraftCount: safe(system.aircraftCount),
      activeSseClients: safe(system.activeSseClients),
      localTrailOverLimitAircraft: safe(system.localTrailOverLimitAircraftCount),
      networkTrailOverLimitAircraft: safe(system.networkTrailOverLimitAircraftCount),
      retention: {
        aircraft: { local, network }, trails: { local: trailsLocal, network: trailsNetwork },
        auxiliaryMaps, snapshotCacheEntries: safe(retention.snapshotCacheEntries),
        listeners: safe(retention.listeners),
      },
    eventLoopWindows: windows(runtime.eventLoopLagWindows, "loop"),
    operationalTwinForensics: twinForensics(metrics?.operationalTwinForensics),
      hotPaths,
      routeCache,
      health: {
        application: typeof status.status === "string" ? status.status : null,
        database: typeof status.database?.status === "string" ? status.database.status : null,
        receiver: typeof status.receiver?.status === "string" ? status.receiver.status : null,
        readsb: typeof status.receiver?.readsb?.status === "string" ? status.receiver.readsb.status : null,
      },
    },
  };
}

/**
 * Token-free read-only T58 projection. Only already-public, sanitized fields
 * are sampled. Administrator-only GC, retention, SQL and Twin forensics are
 * intentionally omitted and must never be inferred as zero.
 */
export function projectT57PublicSoakSample(status, metrics, at = new Date().toISOString()) {
  const app = status?.application, runtime = metrics?.runtime;
  const commitOK = typeof app?.commit === "string" && /^[a-f0-9]{8,40}$/i.test(app.commit);
  const startedAt = stamp(app?.startedAt);
  if (status?.detailLevel !== "public" || metrics?.schemaVersion !== 1 ||
      metrics?.scope !== "process-local" || runtime?.status !== "enabled" ||
      !commitOK || !startedAt || typeof app.version !== "string" ||
      !Array.isArray(runtime.eventLoopLagWindows) ||
      [runtime.rssBytes, runtime.heapUsedBytes, runtime.cpuIntervalPercent]
        .some((value) => safe(value) === null)) {
    throw new Error("t57_public_telemetry_unavailable");
  }
  // A bounded fingerprint of public startup metadata detects probable
  // restarts. It is NOT equivalent to private PID/store identity evidence.
  const processIdentity = createHash("sha256")
    .update(JSON.stringify([app.commit, startedAt])).digest("hex").slice(0, 24);
  return {
    identity: { commit: app.commit },
    sample: {
      telemetryMode: "public", at, commit: app.commit, version: app.version,
      processIdentity,
      rssBytes: safe(runtime.rssBytes),
      heapUsedBytes: safe(runtime.heapUsedBytes),
      heapTotalBytes: safe(runtime.heapTotalBytes),
      externalBytes: safe(runtime.externalBytes),
      oldSpaceBytes: null, cpuPercent: safe(runtime.cpuIntervalPercent),
      cgroupCpuQuotaCores: null, cgroupCpuNrThrottled: null,
      cgroupCpuThrottledUsec: null, cgroupCpuThrottleStatus: null,
      majorGcCount: null, postMajorGc: null,
      aircraftCount: null, activeSseClients: null,
      localTrailOverLimitAircraft: null, networkTrailOverLimitAircraft: null,
      retention: null,
      eventLoopWindows: windows(runtime.eventLoopLagWindows, "loop"),
      operationalTwinForensics: { enabled: false },
      hotPaths: [], routeCache: null,
      health: {
        application: typeof status.status === "string" ? status.status : null,
        database: typeof status.database?.status === "string" ? status.database.status : null,
        receiver: typeof status.receiver?.status === "string" ? status.receiver.status : null,
        readsb: typeof status.receiver?.readsb?.status === "string" ? status.receiver.readsb.status : null,
      },
    },
  };
}

// Return only completed, as-yet-unreported 60-second windows. Existing
// observer caches retain 15 windows, so reading once per minute is safe.
export function newT57Windows(sample, cursors) {
  const now = Date.parse(sample.at);
  const newWindows = (list, key) => {
    const previous = cursors.get(key) ?? Number.NEGATIVE_INFINITY;
    const newer = list.filter((w) => {
      const end = Date.parse(w.to);
      return end > previous && end <= now;
    });
    if (newer.length) cursors.set(key, Math.max(...newer.map((w) => Date.parse(w.to))));
    return newer;
  };
  return {
    ...sample,
    eventLoopWindows: newWindows(sample.eventLoopWindows, "event-loop"),
    hotPaths: sample.hotPaths.map((p) => ({
      ...p, windows: newWindows(p.windows, "hot:" + p.name),
    })),
  };
}

function series(samples, project) {
  return stats(samples.map(project));
}

function routeCounterDelta(first, last, name) {
  const a = first?.routeCache?.totals?.[name], b = last?.routeCache?.totals?.[name];
  return safe(a) === null || safe(b) === null || b < a ? null : b - a;
}

function pearson(pairs) {
  if (pairs.length < 3) return { samples: pairs.length, r: null };
  const xs = pairs.map(([x]) => x), ys = pairs.map(([, y]) => y);
  const mx = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const my = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const covariance = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const sx = Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((sum, y) => sum + (y - my) ** 2, 0));
  return { samples: pairs.length, r: sx > 0 && sy > 0 ? rounded(covariance / (sx * sy)) : null };
}

export function analyzeT57Soak(records) {
  if (!Array.isArray(records) || !records.length || records[0]?.type !== "header") {
    throw new Error("invalid_t57_report");
  }
  const header = records[0];
  if (header.schemaVersion !== 1 || ![undefined, "admin", "public"].includes(header.telemetryMode) ||
      !Number.isSafeInteger(header.seconds) ||
      !Number.isSafeInteger(header.intervalSeconds) || !Number.isSafeInteger(header.warmupSeconds)) {
    throw new Error("invalid_t57_header");
  }
  const telemetryMode = header.telemetryMode === "public" ? "public" : "admin";
  const allRows = records.filter((r) => r.type === "sample").map((r) => r.value);
  if (allRows.some((r) => (r?.telemetryMode ?? "admin") !== telemetryMode)) {
    throw new Error("t57_telemetry_mode_mismatch");
  }
  if (allRows.some((row) => !stamp(row?.at) || typeof row?.commit !== "string" || !row.commit ||
      !Object.hasOwn(row, "version") || (row.version !== null && typeof row.version !== "string") ||
      typeof row?.processIdentity !== "string" || !/^[a-f0-9]{24}$/.test(row.processIdentity))) {
    throw new Error("t57_sample_identity_incomplete");
  }
  const bySegment = new Map();
  for (const row of allRows) {
    const key = String(row.segment ?? "legacy");
    const group = bySegment.get(key) ?? [];
    group.push(row);
    bySegment.set(key, group);
  }
  // Never calculate a continuous trend by joining different process
  // lifetimes. The largest segment is reported as the primary window and all
  // other segments remain visible as separate evidence below.
  const primaryRows = [...bySegment.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const rows = primaryRows;
  const unavailable = records.filter((r) => r.type === "unavailable");
  const missing = unavailable.length;
  const allowedFailureCategories = ["http_timeout", "authentication_failure", "response_validation_failure", "collection_interruption",
    "network_failure", "http_failure", "unclassified_legacy"];
  const failureCategories = Object.fromEntries(allowedFailureCategories.map((category) => [category, 0]));
  for (const record of unavailable) {
    const category = allowedFailureCategories.includes(record.category) ? record.category : "unclassified_legacy";
    failureCategories[category] += 1;
  }
  const first = rows[0], last = rows.at(-1);
  const segmentIds = new Set(allRows.map((r) => r.segment));
  const segmentSummaries = [...bySegment.entries()].map(([segment, values]) => ({
    segment: Number.isFinite(Number(segment)) ? Number(segment) : segment,
    processIdentity: values[0]?.processIdentity ?? null,
    commit: values[0]?.commit ?? null,
    version: values[0]?.version ?? null,
    samples: values.length,
    from: values[0]?.at ?? null,
    to: values.at(-1)?.at ?? null,
    durationSeconds: values.length > 1 ? rounded((Date.parse(values.at(-1).at) - Date.parse(values[0].at)) / 1000) : 0,
  }));
  const segmentChanges = records.filter((record) => record.type === "segment_change").map((record) => ({
    at: stamp(record.at), segment: safe(record.segment),
    reason: Array.isArray(record.reason) ? record.reason.filter((item) =>
      ["process_identity_changed", "commit_changed", "version_changed"].includes(item)) : [],
  }));
  const steady = first ? rows.filter((r) => Date.parse(r.at) >=
    Date.parse(first.at) + header.warmupSeconds * 1000) : [];
  const span = first && last ? (Date.parse(last.at) - Date.parse(first.at)) / 1000 : 0;
  const sampleGaps = [];
  for (let index = 1; index < rows.length; index++) {
    const previousAt = Date.parse(rows[index - 1].at), currentAt = Date.parse(rows[index].at);
    const gapSeconds = (currentAt - previousAt) / 1000;
    if (gapSeconds > header.intervalSeconds * 1.5) sampleGaps.push({
      from: rows[index - 1].at, to: rows[index].at,
      missedIntervals: Math.max(1, Math.floor(gapSeconds / header.intervalSeconds) - 1),
    });
  }
  const expected = Math.ceil(header.seconds / header.intervalSeconds) + 1;
  const stable = segmentIds.size === 1 && rows.length > 1 &&
    rows.every((r) => r.commit === first.commit && r.version === first.version &&
      (!r.processIdentity || r.processIdentity === first.processIdentity));
  const gcBaselines = [...new Map(steady.flatMap((r) => {
    const g = r.postMajorGc;
    return g?.observedAtMs && g.observedAtMs >= Date.parse(first.at) +
      header.warmupSeconds * 1000 ? [[g.observedAtMs, g]] : [];
  })).values()].sort((a, b) => a.observedAtMs - b.observedAtMs);
  const gcTrend = (key) => gcBaselines.length < 2 ||
    safe(gcBaselines.at(-1)?.[key]) === null || safe(gcBaselines[0]?.[key]) === null
    ? null : rounded((gcBaselines.at(-1)[key] - gcBaselines[0][key]) / MiB);
  const loopWindows = [...new Map(steady.flatMap((r) => r.eventLoopWindows ?? [])
    .map((w) => [w.to, w])).values()];
  const twinSamples = steady.map((row) => row.operationalTwinForensics).filter((item) => item?.enabled);
  const twinWindows = [...new Map(twinSamples.flatMap((item) => item.windows ?? [])
    .map((window) => [window.to, window])).values()];
  const delayedPollingMisses = unavailable.filter((record) => record.pollDelayCategory === "delayed_polling");
  const eventLoopSchedulingDelayCorrelatedMisses = delayedPollingMisses.filter((record) => {
    const atMs = Date.parse(record.at);
    return loopWindows.some((window) => Date.parse(window.from) <= atMs && Date.parse(window.to) >= atMs
      && window.maxMs >= 1_000);
  });
  const pathWindowsByName = new Map();
  const twinWindowsByTo = new Map();
  for (const row of steady) {
    for (const path of row.hotPaths ?? []) {
      let windowsByTo = pathWindowsByName.get(path.name);
      if (!windowsByTo) pathWindowsByName.set(path.name, windowsByTo = new Map());
      for (const window of path.windows ?? []) windowsByTo.set(window.to, window);
    }
    for (const window of row.operationalTwinForensics?.windows ?? []) twinWindowsByTo.set(window.to, window);
  }
  const matchingLoopWindow = (window) => {
    const from = Date.parse(window.from), to = Date.parse(window.to);
    return loopWindows.map((loop) => ({ loop, overlap: Math.max(0,
      Math.min(to, Date.parse(loop.to)) - Math.max(from, Date.parse(loop.from))) }))
      .sort((a, b) => b.overlap - a.overlap)[0];
  };
  const pairedWindowCpu = (windowsByTo, cpuOf) => [...windowsByTo.values()].flatMap((window) => {
    const match = matchingLoopWindow(window), cpuMs = cpuOf(window);
    return match?.overlap > 0 && safe(cpuMs) !== null ? [[match.loop.maxMs, cpuMs]] : [];
  });
  const nonOverlappingTwinCpu = (window) => {
    let total = 0;
    let measured = false;
    for (const name of TWIN_NON_OVERLAPPING_CPU_PHASES) {
      const phase = window.phases?.[name];
      const calls = safe(phase?.calls ?? phase?.estimatedCalls ?? phase?.sampledPhaseCalls);
      const cpuMs = safe(phase?.estimatedCpuMs);
      if (calls === null || (calls > 0 && cpuMs === null)) return null;
      if (cpuMs !== null) {
        measured = true;
        total += cpuMs;
      }
    }
    return measured ? total : null;
  };
  const stallCorrelations = Object.fromEntries([
    ...["snapshot.operationalTwin", "twin.eventOutcome.local", "history.persist", "network.metadata"].map((name) =>
      [name, pearson(pairedWindowCpu(pathWindowsByName.get(name) ?? new Map(), (window) => window.cpuMs))]),
    ["operationalTwin.nonOverlappingTopLevelPhases", pearson(pairedWindowCpu(twinWindowsByTo, nonOverlappingTwinCpu))],
    ["gc.pause", pearson(loopWindows.flatMap((window) => safe(window.gcPauseMs) === null ? [] : [[window.maxMs, window.gcPauseMs]]))],
    ["cgroup.cpuThrottledUsecDelta", (() => {
      const ordered = [...steady].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const pairs = [];
      for (let index = 1; index < ordered.length; index += 1) {
        const before = safe(ordered[index - 1].cgroupCpuThrottledUsec);
        const after = safe(ordered[index].cgroupCpuThrottledUsec);
        if (before === null || after === null || after < before) continue;
        const end = Date.parse(ordered[index].at);
        const loop = loopWindows.find((window) => Date.parse(window.to) <= end && Date.parse(window.to) > Date.parse(ordered[index - 1].at));
        if (loop) pairs.push([loop.maxMs, after - before]);
      }
      return pearson(pairs);
    })()],
  ]);
  const stallThresholdMs = 1_000;
  const confirmedSynchronousBlockers = [];
  const unattributedStalls = [];
  for (const loop of loopWindows.filter((window) => window.maxMs >= stallThresholdMs)) {
    const matches = twinWindows.filter((window) => {
      const overlap = Math.min(Date.parse(loop.to), Date.parse(window.to)) - Math.max(Date.parse(loop.from), Date.parse(window.from));
      return overlap > 0;
    });
    const longPhases = TWIN_PHASE_NAMES.flatMap((name) => matches.flatMap((window) => {
      const phase = window.phases?.[name];
      const sampledCpuBlock = safe(phase?.cpuMaxMs) !== null && phase.cpuMaxMs >= stallThresholdMs;
      const detectedLongWallBlock = safe(phase?.longOperationMaxWallMs) !== null
        && phase.longOperationMaxWallMs >= stallThresholdMs;
      return sampledCpuBlock || detectedLongWallBlock ? [{
        phase: name,
        evidence: [
          ...(sampledCpuBlock ? ["sampled_process_cpu"] : []),
          ...(detectedLongWallBlock ? ["all_call_long_wall_detection"] : []),
        ],
        sampledCpuMaxMs: safe(phase?.cpuMaxMs),
        sampledWallMaxMs: safe(phase?.maxMs),
        longOperationCount: safe(phase?.longOperationCount),
        longOperationMaxWallMs: safe(phase?.longOperationMaxWallMs),
        windowTo: window.to,
      }] : [];
    }));
    if (longPhases.length) confirmedSynchronousBlockers.push({ eventLoopWindow: loop, phases: longPhases });
    else unattributedStalls.push(loop);
  }
  const strongCorrelations = Object.entries(stallCorrelations).flatMap(([name, value]) =>
    value.samples >= 10 && value.r !== null && value.r >= 0.7 ? [{ signal: name, ...value }] : []);
  const stallAttribution = {
    thresholdMs: stallThresholdMs,
    confirmedSynchronousBlockers,
    strongCorrelations,
    unattributedStalls,
    interpretation: "A sampled synchronous phase with process CPU over the threshold confirms substantial synchronous CPU in an overlapping window; correlation alone does not assign a stall to a phase.",
  };
  const paths = new Map();
  for (const row of steady) {
    for (const path of row.hotPaths ?? []) {
      let entry = paths.get(path.name);
      if (!entry) {
        entry = { name: path.name, windows: new Map() };
        paths.set(path.name, entry);
      }
      for (const window of path.windows ?? []) entry.windows.set(window.to, window);
    }
  }
  const pathResults = [...paths.values()].map((p) => {
    const samples = [...p.windows.values()];
    return {
      name: p.name,
      windows: samples.length,
      calls: samples.reduce((sum, v) => sum + v.calls, 0),
      cpuMs: rounded(samples.reduce((sum, v) => sum + v.cpuMs, 0)),
      waitMs: rounded(samples.reduce((sum, v) => sum + v.waitMs, 0)),
      p99MsMax: series(samples, (v) => v.p99Ms)?.max ?? null,
    };
  }).sort((a, b) => b.cpuMs - a.cpuMs);
  const operationalTwinForensics = {
    enabled: twinSamples.length > 0,
    windows: twinWindows.length,
    phases: Object.fromEntries(TWIN_PHASE_NAMES.map((name) => {
      const items = twinWindows.map((window) => window.phases?.[name]).filter((item) => item &&
        safe(item.sampledCalls ?? item.sampledPhaseCalls) !== null);
      return [name, {
        calls: items.reduce((sum, item) => sum + (item.calls ?? item.estimatedCalls ?? 0), 0),
        sampledCalls: items.reduce((sum, item) => sum + (item.sampledCalls ?? item.sampledPhaseCalls ?? 0), 0),
        estimatedCpuMs: rounded(items.reduce((sum, item) => sum + (item.estimatedCpuMs ?? 0), 0)),
        estimatedWallMs: rounded(items.reduce((sum, item) => sum + (item.estimatedWallMs ?? 0), 0)),
        p95Ms: series(items, (item) => item.p95Ms)?.p95 ?? null,
        p99Ms: series(items, (item) => item.p99Ms)?.p99 ?? null,
        maxMs: series(items, (item) => item.maxMs)?.max ?? null,
        cpuP95Ms: series(items, (item) => item.cpuP95Ms)?.p95 ?? null,
        cpuP99Ms: series(items, (item) => item.cpuP99Ms)?.p99 ?? null,
        cpuMaxMs: series(items, (item) => item.cpuMaxMs)?.max ?? null,
      }];
    })),
    cacheHitRate: series(twinSamples, (item) => item.cacheHitRate)?.p50 ?? null,
    ratesPerMinute: Object.fromEntries(["captures", "expirations", "truthInvalidations", "actualTruthResolutions", "pendingCapacityEvictions", "atcCacheEvictions", "atcCacheExpirations", "cacheHits", "cacheMisses"]
      .map((name) => [name, series(twinSamples, (item) => item.ratesPerMinute?.[name])?.p50 ?? null])),
    pendingPopulation: {
      p50: series(twinSamples, (item) => item.pendingPopulation?.p50)?.p50 ?? null,
      p95: series(twinSamples, (item) => item.pendingPopulation?.p95)?.p95 ?? null,
      max: series(twinSamples, (item) => item.pendingPopulation?.max)?.max ?? null,
    },
    pendingPerAircraftDistribution: Object.fromEntries(["one", "two", "threeToFour", "fiveToEight", "overEight"]
      .map((name) => [name, twinSamples.reduce((sum, item) => sum + (item.pendingPerAircraftDistribution?.[name] ?? 0), 0)])),
  };
  // Keep the five independently measured Twin validators even if they are
  // not top-12 by inclusive CPU; do not double-count nested parent scopes.
  const selected = pathResults.slice(0, 12);
  for (const item of pathResults) {
    if (item.name.startsWith("twin.") && !selected.some((x) => x.name === item.name)) {
      selected.push(item);
    }
  }
  const overLimit = telemetryMode === "public" ? null : steady.some((r) => (r.localTrailOverLimitAircraft ?? 0) > 0 ||
    (r.networkTrailOverLimitAircraft ?? 0) > 0);
  const measuredEnough = stable && missing === 0 && sampleGaps.length === 0 &&
    span >= header.seconds - header.intervalSeconds * 2 &&
    rows.length >= Math.ceil(expected * 0.95) && steady.length >= 30 &&
    (telemetryMode === "public" || gcBaselines.length >= 2) &&
    loopWindows.length >= 10 && (telemetryMode !== "public" || steady.every((r) =>
      safe(r.rssBytes) !== null && safe(r.cpuPercent) !== null));
  const verdict = overLimit ? "FAIL" :
    measuredEnough ? "PASS_WITH_LIMITATIONS" : "INSUFFICIENT_EVIDENCE";
  const firstTen = steady.slice(0, Math.max(1, Math.floor(steady.length / 10)));
  const lastTen = steady.slice(-Math.max(1, Math.floor(steady.length / 10)));
  const comparison = (project) => {
    const a = median(firstTen.map(project)), b = median(lastTen.map(project));
    return a === null || b === null ? null : rounded(b - a);
  };
  const routeSamples = steady.map((r) => r.routeCache).filter(Boolean);
  const firstRoute = routeSamples[0], lastRoute = routeSamples.at(-1);
  const routePhase = Object.fromEntries(ROUTE_PHASE_NAMES.map((name) => [name, {
    measured: routeSamples.some((r) => r.phases?.[name]?.measured === true),
    p50Ms: series(routeSamples, (r) => r.phases?.[name]?.p50Ms),
    p95Ms: series(routeSamples, (r) => r.phases?.[name]?.p95Ms),
    p99Ms: series(routeSamples, (r) => r.phases?.[name]?.p99Ms),
    maxMs: series(routeSamples, (r) => r.phases?.[name]?.maxMs),
  }]));
  const routeOpenSamples = routeSamples.filter((r) => r.sql?.circuit?.state === "open").length;
  const routeMaxActive = series(routeSamples, (r) => r.sql?.maxActive)?.max ?? null;
  const routeMaxActiveWrites = series(routeSamples, (r) => r.sql?.activeWrites)?.max ?? null;
  const routeMaxActiveNow = series(routeSamples, (r) => r.sql?.active)?.max ?? null;
  const routeMaxRejected = series(routeSamples, (r) => r.sql?.rejected)?.max ?? null;
  const routeMaxProbe = series(routeSamples, (r) => r.sql?.halfOpenProbe === true ? 1 : 0)?.max ?? null;
  return {
    verdict, telemetryMode, stableProcessAndCommit: stable,
    segments: segmentIds.size,
    segmentSummaries,
    segmentChanges,
    sampleGaps,
    samples: allRows.length, missing, failureCategories,
    pollingFailureContext: {
      delayedPollingMisses: delayedPollingMisses.length,
      eventLoopSchedulingDelayCorrelatedMisses: eventLoopSchedulingDelayCorrelatedMisses.length,
      interpretation: "Correlation with a completed service event-loop window is not proof that scheduling delay caused a failed sample.",
    },
    expected, durationSeconds: rounded(span),
    commit: first?.commit ?? null, version: first?.version ?? null,
    steadyStateSamples: steady.length,
    majorGcBaselines: gcBaselines.length,
    memoryMiB: {
      rss: series(steady, (r) => megabytes(r.rssBytes)),
      heapUsed: series(steady, (r) => megabytes(r.heapUsedBytes)),
      oldSpace: series(steady, (r) => megabytes(r.oldSpaceBytes)),
    },
    postMajorGcTrendMiB: {
      heapUsed: gcTrend("heapUsedBytes"),
      rss: gcTrend("rssBytes"),
      oldSpace: gcTrend("oldSpaceUsedBytes"),
    },
    cpuPercent: series(steady, (r) => r.cpuPercent),
    cgroupCpuThrottleTelemetry: (() => {
      const statuses = ["available", "controller_disabled", "unavailable"];
      const counts = Object.fromEntries(statuses.map((status) => [status,
        steady.filter((row) => row.cgroupCpuThrottleStatus === status).length]));
      return {
        statuses: counts,
        coverageComplete: steady.length > 0 && counts.available === steady.length,
      };
    })(),
    pollDelayMs: series(rows, (r) => safe(r.pollDelayMs)),
    delayedPollingSamples: rows.filter((r) => r.pollDelayCategory === "delayed_polling").length,
    eventLoopWindowP99Ms: series(loopWindows, (r) => r.p99Ms),
    eventLoopWindowMaxMs: series(loopWindows, (r) => r.maxMs),
    eventLoopWindows: loopWindows.length,
    stallCorrelations,
    stallAttribution,
    load: {
      aircraft: series(steady, (r) => r.aircraftCount),
      sseClients: series(steady, (r) => r.activeSseClients),
      localTrailPoints: series(steady, (r) => r.retention?.trails?.local?.points),
      networkTrailPoints: series(steady, (r) => r.retention?.trails?.network?.points),
    },
    changesFirstLastDecile: {
      localAircraft: comparison((r) => r.retention?.aircraft?.local?.count),
      networkAircraft: comparison((r) => r.retention?.aircraft?.network?.count),
      localStaleRetained: comparison((r) => r.retention?.aircraft?.local?.staleRetained),
      networkStaleRetained: comparison((r) => r.retention?.aircraft?.network?.staleRetained),
      sourcePreferences: comparison((r) => r.retention?.auxiliaryMaps?.sourcePreferences),
      lastHistorySample: comparison((r) => r.retention?.auxiliaryMaps?.lastHistorySample),
      networkTrailPoints: comparison((r) => r.retention?.trails?.network?.points),
    },
    overLimit,
    routeCache: routeSamples.length === 0 ? {
      measured: false,
      reason: "NOT_MEASURED",
    } : {
      measured: true,
      phaseLatencyMs: routePhase,
      countersDelta: Object.fromEntries(ROUTE_METRIC_NAMES.map((name) => [name, routeCounterDelta(firstRoute, lastRoute, name)])),
      databaseHitRateLast: lastRoute?.databaseHitRate ?? null,
      databaseAverageLatencyMsLast: lastRoute?.databaseAverageLatencyMs ?? null,
      circuitOpenSamples: routeOpenSamples,
      circuitOpenSampleRatio: steady.length ? routeOpenSamples / steady.length : null,
      maxActiveDbOperations: routeMaxActive,
      maxActiveDbWrites: routeMaxActiveWrites,
      maxObservedActiveDbOperations: routeMaxActiveNow,
      maxRejectedConcurrencyCounter: routeMaxRejected,
      maxRecoveryProbeInFlight: routeMaxProbe,
      callerTimeoutsDelta: routeCounterDelta(firstRoute, lastRoute, "dbError") === null ? null :
        (lastRoute?.sql?.callerTimeouts ?? 0) - (firstRoute?.sql?.callerTimeouts ?? 0),
      completedAfterCallerTimeoutDelta: routeSamples.length && firstRoute?.sql && lastRoute?.sql ?
        (lastRoute.sql.completedAfterCallerTimeout ?? 0) - (firstRoute.sql.completedAfterCallerTimeout ?? 0) : null,
      eventLoopAtTimeout: {
        p50Percent: series(routeSamples, (r) => r.sql?.eventLoopAtTimeout?.p50Percent),
        p95Percent: series(routeSamples, (r) => r.sql?.eventLoopAtTimeout?.p95Percent),
        p99Percent: series(routeSamples, (r) => r.sql?.eventLoopAtTimeout?.p99Percent),
        sampleCountMax: series(routeSamples, (r) => r.sql?.eventLoopAtTimeout?.sampleCount)?.max ?? null,
        scope: "process-local-recent-samples",
      },
      sqlLatencyMeasurement: "db_call_elapsed; server-side SQL latency NOT MEASURED",
    },
    hotPathsByWindowCpuMs: selected,
    operationalTwinForensics,
    caveats: [
      telemetryMode === "public"
        ? "PUBLIC ONLY: retention, major-GC/old-space, SQL, hot-path/Twin attribution and exact process identity were NOT MEASURED."
        : "Continuous clean windows and two major GC observations are required for evidence.",
      "A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.",
      "Process CPU attribution for overlapping async paths is not a per-operation profiler.",
      "Old-space growth and bounded-container counts alone do not prove a leak.",
      "Traffic mix, cold caches and 0 SSE clients can limit inference.",
      "No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.",
    ],
  };
}
