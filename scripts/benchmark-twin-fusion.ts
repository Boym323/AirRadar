/**
 * Deterministic, identity-free benchmark for two already existing TS components.
 * No provider I/O, database access, production env, or mutation of application state.
 * It is NOT a Rust-vs-TypeScript benchmark until a separately validated native
 * implementation exists. Runner speed is non-deterministic: do not gate on ms.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import type { Aircraft } from "@/lib/aircraft/types";
import { TrackFusionShadow } from "@/lib/track-fusion/shadow";
import { runT57Scenario, type T57Scenario } from "./benchmark-operational-twin-t57";

export type BenchmarkProfile = "smoke" | "extended";
export type FusionScenarioKind = "steady" | "handover";
export interface FusionScenario {
  aircraft: number;
  cycles: number;
  overlapPercent: number;
  dirtyStride: number;
  kind: FusionScenarioKind;
}
const BASE_NOW = Date.parse("2026-10-15T08:00:00.000Z");
const RECEIVER = { lat: 49.2, lon: 17.7, name: "synthetic-receiver" };
const MS_PER_TICK = 5_000;
const NAME = "operational-twin-track-fusion-performance-v1";

function round(n: number): number { return Number(n.toFixed(3)); }
function quantile(values: readonly number[], proportion: number): number {
  if (!values.length) throw Error("empty_latency_samples");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * proportion) - 1)]!;
}
function hex(index: number): string {
  return (0xab0000 + index).toString(16).toUpperCase();
}
function makeAircraft(index: number, origin: "local" | "adsblol", at: number, step: number): Aircraft {
  const local = origin === "local";
  const lat = 49.0 + index / 100_000 + step / 100_000;
  const lon = 17.5 + index / 90_000 + step / 110_000 + (local ? 0 : 0.003);
  const observedAt = new Date(at).toISOString();
  return {
    icaoHex: hex(index),
    callsign: null, registration: null, aircraftType: null, aircraftDescription: null,
    lat, lon, altitude: 14_000 + index % 10 * 100, baroAltitude: 14_000 + index % 10 * 100,
    geomAltitude: null, groundSpeed: 280 + index % 40, track: 70 + index % 100,
    verticalRate: index % 7 === 0 ? 300 : 0, baroRate: 0, geomRate: null,
    squawk: null, category: null, emergency: null,
    rssi: local ? -15 : null, messages: local ? 100 : null,
    lastSeen: observedAt, seenSeconds: 0, seenPosSeconds: 0,
    source: "ADS-B", origin, sourceType: null, onGround: false,
    distanceKm: null, bearing: null, trail: [],
    adsbTelemetry: null, targetState: null, operationalStatus: null,
  };
}
function validateScenario(spec: FusionScenario): void {
  if (!Number.isInteger(spec.aircraft) || spec.aircraft < 1 || spec.aircraft > 5_000 ||
      !Number.isInteger(spec.cycles) || spec.cycles < 3 || spec.cycles > 120 ||
      !Number.isInteger(spec.dirtyStride) || spec.dirtyStride < 1 || spec.dirtyStride > 100 ||
      !Number.isInteger(spec.overlapPercent) || spec.overlapPercent < 0 || spec.overlapPercent > 100 ||
      !["steady", "handover"].includes(spec.kind)) {
    throw Error("invalid_bounded_fusion_scenario");
  }
}
const age = () => process.memoryUsage();
const toMiB = (bytes: number) => round(bytes / 1024 / 1024);
function memorySince(before: NodeJS.MemoryUsage, after: NodeJS.MemoryUsage, postGc: NodeJS.MemoryUsage | null) {
  return {
    heapDeltaMiB: toMiB(after.heapUsed - before.heapUsed),
    rssDeltaMiB: toMiB(after.rss - before.rss),
    postGcHeapDeltaMiB: postGc ? toMiB(postGc.heapUsed - before.heapUsed) : null,
    postGcRssDeltaMiB: postGc ? toMiB(postGc.rss - before.rss) : null,
  };
}
const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;

/** Includes TrackFusionShadow.observe, but intentionally EXCLUDES fixture assembly. */
export async function runTrackFusionTrial(spec: FusionScenario) {
  validateScenario(spec);
  const shadow = new TrackFusionShadow(true);
  const local = new Map<string, Aircraft>();
  const network = new Map<string, Aircraft>();
  const overlap = Math.floor(spec.aircraft * spec.overlapPercent / 100);
  for (let index = 0; index < spec.aircraft; index += 1) {
    local.set(hex(index), makeAircraft(index, "local", BASE_NOW, 0));
    if (index < overlap) network.set(hex(index), makeAircraft(index, "adsblol", BASE_NOW, 0));
  }
  gc?.();
  const before = age();
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  const times: number[] = [];
  const cpuStart = process.cpuUsage();
  histogram.enable();
  let updates = 0;
  let evaluated = 0;
  let fullPasses = 0;
  try {
    for (let cycle = 0; cycle < spec.cycles; cycle += 1) {
      const now = BASE_NOW + cycle * MS_PER_TICK;
      const dirty = new Set<string>();
      // Prepare deterministic snapshots outside the measured observe() call.
      for (let i = 0; i < spec.aircraft; i += 1) {
        const key = hex(i);
        if (spec.kind === "handover" && i % 4 === 0) {
          if (cycle === 3) { network.delete(key); dirty.add(key); }
          if (cycle === 6 && i < overlap) {
            network.set(key, makeAircraft(i, "adsblol", now, cycle));
            dirty.add(key);
          }
          if (cycle === 9) { local.delete(key); dirty.add(key); }
          if (cycle === 12) {
            local.set(key, makeAircraft(i, "local", now, cycle));
            dirty.add(key);
          }
        }
        if (cycle === 0 || i % spec.dirtyStride === cycle % spec.dirtyStride) {
          if (local.has(key)) local.set(key, makeAircraft(i, "local", now, cycle));
          if (network.has(key)) network.set(key, makeAircraft(i, "adsblol", now, cycle));
          dirty.add(key);
        }
      }
      updates += dirty.size;
      // Mirrors the application's changed-identity aggregation; periodic full
      // passes allow stale/unchanged paths and the cleanup/expiry path to run.
      const full = cycle === 0 || cycle % 6 === 0;
      if (full) fullPasses++;
      const started = performance.now();
      const result = shadow.observe({
        local, network, receiver: RECEIVER,
        localStaleAfterMs: 15_000, networkStaleAfterMs: 30_000,
        ...(full ? {} : { keys: dirty }),
        now,
      });
      times.push(performance.now() - started);
      evaluated += result.length;
      await new Promise<void>((done) => setImmediate(done));
    }
  } finally {
    histogram.disable();
  }
  const cpu = process.cpuUsage(cpuStart);
  const after = age();
  const diagnostics = shadow.diagnostics();
  const state = Array.from({ length: spec.aircraft }, (_, i) => shadow.getTrack(hex(i)));
  // Exact deterministic semantic check without exposing any aircraft IDs.
  const semanticDigest = createHash("sha256").update(JSON.stringify({ diagnostics, state })).digest("hex");
  gc?.();
  const postGc = gc ? age() : null;
  const metrics = {
    p50Ms: round(quantile(times, 0.5)),
    p95Ms: round(quantile(times, 0.95)),
    p99Ms: round(quantile(times, 0.99)),
    maxMs: round(Math.max(...times)),
    cpuMs: round((cpu.user + cpu.system) / 1000),
    eventLoopP99Ms: round(histogram.percentile(99) / 1e6),
    eventLoopMaxMs: round(histogram.max / 1e6),
    ...memorySince(before, after, postGc),
  };
  if (Object.values(metrics).some((value) => typeof value === "number" && !Number.isFinite(value))) {
    throw Error("nonfinite_fusion_metrics");
  }
  if (diagnostics.activeTracks > 25_000 || evaluated > spec.aircraft * spec.cycles) {
    throw Error("fusion_capacity_invariant_failed");
  }
  return {
    scenario: spec, metrics, semanticDigest,
    stats: {
      changedIdentities: updates,
      fullPasses, evaluated,
      activeTracks: diagnostics.activeTracks,
      comparisons: diagnostics.positionComparisons,
      disagreements: diagnostics.positionDisagreements,
      estimatedGapFills: diagnostics.estimatedGapFills,
      rejectedTransitions: diagnostics.rejectedSourceTransitions,
      dedupedEvaluations: diagnostics.dedupedEvaluations,
    },
  };
}

