import { performance } from "node:perf_hooks";
import { prepareAtcContextDataset } from "@/lib/atc-context/engine";
import { OperationalTwinEventOutcomeValidator, type OperationalTwinSituation } from "@/lib/operational-twin";
import type { Aircraft } from "@/lib/aircraft/types";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const AIRCRAFT_COUNT = 60;
const TRAIL_POINTS = 120;
const REFRESH_CYCLES = 10;
const trails = new Map<string, Aircraft["trail"]>();
function makeDataset(prefix: string) {
  return prepareAtcContextDataset({
  sectors: ["S0", "S1", "S2"].map((id) => ({
    id: `${prefix}${id}`, name: `${prefix}${id}`, atcCallsign: `${prefix}${id}`, airspaceType: "CTA_SECTOR", airspaceClass: "C",
    polygons: [[[17.4, 48.9], [17.6, 48.9], [17.6, 49.1], [17.4, 49.1], [17.4, 48.9]]],
    lowerAltitudeFt: 0, upperAltitudeFt: 40000, frequencies: [], validFrom: null, validTo: null,
    country: "CZ", source: "benchmark", sourceReference: "benchmark", lastVerifiedAt: new Date(NOW).toISOString(),
  })),
  routeDocuments: [],
  });
}
const dataset = makeDataset("");
const refreshedDataset = makeDataset("R");

function situation(icaoHex: string, index: number, refreshed = false): OperationalTwinSituation {
  return {
    generatedAt: new Date(NOW).toISOString(), aircraft: { icaoHex },
    events: [0, 1, 2].map((sector) => ({
      type: "ATC_SECTOR_ENTRY" as const, id: `sector:${refreshed ? "R" : ""}S${sector}:${icaoHex}:${index}`,
      at: new Date(NOW + 5 * 60_000 + index * 1_000 + (refreshed ? 60_000 : 0)).toISOString(), title: `${refreshed ? "R" : ""}S${sector}`,
      lat: 49, lon: 17.5, altitudeFt: 30000, confidence: "HIGH" as const, provenance: "PREDICTED" as const,
    })),
  } as unknown as OperationalTwinSituation;
}

function aircraft(icaoHex: string, cycle: number): Aircraft {
  let trail = trails.get(icaoHex);
  if (!trail) {
    trail = Array.from({ length: TRAIL_POINTS }, (_, index) => ({
      recordedAt: new Date(NOW + index * 1_000).toISOString(), lat: 49, lon: 18.5,
      altitude: 30000, track: 90, groundSpeed: 420,
    }));
    trails.set(icaoHex, trail);
  } else if (cycle === 5) {
    trail = [...trail.slice(1), {
      recordedAt: new Date(NOW + TRAIL_POINTS * 1_000).toISOString(), lat: 49, lon: 18.5,
      altitude: 30000, track: 90, groundSpeed: 420,
    }];
    trails.set(icaoHex, trail);
  } else if (cycle === 7) {
    trail = trail.map((point, index) => index === 20 ? { ...point, altitude: (point.altitude ?? 0) + 100 } : point);
    trails.set(icaoHex, trail);
  }
  return {
    icaoHex, callsign: null, registration: null, aircraftType: null, aircraftDescription: null,
    lat: 49, lon: 18.5, altitude: 30000, baroAltitude: 30000, geomAltitude: null,
    groundSpeed: 420, track: 90, verticalRate: 0, baroRate: 0, geomRate: null,
    squawk: null, category: null, emergency: null, rssi: null, messages: 1,
    seenSeconds: 0, seenPosSeconds: cycle, lastSeen: new Date(NOW + cycle * 1_000).toISOString(),
    source: "ADS-B", origin: "local", sourceType: null, onGround: false, distanceKm: null, bearing: null, trail,
  };
}

function snapshot(cycle: number): ReadonlyMap<string, Aircraft> {
  return new Map(Array.from({ length: AIRCRAFT_COUNT }, (_, index) => {
    const icaoHex = (0xabc000 + index).toString(16).toUpperCase();
    return [icaoHex, aircraft(icaoHex, cycle)] as const;
  }));
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function run(enableIncrementalTruthEvaluation: boolean) {
  trails.clear();
  const validator = new OperationalTwinEventOutcomeValidator({ enableAtcTruthCache: true, enableIncrementalTruthEvaluation });
  for (let index = 0; index < AIRCRAFT_COUNT; index += 1) {
    const icaoHex = (0xabc000 + index).toString(16).toUpperCase();
    validator.capture(situation(icaoHex, index), { atcDataset: dataset, sigmets: null, destination: null }, NOW);
  }
  const cpuBefore = process.cpuUsage();
  const memoryBefore = process.memoryUsage();
  const durations: number[] = [];
  for (let cycle = 0; cycle < REFRESH_CYCLES; cycle += 1) {
    const observationAt = NOW + 60_000 + cycle * 1_000;
    if (cycle === Math.floor(REFRESH_CYCLES / 2)) {
      for (let index = 0; index < AIRCRAFT_COUNT; index += 1) {
        const icaoHex = (0xabc000 + index).toString(16).toUpperCase();
        validator.capture(situation(icaoHex, index, true), { atcDataset: refreshedDataset, sigmets: null, destination: null }, observationAt);
      }
    }
    const started = performance.now();
    validator.observeLocal(snapshot(cycle), observationAt);
    durations.push(performance.now() - started);
  }
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  const stats = "getAtcCacheStats" in validator
    ? validator.getAtcCacheStats()
    : { hits: 0, misses: 0, evictions: 0, expirations: 0, size: 0, maxEntries: 0, ttlMs: 0 };
  const warm = durations.slice(1);
  return {
    algorithm: enableIncrementalTruthEvaluation ? "incremental" : "full-scan-reference",
    workload: { aircraft: AIRCRAFT_COUNT, trailPoints: TRAIL_POINTS, pendingPerAircraft: 3, refreshCycles: REFRESH_CYCLES },
    computeAtcContextCalls: stats.misses, cacheHits: stats.hits, cacheMisses: stats.misses,
    cacheHitRate: stats.hits + stats.misses ? stats.hits / (stats.hits + stats.misses) : 0,
    coldObserveMs: Number((durations[0] ?? 0).toFixed(3)),
    warmObserveP50Ms: Number(percentile(warm, 0.5).toFixed(3)),
    warmObserveP95Ms: Number(percentile(warm, 0.95).toFixed(3)),
    warmObserveP99Ms: Number(percentile(warm, 0.99).toFixed(3)),
    cpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
    heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed, rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
    cacheSize: stats.size, report: validator.report(new Date(NOW + 60_000 + REFRESH_CYCLES * 1_000)),
  };
}

const before = run(false);
const after = run(true);
const semanticReport = (report: ReturnType<OperationalTwinEventOutcomeValidator["report"]>) => {
  const { performance: operationStats, ...semantic } = report;
  void operationStats;
  return semantic;
};
console.log(JSON.stringify({
  version: "operational-twin-performance-v3", reproducibility: { node: process.version, now: new Date(NOW).toISOString() },
  reference: before, optimized: after, reportsMatch: JSON.stringify(semanticReport(before.report)) === JSON.stringify(semanticReport(after.report)),
}, null, 2));
