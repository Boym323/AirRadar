// T5.5: pure, read-only projections and statistics. Never hold raw provider
// payloads, auth headers, cookies, database connection strings or aircraft IDs.
export const MAX_HOT_PATHS = 12;
const MEGABYTE = 1024 * 1024;
const round = (x, decimals = 3) => x === null ? null : Number(x.toFixed(decimals));
const finite = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
const pathName = (x) => typeof x === "string" && x.length <= 80 && /^[a-zA-Z0-9_.:-]+$/.test(x) ? x : null;

export function projectT55Sample(status, metrics, now = new Date().toISOString()) {
  if (metrics?.schemaVersion !== 2 || metrics?.scope !== "process-local" ||
      metrics?.runtime?.status !== "enabled") {
    throw new Error("t55_runtime_diagnostics_unavailable");
  }
  if (status?.detailLevel !== "admin") throw new Error("t55_admin_projection_required");
  const runtime = metrics.runtime;
  const system = status.runtime ?? {};
  const db = system.autocommitOperationAttribution ?? {};
  const lane = db.lanes?.["navigation.observation.create"] ?? {};
  const hotPaths = Array.isArray(metrics.hotPaths) ? metrics.hotPaths : [];
  return {
    at: now,
    commit: typeof status.application?.commit === "string" ? status.application.commit : null,
    version: typeof status.application?.version === "string" ? status.application.version : null,
    pid: finite(db.processId),
    storeId: typeof db.diagnosticsStoreId === "string" ? db.diagnosticsStoreId : null,
    cpuPercent: finite(runtime.cpuIntervalPercent),
    cpuUserMs: finite(runtime.cpuUserTimeMs),
    cpuSystemMs: finite(runtime.cpuSystemTimeMs),
    rssBytes: finite(runtime.rssBytes),
    heapUsedBytes: finite(runtime.heapUsedBytes),
    heapTotalBytes: finite(runtime.heapTotalBytes),
    externalBytes: finite(runtime.externalBytes),
    arrayBuffersBytes: finite(runtime.arrayBuffersBytes),
    eventLoopP50Ms: finite(runtime.eventLoopLagP50Ms),
    eventLoopP95Ms: finite(runtime.eventLoopLagP95Ms),
    eventLoopP99Ms: finite(runtime.eventLoopLagP99Ms),
    gcCount: finite(runtime.gcCount),
    gcPauseMs: finite(runtime.gcTotalPauseMs),
    gcMaxMs: finite(runtime.gcMaxPauseMs),
    aircraftCount: finite(system.aircraftCount),
    sseClients: finite(system.activeSseClients),
    listenerCount: finite(system.listenerCount),
    localTrailPoints: finite(system.localTrailPointCount),
    networkTrailPoints: finite(system.networkTrailPointCount),
    navigationAttempts: finite(lane.attempts),
    navigationFailures: finite(lane.failures),
    hotPaths: hotPaths.slice(0, MAX_HOT_PATHS).flatMap((item) => {
      const name = pathName(item?.name);
      if (!name) return [];
      return [{ name, calls: finite(item.calls), totalMs: finite(item.totalMs),
        p95Ms: finite(item.p95Ms), processedAircraft: finite(item.processedAircraft) }];
    }),
  };
}

export function delta(first, last) {
  return typeof first === "number" && typeof last === "number" &&
    Number.isFinite(first) && Number.isFinite(last) && last >= first
    ? last - first : null;
}

export function stats(values) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const p = (ratio) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  return { count: sorted.length, min: round(sorted[0]), p50: round(p(0.5)),
    p95: round(p(0.95)), max: round(sorted.at(-1)),
    mean: round(sorted.reduce((a, v) => a + v, 0) / sorted.length) };
}

export function pearson(a, b) {
  if (a.length !== b.length || a.length < 10) return null;
  const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 10) return null;
  const mx = pairs.reduce((s, x) => s + x[0], 0) / pairs.length;
  const my = pairs.reduce((s, x) => s + x[1], 0) / pairs.length;
  const xx = pairs.reduce((s, x) => s + (x[0] - mx) ** 2, 0);
  const yy = pairs.reduce((s, x) => s + (x[1] - my) ** 2, 0);
  if (xx <= 0 || yy <= 0) return null;
  return round(pairs.reduce((s, x) => s + (x[0] - mx) * (x[1] - my), 0) / Math.sqrt(xx * yy));
}

