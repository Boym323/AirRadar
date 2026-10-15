import { performance } from "node:perf_hooks";
import { prepareAtcContextDataset } from "@/lib/atc-context/engine";
import { OperationalTwinEventOutcomeValidator, type OperationalTwinSituation } from "@/lib/operational-twin";
import type { Aircraft } from "@/lib/aircraft/types";

const BASE_NOW = Date.parse("2026-10-14T12:00:00.000Z");
const TRAIL_POINTS = 120;
const AGING_CYCLES = 45;
const MEASURE_CYCLES = 5;
const AIRCRAFT_COUNTS = (process.env.RADAR_TWIN_BENCH_COUNTS
  ?.split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0) ?? [70, 100, 250, 500]);
const COMPARE_BASELINE = process.env.RADAR_TWIN_BENCH_COMPARE === "1";
const PROFILE_PHASES = process.env.RADAR_TWIN_BENCH_PROFILE === "1";

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function datasetFor(prefix: string) {
  return prepareAtcContextDataset({
    sectors: ["S0", "S1", "S2"].map((id) => ({
      id: `${prefix}${id}`,
      name: `${prefix}${id}`,
      atcCallsign: `${prefix}${id}`,
      airspaceType: "CTA_SECTOR",
      airspaceClass: "C",
      polygons: [[[17.4, 48.9], [17.6, 48.9], [17.6, 49.1], [17.4, 49.1], [17.4, 48.9]]],
      lowerAltitudeFt: 0,
      upperAltitudeFt: 40000,
      frequencies: [],
      validFrom: null,
      validTo: null,
      country: "CZ",
      source: "benchmark",
      sourceReference: "benchmark",
      lastVerifiedAt: new Date(BASE_NOW).toISOString(),
    })),
    routeDocuments: [],
  });
}

function aircraft(icaoHex: string, observedAt: number, index: number): Aircraft {
  const trail = Array.from({ length: TRAIL_POINTS }, (_, pointIndex) => {
    const at = observedAt - (TRAIL_POINTS - pointIndex - 1) * 1_000;
    return {
      recordedAt: new Date(at).toISOString(),
      lat: 49 + index / 100_000,
      lon: 18.5 + index / 100_000,
      altitude: 30000,
      track: 90,
      groundSpeed: 420,
    };
  });
  return {
    icaoHex,
    callsign: null,
    registration: null,
    aircraftType: null,
    aircraftDescription: null,
    lat: trail.at(-1)!.lat,
    lon: trail.at(-1)!.lon,
    altitude: 30000,
    baroAltitude: 30000,
    geomAltitude: null,
    groundSpeed: 420,
    track: 90,
    verticalRate: 0,
    baroRate: 0,
    geomRate: null,
    squawk: null,
    category: null,
    emergency: null,
    rssi: null,
    messages: 1,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: new Date(observedAt).toISOString(),
    source: "ADS-B",
    origin: "local",
    sourceType: null,
    onGround: false,
    distanceKm: null,
    bearing: null,
    trail,
  };
}

function situation(icaoHex: string, captureAt: number, index: number): OperationalTwinSituation {
  const targetLat = 48 + index / 100_000;
  const targetLon = 17 + index / 100_000;
  return {
    generatedAt: new Date(captureAt).toISOString(),
    aircraft: { icaoHex },
    events: [5, 15, 30].map((horizon, eventIndex) => ({
      type: "ATC_SECTOR_ENTRY" as const,
      id: `sector:S${eventIndex}:${icaoHex}:${captureAt}`,
      at: new Date(captureAt + horizon * 60_000).toISOString(),
      title: `S${eventIndex}`,
      lat: targetLat,
      lon: targetLon,
      altitudeFt: 30000,
      confidence: "HIGH" as const,
      provenance: "PREDICTED" as const,
    })),
  } as unknown as OperationalTwinSituation;
}

function snapshot(count: number, observedAt: number): ReadonlyMap<string, Aircraft> {
  return new Map(Array.from({ length: count }, (_, index) => {
    const icaoHex = (0xabc000 + index).toString(16).toUpperCase();
    return [icaoHex, aircraft(icaoHex, observedAt, index)] as const;
  }));
}

function run(count: number, aged: boolean, optimized: boolean) {
  const validator = new OperationalTwinEventOutcomeValidator({
    enableIncrementalTruthEvaluation: optimized,
    // V4.5 already uses the indexed expiry queue; keep it identical in both
    // the e8260a6a reference and the V4.6 candidate.
    enableExpiryQueue: true,
    profilePhases: PROFILE_PHASES,
  });
  const dataset = datasetFor("");
  const observeDurations: number[] = [];
  const firstAt = BASE_NOW;
  const cycles = aged ? AGING_CYCLES : 1;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const at = firstAt + cycle * 60_000;
    for (let index = 0; index < count; index += 1) {
      const icaoHex = (0xabc000 + index).toString(16).toUpperCase();
      validator.capture(
        situation(icaoHex, at, index),
        { atcDataset: dataset, sigmets: null, destination: null },
        at,
      );
    }
    if (aged || cycle === 0) {
      const started = performance.now();
      validator.observeLocal(snapshot(count, at), at);
      observeDurations.push(performance.now() - started);
    }
  }

  if (aged) {
    for (let cycle = 0; cycle < MEASURE_CYCLES; cycle += 1) {
      const at = firstAt + (cycles + cycle) * 60_000;
      const started = performance.now();
      validator.observeLocal(snapshot(count, at), at);
      observeDurations.push(performance.now() - started);
    }
  }

  const report = validator.report(new Date(firstAt + (cycles + MEASURE_CYCLES) * 60_000));
  const cache = validator.getAtcCacheStats();
  return {
    aircraft: count,
    variant: optimized ? "optimized" : "baseline",
    state: aged ? "aged" : "fresh",
    trailPoints: TRAIL_POINTS,
    agingCycles: cycles,
    pending: report.pending,
    pendingCapacityEvictions: report.capacityEvictions,
    observeP50Ms: Number(percentile(observeDurations, 0.5).toFixed(3)),
    observeP95Ms: Number(percentile(observeDurations, 0.95).toFixed(3)),
    observeMaxMs: Number(Math.max(...observeDurations).toFixed(3)),
    cacheHits: cache.hits,
    cacheMisses: cache.misses,
    cacheSize: cache.size,
    heapUsedBytes: process.memoryUsage().heapUsed,
    performance: report.performance,
  };
}

const variants = COMPARE_BASELINE ? [false, true] : [true];
const results = variants.flatMap((optimized) => AIRCRAFT_COUNTS.flatMap((count) => [
  run(count, false, optimized),
  run(count, true, optimized),
]));
console.log(JSON.stringify({
  version: "operational-twin-aged-state-v1",
  configuration: { trailPoints: TRAIL_POINTS, agingCycles: AGING_CYCLES, measureCycles: MEASURE_CYCLES, atcResolution: "OFF", atcShadowPrediction: "OFF", compareBaseline: COMPARE_BASELINE, profilePhases: PROFILE_PHASES },
  results,
}, null, 2));
