/**
 * Synthetic, deterministic baseline-versus-optimized network trail microbench.
 * Run off production:
 *   JITI_TSCONFIG_PATHS=true jiti scripts/benchmark-network-trail-update.ts
 *
 * This measures only trail update CPU/allocations, not the whole network
 * provider, IO or event-loop stall distribution. Times are informational.
 */
import { performance } from "node:perf_hooks";
import type { TrailPoint } from "@/lib/aircraft/types";
import { appendBoundedNetworkTrailPoint, appendTrailPoint } from "@/lib/aircraft/trail";

const BASE_MS = Date.parse("2026-10-15T09:00:00.000Z");
const AIRCRAFT = 300;
const FRAMES = 180;
const TRAIL_POINTS = 120;
const MAX_POINTS = 120;
const MAX_AGE_MS = 10 * 60_000;

function point(aircraft: number, second: number): TrailPoint {
  return {
    lat: 49 + (aircraft % 50) / 1000,
    lon: 14 + (aircraft % 75) / 1000 + second / 1_000_000,
    recordedAt: new Date(BASE_MS + second * 1000).toISOString(),
    altitude: 30_000,
    groundSpeed: 420,
    track: 90,
  };
}

function baseline(trail: readonly TrailPoint[], incoming: TrailPoint | null, cutoff: number): TrailPoint[] {
  const next = incoming ? appendTrailPoint(trail, incoming) : trail;
  const bounded = next.filter((candidate) => {
    const observedAt = Date.parse(candidate.recordedAt);
    return !Number.isFinite(cutoff) || (Number.isFinite(observedAt) && observedAt >= cutoff);
  });
  return bounded.slice(-MAX_POINTS);
}

function run(optimized: boolean): { wallMs: number; cpuMs: number; bytes: number; checksum: string } {
  const trails = Array.from({ length: AIRCRAFT }, (_, aircraft) =>
    Array.from({ length: TRAIL_POINTS }, (_, index) => point(aircraft, index)));
  const original = optimized ? appendBoundedNetworkTrailPoint : baseline;
  // Initialize the per-array weak cache without mixing cold initial import
  // costs into the steady-state measurement (the first call is a fallback).
  if (optimized) {
    for (let aircraft = 0; aircraft < AIRCRAFT; aircraft += 1) {
      trails[aircraft] = original(trails[aircraft]!, null, BASE_MS - 1, MAX_POINTS);
    }
  }
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const second = TRAIL_POINTS + frame;
    const cutoff = BASE_MS + second * 1000 - MAX_AGE_MS;
    for (let aircraft = 0; aircraft < AIRCRAFT; aircraft += 1) {
      // A normal ADS-B poll does not necessarily contain a new position.
      // Repeated positions are represented with a previously observed time.
      const incoming = frame % 17 === 0 ? point(aircraft, second)
        : frame % 13 === 0 ? null
          : point(aircraft, second - (frame % 17));
      trails[aircraft] = original(trails[aircraft]!, incoming, cutoff, MAX_POINTS);
    }
  }
  const wallMs = performance.now() - start;
  const cpuUsage = process.cpuUsage(cpuStart);
  const checksum = JSON.stringify(trails);
  return { wallMs, cpuMs: (cpuUsage.user + cpuUsage.system) / 1000, bytes: Buffer.byteLength(checksum), checksum };
}

function median(values: number[]): number {
  return values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
}

run(false);
run(true);
const samples = Array.from({ length: 3 }, () => ({ before: run(false), after: run(true) }));
for (const { before, after } of samples) {
  if (before.bytes !== after.bytes || before.checksum !== after.checksum) {
    throw new Error("network_trail_differential_parity_failed");
  }
}
const result = {
  scenario: "synthetic-300-aircraft-180-frames-120-points",
  aircraft: AIRCRAFT,
  frames: FRAMES,
  operations: AIRCRAFT * FRAMES,
  observedWireParity: true,
  baselineCpuMsMedian: median(samples.map((s) => s.before.cpuMs)),
  optimizedCpuMsMedian: median(samples.map((s) => s.after.cpuMs)),
  baselineWallMsMedian: median(samples.map((s) => s.before.wallMs)),
  optimizedWallMsMedian: median(samples.map((s) => s.after.wallMs)),
  note: "Non-production synthetic microbench; no inference of a production event-loop tail improvement.",
};
console.log(JSON.stringify(result, null, 2));