function profileScenarios(profile: BenchmarkProfile) {
  if (profile === "smoke") return {
    twin: [{ aircraft: 78, pending: 20, intervalSeconds: 3, durationSeconds: 60, repeat: 0 }] satisfies T57Scenario[],
    fusion: [{ aircraft: 250, cycles: 24, overlapPercent: 60, dirtyStride: 8, kind: "steady" },
      { aircraft: 250, cycles: 24, overlapPercent: 60, dirtyStride: 8, kind: "handover" }] satisfies FusionScenario[],
    repetitions: 2,
  };
  return {
    twin: [
      { aircraft: 78, pending: 20, intervalSeconds: 1, durationSeconds: 120, repeat: 0 },
      { aircraft: 250, pending: 1_000, intervalSeconds: 3, durationSeconds: 120, repeat: 0 },
      { aircraft: 250, pending: 3_000, intervalSeconds: 10, durationSeconds: 120, repeat: 0 },
    ] satisfies T57Scenario[],
    fusion: [
      { aircraft: 1_000, cycles: 42, overlapPercent: 50, dirtyStride: 8, kind: "steady" },
      { aircraft: 1_000, cycles: 42, overlapPercent: 75, dirtyStride: 8, kind: "handover" },
      { aircraft: 3_000, cycles: 24, overlapPercent: 30, dirtyStride: 10, kind: "steady" },
    ] satisfies FusionScenario[],
    repetitions: 3,
  };
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function mdReport(report: Awaited<ReturnType<typeof runBenchmarks>>) {
  const lines = [
    "# Operational Twin / Track Fusion performance",
    "",
    `Profile: **${report.profile}** · Commit: \`${report.environment.sha}\` · Node: \`${report.environment.node}\``,
    "",
    "All inputs are synthetic and identity-free. These are not production performance claims.",
    "Latency comparisons across shared GitHub runners are informational only.",
    "",
    "## Operational Twin",
    "",
    "| Aircraft | Pending | Refresh | Mode | P95 (ms) | P99 (ms) | CPU (ms) |",
    "|---:|---:|---:|---|---:|---:|---:|",
  ];
  for (const row of report.twin) {
    for (const run of row.runs) {
      lines.push(`| ${row.scenario.aircraft} | ${row.scenario.pending} | ${row.scenario.intervalSeconds}s | ${run.mode} | ${run.latency.p95Ms} | ${run.latency.p99Ms} | ${run.cpuMs} |`);
    }
  }
  lines.push("", "## Track Fusion", "",
    "| Aircraft | Scenario | P95 (ms) | P99 (ms) | CPU (ms) | Output parity |",
    "|---:|---|---:|---:|---:|---|");
  for (const row of report.fusion) {
    for (const run of row.runs) {
      lines.push(`| ${row.scenario.aircraft} | ${row.scenario.kind} | ${run.metrics.p95Ms} | ${run.metrics.p99Ms} | ${run.metrics.cpuMs} | ${row.semanticMatch ? "PASS" : "FAIL"} |`);
    }
  }
  lines.push("", "Operational Twin: incremental vs full scan on the SAME commit; not a historical binary baseline.",
    "Track Fusion: repeated deterministic replay, not a native-vs-TypeScript comparison.",
    "Raw JSON includes RSS, heap/GC, maximum latencies, ATC cache statistics and observed counts.",
    "");
  return lines.join("\n");
}
export async function runBenchmarks(profile: BenchmarkProfile) {
  const config = profileScenarios(profile);
  const twin = [];
  for (const initial of config.twin) {
    const runs = [];
    for (let iteration = 0; iteration < config.repetitions; iteration++) {
      const scenario = { ...initial, repeat: iteration };
      const order: Array<"incremental" | "full-scan"> = iteration % 2
        ? ["incremental", "full-scan"] : ["full-scan", "incremental"];
      const results = [];
      for (const mode of order) results.push(await runT57Scenario(scenario, mode));
      if (fingerprint(results[0]!.semantic) !== fingerprint(results[1]!.semantic)) {
        throw Error(`operational_twin_semantic_mismatch:${JSON.stringify(scenario)}`);
      }
      for (const result of results) {
        const { semantic: _semantic, ...publicResult } = result;
        void _semantic;
        runs.push({ ...publicResult, semanticMatch: true });
      }
    }
    twin.push({ scenario: initial, runs });
  }
  const fusion = [];
  for (const scenario of config.fusion) {
    const runs = [];
    let expectedDigest: string | null = null;
    for (let iteration = 0; iteration < config.repetitions; iteration++) {
      const result = await runTrackFusionTrial(scenario);
      if (expectedDigest !== null && expectedDigest !== result.semanticDigest) {
        throw Error(`track_fusion_semantic_mismatch:${JSON.stringify(scenario)}`);
      }
      expectedDigest = result.semanticDigest;
      runs.push(result);
    }
    fusion.push({ scenario, semanticMatch: true, runs });
  }
  return {
    name: NAME, profile, generatedAt: new Date().toISOString(),
    environment: {
      sha: process.env.GITHUB_SHA ?? "local", node: process.version,
      os: process.platform, arch: process.arch, runner: process.env.RUNNER_NAME ?? "local",
    },
    protocol: {
      source: "synthetic reproducible input; 5s Track Fusion ticks; independent fixed-time T57 scenarios",
      comparisons: "twin incremental vs full scan (same SHA); track fusion exact repeated-state parity",
      benchmarking: "warm-up from early trial, alternating twin evaluation order, measured CPU/wall/event-loop and memory",
      limitations: "no live receiver/network/DB/metadata, no full AircraftStateService, no end-to-end SSE",
      warning: "no absolute CPU/RSS/P99 claims without paired production-like replay",
    },
    twin, fusion,
  };
}
async function main() {
  const selected = process.env.AIRRADAR_PERF_PROFILE ?? "smoke";
  if (selected !== "smoke" && selected !== "extended") throw Error("invalid_performance_profile");
  const report = await runBenchmarks(selected);
  const out = resolve(process.env.AIRRADAR_PERF_OUTPUT_DIR ?? ".benchmarks/twin-fusion");
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(resolve(out, "summary.md"), mdReport(report), "utf8");
  console.log(mdReport(report));
  console.log(`JSON + Markdown exported to ${out}`);
}
if (process.argv[1]?.endsWith("benchmark-twin-fusion.ts")) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