export function analyzeT55Samples(rows, unavailable = []) {
  const samples = rows.filter((row) => row && typeof row.at === "string");
  const first = samples[0];
  const last = samples.at(-1);
  const stable = Boolean(first?.commit && first.storeId &&
    first.pid !== null && samples.length >= 2 &&
    samples.every((s) => s.commit === first.commit && s.storeId === first.storeId &&
      s.pid === first.pid));
  const elapsedMs = first && last ? Date.parse(last.at) - Date.parse(first.at) : 0;
  const elapsedSeconds = elapsedMs > 0 ? elapsedMs / 1000 : null;
  const series = (key) => stats(samples.map((s) => s[key]));
  const validPairs = [];
  const pathAgg = new Map();
  if (stable) {
    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1], current = samples[i];
      const seconds = (Date.parse(current.at) - Date.parse(previous.at)) / 1000;
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 180) continue;
      const prevHot = new Map(previous.hotPaths.map((item) => [item.name, item]));
      for (const item of current.hotPaths) {
        const old = prevHot.get(item.name);
        if (!old) continue;
        const wallMs = delta(old.totalMs, item.totalMs);
        const calls = delta(old.calls, item.calls);
        if (wallMs === null || calls === null) continue;
        const agg = pathAgg.get(item.name) ?? { name: item.name, wallMs: 0, calls: 0, intervals: 0 };
        agg.wallMs += wallMs;
        agg.calls += calls;
        agg.intervals += 1;
        pathAgg.set(item.name, agg);
      }
      validPairs.push({
        cpu: current.cpuPercent,
        aircraft: current.aircraftCount,
        sse: current.sseClients,
        rss: current.rssBytes,
        heap: current.heapUsedBytes,
        gcPauseRate: delta(previous.gcPauseMs, current.gcPauseMs) === null
          ? null : delta(previous.gcPauseMs, current.gcPauseMs) / (seconds * 1000),
        dbAttemptsPerSecond: delta(previous.navigationAttempts, current.navigationAttempts) === null
          ? null : delta(previous.navigationAttempts, current.navigationAttempts) / seconds,
      });
    }
  }
  const gcMs = stable ? delta(first.gcPauseMs, last.gcPauseMs) : null;
  const gcEvents = stable ? delta(first.gcCount, last.gcCount) : null;
  const cpuUserMs = stable ? delta(first.cpuUserMs, last.cpuUserMs) : null;
  const cpuSystemMs = stable ? delta(first.cpuSystemMs, last.cpuSystemMs) : null;
  const cpuCoreShare = cpuUserMs !== null && cpuSystemMs !== null && elapsedMs > 0
    ? round(100 * (cpuUserMs + cpuSystemMs) / elapsedMs) : null;
  const correlations = {
    cpuVsAircraft: pearson(validPairs.map(x=>x.cpu),validPairs.map(x=>x.aircraft)),
    cpuVsSse: pearson(validPairs.map(x=>x.cpu),validPairs.map(x=>x.sse)),
    cpuVsGcPauseRate: pearson(validPairs.map(x=>x.cpu),validPairs.map(x=>x.gcPauseRate)),
    cpuVsDbAttemptsPerSecond: pearson(validPairs.map(x=>x.cpu),validPairs.map(x=>x.dbAttemptsPerSecond)),
    rssVsAircraft: pearson(validPairs.map(x=>x.rss),validPairs.map(x=>x.aircraft)),
    heapVsGcPauseRate: pearson(validPairs.map(x=>x.heap),validPairs.map(x=>x.gcPauseRate)),
  };
  return {
    verdict: stable && samples.length >= 40 && elapsedSeconds >= 25 * 60 && unavailable.length === 0
      ? "DIAGNOSTICS_PASS_NOT_OPTIMIZATION_PROOF" : "PASS_WITH_LIMITATIONS",
    samples: samples.length,
    unavailableSamples: unavailable.length,
    stableProcessAndCommit: stable,
    elapsedSeconds: elapsedSeconds === null ? null : round(elapsedSeconds),
    commit: first?.commit ?? null,
    version: first?.version ?? null,
    cpu: {
      intervalPercent: series("cpuPercent"),
      coreEquivalentPercent: cpuCoreShare,
      userMsDelta: cpuUserMs,
      systemMsDelta: cpuSystemMs,
    },
    memory: {
      rssMiB: stats(samples.map((s) => s.rssBytes === null ? null : s.rssBytes / MEGABYTE)),
      heapUsedMiB: stats(samples.map((s) => s.heapUsedBytes === null ? null : s.heapUsedBytes / MEGABYTE)),
      externalMiB: stats(samples.map((s) => s.externalBytes === null ? null : s.externalBytes / MEGABYTE)),
      arrayBuffersMiB: stats(samples.map((s) => s.arrayBuffersBytes === null ? null : s.arrayBuffersBytes / MEGABYTE)),
    },
    eventLoop: { p95Ms: series("eventLoopP95Ms"), p99Ms: series("eventLoopP99Ms") },
    gc: {
      eventsDelta: gcEvents, pauseMsDelta: gcMs,
      wallPercent: gcMs === null || !elapsedMs ? null : round(100 * gcMs / elapsedMs),
      maxPauseMs: series("gcMaxMs"),
    },
    load: {
      aircraft: series("aircraftCount"),
      sseClients: series("sseClients"),
      dbAttemptsDelta: stable ? delta(first.navigationAttempts, last.navigationAttempts) : null,
      dbFailuresDelta: stable ? delta(first.navigationFailures, last.navigationFailures) : null,
    },
    correlations,
    hotPathsByInstrumentedWallMs: [...pathAgg.values()]
      .sort((a, b) => b.wallMs - a.wallMs).slice(0, MAX_HOT_PATHS)
      .map((x) => ({ ...x, wallMs: round(x.wallMs) })),
    caveats: [
      "Instrumented path wall time includes awaiting I/O and is not CPU attribution.",
      "Cumulative event-loop histogram percentiles cannot be interpreted as window percentiles.",
      "Correlations are observational and never prove causality or a memory leak.",
      "GC wall fraction is cumulative pause time divided by window wall time, not CPU percentage.",
      "Unavailable, negative and reset counters are excluded; no cross-process deltas are combined.",
      "Sampling uses existing authenticated, read-only diagnostic endpoints.",
    ],
  };
}
