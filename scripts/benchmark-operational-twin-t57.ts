/**
 * Deterministic, identity-free, validator-only Operational Twin T57 workload.
 * Defaults to a bounded representative smoke profile (78 aircraft, 20 pending).
 * Opt in to the expensive matrix with RADAR_TWIN_T57_PROFILE=matrix.
 * This is not a replay of raw receiver frames or the full AircraftStateService.
 * The internal 'full-scan' arm is an algorithmic reference ON THE SAME COMMIT;
 * it must NOT be reported as a historical production binary before/after.
 */
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { prepareAtcContextDataset } from "@/lib/atc-context/engine";
import { OperationalTwinEventOutcomeValidator, type OperationalTwinSituation } from "@/lib/operational-twin";
import type { Aircraft } from "@/lib/aircraft/types";

const EPOCH = Date.parse("2026-10-15T09:00:00.000Z");
const OBSERVE_START = EPOCH + 5 * 60_000;
const TRAIL_POINTS = 120;
const CONTEXT = { sigmets: null, destination: null };
const dataset = prepareAtcContextDataset({
  sectors: ["S0", "S1"].map((id, index) => ({
    id, name: id, atcCallsign: id, airspaceType: "CTA_SECTOR", airspaceClass: "C",
    polygons: [[[17.3 + index * 0.25, 48.8], [17.45 + index * 0.25, 48.8],
      [17.45 + index * 0.25, 49.2], [17.3 + index * 0.25, 49.2],
      [17.3 + index * 0.25, 48.8]]],
    lowerAltitudeFt: 0, upperAltitudeFt: 40000, frequencies: [],
    validFrom: null, validTo: null, country: "CZ", source: "benchmark",
    sourceReference: "non-production", lastVerifiedAt: new Date(EPOCH).toISOString(),
  })),
  routeDocuments: [],
});

