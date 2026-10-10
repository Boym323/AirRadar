// T5.6: strictly bounded, identifier-free read-only memory projections.
// Post-major-GC snapshots are approximate: the observer callback may execute
// after further JavaScript allocations. They do not establish a leak.
import { stats } from "./t55-runtime-analysis.mjs";

const finite = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const MiB = 1024 * 1024;
const KNOWN_SPACE_NAME = /^[a-z_]{1,48}$/;
const round = (v) => v === null ? null : Number(v.toFixed(3));

function projectionSpaces(spaces) {
  if (!Array.isArray(spaces)) return [];
  return spaces.slice(0, 16).flatMap((space) => {
    if (typeof space?.name !== "string" || !KNOWN_SPACE_NAME.test(space.name)) return [];
    return [{
      name: space.name,
      usedBytes: finite(space.usedBytes),
      sizeBytes: finite(space.sizeBytes),
      physicalBytes: finite(space.physicalBytes),
    }];
  });
}

export function projectT56Sample(status, metrics, at = new Date().toISOString()) {
  if (metrics?.schemaVersion !== 2 || metrics?.scope !== "process-local" ||
      metrics?.runtime?.status !== "enabled" || !Array.isArray(metrics.runtime.v8HeapSpaces)) {
    throw new Error("t56_memory_diagnostics_unavailable");
  }
  if (status?.detailLevel !== "admin") throw new Error("t56_admin_projection_required");
  const runtime = metrics.runtime;
  const system = status.runtime ?? {};
  const diagnostics = system.autocommitOperationAttribution ?? {};
  const major = runtime.postMajorGc ?? null;
  return {
    at,
    commit: typeof status.application?.commit === "string" ? status.application.commit : null,
    version: typeof status.application?.version === "string" ? status.application.version : null,
    pid: finite(diagnostics.processId),
    storeId: typeof diagnostics.diagnosticsStoreId === "string" ? diagnostics.diagnosticsStoreId : null,
    rssBytes: finite(runtime.rssBytes),
    heapUsedBytes: finite(runtime.heapUsedBytes),
    heapTotalBytes: finite(runtime.heapTotalBytes),
    externalBytes: finite(runtime.externalBytes),
    arrayBuffersBytes: finite(runtime.arrayBuffersBytes),
    majorGcCount: finite(runtime.majorGcCount),
    postMajorGc: major && finite(major.observedAtMs) !== null ? {
      observedAtMs: finite(major.observedAtMs),
      heapUsedBytes: finite(major.heapUsedBytes),
      rssBytes: finite(major.rssBytes),
      oldSpaceUsedBytes: finite(major.oldSpaceUsedBytes),
    } : null,
    spaces: projectionSpaces(runtime.v8HeapSpaces),
    localTrailPoints: finite(system.localTrailPointCount),
    networkTrailPoints: finite(system.networkTrailPointCount),
    localTrailAircraft: finite(system.localTrailAircraftCount),
    networkTrailAircraft: finite(system.networkTrailAircraftCount),
    localTrailMaxPerAircraft: finite(system.localTrailMaxPointsPerAircraft),
    networkTrailMaxPerAircraft: finite(system.networkTrailMaxPointsPerAircraft),
    localTrailAtLimitAircraft: finite(system.localTrailAtLimitAircraftCount),
    networkTrailAtLimitAircraft: finite(system.networkTrailAtLimitAircraftCount),
    localTrailOverLimitAircraft: finite(system.localTrailOverLimitAircraftCount),
    networkTrailOverLimitAircraft: finite(system.networkTrailOverLimitAircraftCount),
    aircraftCount: finite(system.aircraftCount),
    sseClients: finite(system.activeSseClients),
  };
}

