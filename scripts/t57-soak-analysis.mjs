// T5.7C: allowlisted, read-only projections and offline 24-hour analysis.
// No raw API response, aircraft identity, position, token, cookie, PID or
// diagnostics store ID may be written to an output report.
import { stats } from "./t55-runtime-analysis.mjs";

const MiB = 1024 * 1024;
const AUXILIARY_NAMES = [
  "sourcePreferences", "sourcePreferenceMissingSince", "lastHistorySample",
  "predictiveEvaluatedAt", "atcResolutionKeys", "atcShadowPredictionKeys",
];
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

function windows(items, type) {
  if (!Array.isArray(items)) return [];
  return items.slice(-15).flatMap((x) => {
    const from = stamp(x?.from), to = stamp(x?.to);
    if (!from || !to || Date.parse(to) <= Date.parse(from)) return [];
    if (type === "loop") {
      const p95Ms = safe(x.p95Ms), p99Ms = safe(x.p99Ms), maxMs = safe(x.maxMs);
      return p95Ms === null || p99Ms === null || maxMs === null ? [] : [{
        from, to, p95Ms, p99Ms, maxMs,
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
  const retention = system?.diagnostics?.retentionAttribution;
  const process = system?.autocommitOperationAttribution;
  if (status?.detailLevel !== "admin" || metrics?.schemaVersion !== 2 ||
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
  const metricPaths = Array.isArray(metrics.hotPaths) ? metrics.hotPaths : [];
  const hotPaths = metricPaths.slice(0, 12).flatMap((p) => {
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
      rssBytes: safe(runtime.rssBytes),
      heapUsedBytes: safe(runtime.heapUsedBytes),
      heapTotalBytes: safe(runtime.heapTotalBytes),
      externalBytes: safe(runtime.externalBytes),
      oldSpaceBytes: safe(oldSpace?.usedBytes),
      cpuPercent: safe(runtime.cpuIntervalPercent),
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
      hotPaths,
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

export function analyzeT57Soak(records) {
  if (!Array.isArray(records) || !records.length || records[0]?.type !== "header") {
    throw new Error("invalid_t57_report");
  }
  const header = records[0];
  if (header.schemaVersion !== 1 || !Number.isSafeInteger(header.seconds) ||
      !Number.isSafeInteger(header.intervalSeconds) || !Number.isSafeInteger(header.warmupSeconds)) {
    throw new Error("invalid_t57_header");
  }
  const rows = records.filter((r) => r.type === "sample").map((r) => r.value);
  const missing = records.filter((r) => r.type === "unavailable").length;
  const first = rows[0], last = rows.at(-1);
  const segmentIds = new Set(rows.map((r) => r.segment));
  const steady = first ? rows.filter((r) => Date.parse(r.at) >=
    Date.parse(first.at) + header.warmupSeconds * 1000) : [];
  const span = first && last ? (Date.parse(last.at) - Date.parse(first.at)) / 1000 : 0;
  const expected = Math.ceil(header.seconds / header.intervalSeconds) + 1;
  const stable = segmentIds.size === 1 && rows.length > 1 &&
    rows.every((r) => r.commit === first.commit);
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
  }).sort((a, b) => b.cpuMs - a.cpuMs).slice(0, 12);
  const overLimit = steady.some((r) => (r.localTrailOverLimitAircraft ?? 0) > 0 ||
    (r.networkTrailOverLimitAircraft ?? 0) > 0);
  const measuredEnough = stable && span >= header.seconds - header.intervalSeconds * 2 &&
    rows.length >= Math.ceil(expected * 0.95) && steady.length >= 30 &&
    gcBaselines.length >= 2 && loopWindows.length >= 10;
  const verdict = overLimit ? "FAIL" :
    measuredEnough ? "PASS_WITH_LIMITATIONS" : "INSUFFICIENT_EVIDENCE";
  const firstTen = steady.slice(0, Math.max(1, Math.floor(steady.length / 10)));
  const lastTen = steady.slice(-Math.max(1, Math.floor(steady.length / 10)));
  const comparison = (project) => {
    const a = median(firstTen.map(project)), b = median(lastTen.map(project));
    return a === null || b === null ? null : rounded(b - a);
  };
  return {
    verdict, stableProcessAndCommit: stable,
    segments: segmentIds.size,
    samples: rows.length, missing,
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
    eventLoopWindowP99Ms: series(loopWindows, (r) => r.p99Ms),
    eventLoopWindowMaxMs: series(loopWindows, (r) => r.maxMs),
    eventLoopWindows: loopWindows.length,
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
    hotPathsByWindowCpuMs: pathResults,
    caveats: [
      "Continuous clean windows and two major GC observations are required for evidence.",
      "A restart, changed commit, or insufficient coverage yields INSUFFICIENT_EVIDENCE.",
      "Process CPU attribution for overlapping async paths is not a per-operation profiler.",
      "Old-space growth and bounded-container counts alone do not prove a leak.",
      "Traffic mix, cold caches and 0 SSE clients can limit inference.",
      "No sensitive telemetry, heap object graphs, flight coordinates or raw API responses are stored.",
    ],
  };
}