export interface T57Scenario {
  aircraft: number;
  pending: number;
  intervalSeconds: 1 | 3 | 10;
  durationSeconds: number;
  repeat: number;
}
type Mode = "full-scan" | "incremental";
function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
}
function round(value: number): number { return Number(value.toFixed(3)); }
function hex(index: number): string { return (0xabc000 + index).toString(16).toUpperCase(); }
function truthPoint(at: number, index: number) {
  return { recordedAt: new Date(at).toISOString(), lat: 49 + index / 100_000,
    lon: 18.5 + index / 100_000, altitude: 30000, track: 90, groundSpeed: 420 };
}
function makeAircraft(index: number): Aircraft {
  const icaoHex = hex(index);
  const trail = Array.from({ length: TRAIL_POINTS }, (_, i) =>
    truthPoint(OBSERVE_START - (TRAIL_POINTS - i - 1) * 1_000, index));
  return {
    icaoHex, callsign: null, registration: null, aircraftType: null, aircraftDescription: null,
    lat: trail.at(-1)!.lat, lon: trail.at(-1)!.lon,
    altitude: 30000, baroAltitude: 30000, geomAltitude: null,
    groundSpeed: 420, track: 90, verticalRate: 0, baroRate: 0, geomRate: null,
    squawk: null, category: null, emergency: null, rssi: null, messages: 1,
    seenSeconds: 0, seenPosSeconds: 0,
    lastSeen: trail.at(-1)!.recordedAt, source: "ADS-B", origin: "local",
    sourceType: null, onGround: false, distanceKm: null, bearing: null, trail,
  } as Aircraft;
}
function makeSituation(icaoHex: string, eventIndex: number, capturedAt: number): OperationalTwinSituation {
  const isAtc = eventIndex % 5 === 0;
  const sectorId = eventIndex % 10 === 0 ? "S0" : "S1";
  const at = Math.max(OBSERVE_START, capturedAt) + 2 * 60_000 + (eventIndex % 120) * 1_000;
  const event = {
    type: isAtc ? "ATC_SECTOR_ENTRY" : "WAYPOINT",
    id: isAtc ? `sector:${sectorId}:${icaoHex}:${eventIndex}` : `waypoint:W${eventIndex}`,
    at: new Date(at).toISOString(), title: isAtc ? sectorId : `WAYPOINT-${eventIndex}`,
    lat: 49, lon: 17.5, altitudeFt: 30000, confidence: "HIGH", provenance: "PREDICTED",
  };
  return {
    generatedAt: new Date(capturedAt).toISOString(),
    aircraft: { icaoHex }, events: [event],
  } as unknown as OperationalTwinSituation;
}
function semantic(report: ReturnType<OperationalTwinEventOutcomeValidator["report"]>) {
  const { performance: _performance, ...semanticReport } = report;
  void _performance;
  return semanticReport;
}
export interface T57BenchmarkResult {
  mode: Mode;
  scenario: T57Scenario;
  observedSnapshots: number;
  initializedPending: number;
  finalPending: number;
  latency: { p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number };
  cpuMs: number;
  memory: { heapDeltaMiB: number; rssDeltaMiB: number; postGcRssMiB: number | null };
  loopMaxMs: number;
  atc: { hits: number; misses: number; hitRate: number };
  performance: ReturnType<OperationalTwinEventOutcomeValidator["report"]>["performance"];
  semantic: ReturnType<typeof semantic>;
}
export async function runT57Scenario(scenario: T57Scenario, mode: Mode): Promise<T57BenchmarkResult> {
  if (!Number.isInteger(scenario.aircraft) || scenario.aircraft < 1 || scenario.aircraft > 500 ||
      !Number.isInteger(scenario.pending) || scenario.pending < 1 || scenario.pending > 6000 ||
      ![1, 3, 10].includes(scenario.intervalSeconds) ||
      !Number.isInteger(scenario.durationSeconds) || scenario.durationSeconds < 1 ||
      scenario.durationSeconds > 3600) throw Error("invalid_bounded_scenario");
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  gc?.();
  const memoryBefore = process.memoryUsage();
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const validator = new OperationalTwinEventOutcomeValidator({
    enableIncrementalTruthEvaluation: mode === "incremental",
    enableExpiryQueue: mode === "incremental",
    enableAtcTruthCache: true,
  });
  const aircraft = Array.from({ length: scenario.aircraft }, (_, i) => makeAircraft(i));
  const observed = new Map(aircraft.map((plane) => [plane.icaoHex, plane] as const));
  // Use two ATC semantic identities per aircraft at most, so a collision
  // cannot silently change the requested pending population.
  const pendingAircraftCount = scenario.pending <= 24
    ? Math.min(9, scenario.aircraft) : scenario.aircraft;
  const capturePopulation = (at: number): void => {
  for (let index = 0; index < scenario.pending; index += 1) {
    const aircraftIndex = index % pendingAircraftCount;
    const perAircraftIndex = Math.floor(index / pendingAircraftCount);
    const eventIndex = perAircraftIndex < 2
      ? perAircraftIndex * 5 + (aircraftIndex % 2) * 5
      : index * 10 + 1;
    validator.capture(makeSituation(hex(aircraftIndex), eventIndex, at),
      { ...CONTEXT, atcDataset: dataset }, at);
  }
  };
  capturePopulation(EPOCH);
  const initializedPending = validator.report(new Date(EPOCH)).pending;
  if (initializedPending !== scenario.pending) {
    histogram.disable();
    throw Error(`capture_population_mismatch:${initializedPending}/${scenario.pending}`);
  }
  const durations: number[] = [];
  const cpuStart = process.cpuUsage();
  const cycles = Math.ceil(scenario.durationSeconds / scenario.intervalSeconds);
  try {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const now = OBSERVE_START + cycle * scenario.intervalSeconds * 1000;
      // The original capture ages out after its bounded spatial window.
      // Replenish every 10 simulated minutes to preserve bounded sustained
      // pending pressure in the opt-in one-hour matrix. This is synthetic
      // stress traffic, not the 1.333/min production capture rate.
      if (cycle > 0 && (cycle * scenario.intervalSeconds) % 600 === 0) {
        capturePopulation(now);
      }
      for (let i = 0; i < aircraft.length; i += 1) {
        const old = aircraft[i]!;
        // Two-thirds keep the exact trail identity; one-third add a fix.
        if ((i + cycle) % 3 !== 0) {
          const updated = { ...old, seenSeconds: cycle, lastSeen: new Date(now).toISOString() };
          aircraft[i] = updated;
          observed.set(updated.icaoHex, updated);
          continue;
        }
        const current = truthPoint(now, i);
        let trail = [...old.trail.slice(-TRAIL_POINTS + 1), current];
        // Deterministic correction of a historical point every 17 cycles.
        if (cycle > 0 && cycle % 17 === 0 && i % 7 === 0) {
          trail = trail.map((p, index) => index === 12
            ? { ...p, altitude: (p.altitude ?? 0) + 50 } : p);
        }
        const updated = { ...old, trail, lat: current.lat, lon: current.lon,
          lastSeen: current.recordedAt, seenSeconds: 0, seenPosSeconds: 0 };
        aircraft[i] = updated;
        observed.set(updated.icaoHex, updated);
      }
      const started = performance.now();
      validator.observeLocal(observed, now);
      durations.push(performance.now() - started);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    histogram.disable();
  }
  const usage = process.cpuUsage(cpuStart);
  const beforeGc = process.memoryUsage();
  gc?.();
  const afterGc = gc ? process.memoryUsage() : null;
  const cache = validator.getAtcCacheStats();
  const report = validator.report(new Date(OBSERVE_START + (cycles - 1) * scenario.intervalSeconds * 1000));
  return {
    mode, scenario, observedSnapshots: cycles, initializedPending, finalPending: report.pending,
    latency: { p50Ms: round(quantile(durations, 0.5)),
      p95Ms: round(quantile(durations, 0.95)), p99Ms: round(quantile(durations, 0.99)),
      maxMs: round(Math.max(...durations)) },
    cpuMs: round((usage.user + usage.system) / 1000),
    memory: { heapDeltaMiB: round((beforeGc.heapUsed - memoryBefore.heapUsed) / 1048576),
      rssDeltaMiB: round((beforeGc.rss - memoryBefore.rss) / 1048576),
      postGcRssMiB: afterGc ? round(afterGc.rss / 1048576) : null },
    loopMaxMs: Number.isFinite(histogram.max) ? round(histogram.max / 1e6) : 0,
    atc: { hits: cache.hits, misses: cache.misses,
      hitRate: round(cache.hits / Math.max(1, cache.hits + cache.misses)) },
    performance: report.performance, semantic: semantic(report),
  };
}
function listEnv(name: string, defaults: number[]): number[] {
  const value = process.env[name];
  if (!value) return defaults;
  const list = value.split(",").map(Number);
  if (!list.length || list.some((n) => !Number.isInteger(n))) throw Error(`invalid_env:${name}`);
  return list;
}
function numberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const val = raw === undefined ? defaultValue : Number(raw);
  if (!Number.isInteger(val)) throw Error(`invalid_env:${name}`);
  return val;
}
export async function runT57Benchmark() {
  const profile = process.env.RADAR_TWIN_T57_PROFILE ?? "representative";
  if (!["representative", "matrix"].includes(profile)) throw Error("invalid_profile");
  const counts = listEnv("RADAR_TWIN_T57_COUNTS", profile === "matrix" ? [50, 70, 100, 250] : [78]);
  const pendingCounts = listEnv("RADAR_TWIN_T57_PENDING", profile === "matrix" ? [1000, 3000, 6000] : [20]);
  const intervals = listEnv("RADAR_TWIN_T57_INTERVALS", profile === "matrix" ? [1, 3, 10] : [3]);
  const durationSeconds = numberEnv("RADAR_TWIN_T57_DURATION_SECONDS", profile === "matrix" ? 3600 : 60);
  const repetitions = numberEnv("RADAR_TWIN_T57_REPEATS", profile === "matrix" ? 3 : 2);
  if (repetitions < 1 || repetitions > 5) throw Error("invalid_repetition_count");
  const runs = [];
  for (const count of counts) for (const pending of pendingCounts) for (const interval of intervals) {
    if (![1,3,10].includes(interval)) throw Error("invalid_interval");
    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      const scenario: T57Scenario = { aircraft: count, pending, intervalSeconds: interval as 1|3|10,
        durationSeconds, repeat };
      // Alternate execution order to reduce GC/JIT ordering effects.
      const modes: Mode[] = repeat % 2 ? ["incremental", "full-scan"] : ["full-scan", "incremental"];
      const pair = [];
      for (const mode of modes) pair.push(await runT57Scenario(scenario, mode));
      if (JSON.stringify(pair[0]!.semantic) !== JSON.stringify(pair[1]!.semantic))
        throw Error(`semantic_mismatch:${JSON.stringify(scenario)}`);
      const full = pair.find((item) => item.mode === "full-scan")!;
      const fast = pair.find((item) => item.mode === "incremental")!;
      runs.push({ scenario, fullScan: { ...full, semantic: undefined },
        incremental: { ...fast, semantic: undefined }, semanticMatch: true });
      process.stderr.write(`T57 benchmark: ${count} aircraft / ${pending} pending / ${interval}s / repetition ${repeat + 1}: semantic PASS\\n`);
    }
  }
  return {
    version: "operational-twin-t57-validator-only-v1",
    comparison: "full-scan vs incremental ON SAME COMMIT, not historical production binary",
    representativeT57: { aircraftP50: 78, pendingP50: 15, pendingMax: 24,
      originalProductionVersion: "1.0.454", originalProductionCommit: "ca25f52b" },
    limitations: ["synthetic positions, no raw readsb replay", "validator-only, not AircraftStateService",
      "non-production geometry is intentionally small", "GC and scheduler noise remain",
      "simulated event times, not a 60-minute continuous production soak"],
    runs,
  };
}
if (process.argv[1]?.endsWith("benchmark-operational-twin-t57.ts")) {
  runT57Benchmark().then((result) => process.stdout.write(JSON.stringify(result, null, 2) + "\\n"))
    .catch((error) => { process.stderr.write(String(error) + "\\n"); process.exitCode = 1; });
}