export function analyzeT56Samples(rows, unavailable = [], warmupSeconds = 600) {
  const samples = rows.filter((r) => r && typeof r.at === "string" && Number.isFinite(Date.parse(r.at)));
  const first = samples[0], last = samples.at(-1);
  const stable = Boolean(first?.commit && first?.storeId && first?.pid !== null &&
    samples.length > 1 && samples.every((s) => s.commit === first.commit &&
      s.storeId === first.storeId && s.pid === first.pid));
  const startMs = first ? Date.parse(first.at) : NaN;
  const durationSeconds = first && last ? (Date.parse(last.at) - startMs) / 1000 : null;
  const steady = samples.filter((s) => Date.parse(s.at) >= startMs + warmupSeconds * 1000);
  const memory = (key) => stats(steady.map((s) => s[key] === null ? null : s[key] / MiB));
  const space = (name) => stats(steady.map((s) => {
    const used = s.spaces?.find((p) => p.name === name)?.usedBytes;
    return typeof used === "number" ? used / MiB : null;
  }));
  const baselines = [];
  const seen = new Set();
  for (const sample of steady) {
    const g = sample.postMajorGc;
    if (!g || g.observedAtMs < startMs + warmupSeconds * 1000 ||
        g.observedAtMs > Date.parse(sample.at) + 5000 || seen.has(g.observedAtMs)) continue;
    seen.add(g.observedAtMs);
    baselines.push(g);
  }
  const trend = (key) => {
    if (baselines.length < 2) return null;
    const a = baselines[0][key], b = baselines.at(-1)[key];
    return a === null || b === null ? null : round((b - a) / MiB);
  };
  return {
    verdict: stable && durationSeconds >= 1800 && unavailable.length === 0 &&
      steady.length >= 15 && baselines.length >= 2 ? "PASS_WITH_LIMITATIONS" : "INSUFFICIENT_EVIDENCE",
    samples: samples.length,
    unavailableSamples: unavailable.length,
    stableProcessAndCommit: stable,
    elapsedSeconds: Number.isFinite(durationSeconds) ? round(durationSeconds) : null,
    warmupSeconds,
    steadyStateSamples: steady.length,
    majorGcBaselines: baselines.length,
    commit: first?.commit ?? null,
    version: first?.version ?? null,
    memoryMiB: {
      rss: memory("rssBytes"),
      heapUsed: memory("heapUsedBytes"),
      heapTotal: memory("heapTotalBytes"),
      external: memory("externalBytes"),
      arrayBuffers: memory("arrayBuffersBytes"),
    },
    v8SpacesUsedMiB: {
      oldSpace: space("old_space"),
      newSpace: space("new_space"),
      largeObjectSpace: space("large_object_space"),
      codeSpace: space("code_space"),
    },
    postMajorGcTrendMiB: {
      heapUsed: trend("heapUsedBytes"),
      rss: trend("rssBytes"),
      oldSpaceUsed: trend("oldSpaceUsedBytes"),
    },
    trails: {
      localPoints: stats(steady.map(s => s.localTrailPoints)),
      networkPoints: stats(steady.map(s => s.networkTrailPoints)),
      localAircraft: stats(steady.map(s => s.localTrailAircraft)),
      networkAircraft: stats(steady.map(s => s.networkTrailAircraft)),
      localMaxPerAircraft: stats(steady.map(s => s.localTrailMaxPerAircraft)),
      networkMaxPerAircraft: stats(steady.map(s => s.networkTrailMaxPerAircraft)),
      localAtLimitAircraft: stats(steady.map(s => s.localTrailAtLimitAircraft)),
      networkAtLimitAircraft: stats(steady.map(s => s.networkTrailAtLimitAircraft)),
      localOverLimitAircraft: stats(steady.map(s => s.localTrailOverLimitAircraft)),
      networkOverLimitAircraft: stats(steady.map(s => s.networkTrailOverLimitAircraft)),
      boundsDiagnosticsComplete: steady.length > 0 && steady.every((s) =>
        s.localTrailMaxPerAircraft !== null && s.networkTrailMaxPerAircraft !== null &&
        s.localTrailOverLimitAircraft !== null && s.networkTrailOverLimitAircraft !== null),
    },
    caveats: [
      "The first warmupSeconds of the measurement are excluded from steady-state statistics.",
      "Major-GC readings are approximate observer-time samples, not immediate post-GC object-retainer graphs.",
      "Growing post-major-GC memory is a signal to investigate, not proof of a leak.",
      "Per-source maxima and over-limit aircraft counts are private aggregate invariants; they cannot attribute V8 heap objects.",
      "Trail totals are aggregates and cannot prove per-aircraft retention correctness.",
      "Do not compare CPU or heap with unrelated traffic windows or unstable processes.",
      "Sampling is authenticated and read-only; no forced GC, inspector, heap snapshot or database mutation.",
    ],
  };
}
