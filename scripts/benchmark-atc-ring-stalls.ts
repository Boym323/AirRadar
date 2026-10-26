/** Same-run A/B for the V8-profiled ATC ring scan. CI runner only. */
import { readFileSync } from "node:fs";
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import { pointInPolygon, type LonLat } from "../lib/atc-context/geometry";

type Ring = LonLat[];
function longestRing(value: unknown, current: Ring = []): Ring {
  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0]) &&
        typeof value[0][0] === "number" && typeof value[0][1] === "number") {
      return value.length > current.length ? value as Ring : current;
    }
    for (const item of value) current = longestRing(item, current);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) current = longestRing(item, current);
  }
  return current;
}

// The exact pre-fix predicate is retained only as a benchmark oracle. The
// production path imports pointInPolygon from the source under test.
function legacyRingContains(point: LonLat, ring: Ring): "inside" | "boundary" | null {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(cross) < 1e-9 && point[0] >= Math.min(a[0], b[0]) - 1e-9 && point[0] <= Math.max(a[0], b[0]) + 1e-9 && point[1] >= Math.min(a[1], b[1]) - 1e-9 && point[1] <= Math.max(a[1], b[1]) + 1e-9) return "boundary";
    if ((b[1] > point[1]) !== (a[1] > point[1]) && point[0] < ((a[0] - b[0]) * (point[1] - b[1])) / (a[1] - b[1]) + b[0]) inside = !inside;
  }
  return inside ? "inside" : null;
}
function legacyPointInPolygon(point: LonLat, rings: Ring[]): "inside" | "boundary" | null {
  if (!rings[0] || legacyRingContains(point, rings[0]) === null) return null;
  if (rings.slice(1).some((hole) => legacyRingContains(point, hole) === "inside")) return null;
  return rings.some((ring) => legacyRingContains(point, ring) === "boundary") ? "boundary" : "inside";
}
function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}
function positionsFor(ring: Ring, count: number): LonLat[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  let seed = 0x5eed1234;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
  return Array.from({ length: count }, (_, i): LonLat => i % 8 === 0 ? ring[(i * 173) % ring.length]! :
    i % 8 === 1 ? [maxX + 0.1, maxY + 0.1] :
    [minX + random() * (maxX - minX), minY + random() * (maxY - minY)]);
}

async function measure(points: LonLat[], ring: Ring, predicate: (point: LonLat, rings: Ring[]) => unknown) {
  const histogram = monitorEventLoopDelay({ resolution: 1 });
  const durations: number[] = [];
  let gcPauseMs = 0, gcCount = 0;
  const gc = new PerformanceObserver((list) => { for (const entry of list.getEntries()) {
    gcPauseMs += entry.duration; gcCount++;
  } });
  gc.observe({ entryTypes: ["gc"] });
  histogram.enable();
  const cpuStart = process.cpuUsage();
  const rssStart = process.memoryUsage().rss;
  for (const point of points) {
    const start = performance.now();
    predicate(point, [ring]);
    durations.push(performance.now() - start);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  const cpu = process.cpuUsage(cpuStart);
  const rssEnd = process.memoryUsage().rss;
  const loopMaxMs = histogram.max / 1e6;
  histogram.disable(); gc.disconnect();
  durations.sort((a, b) => a - b);
  return {
    calls: durations.length, p50Ms: percentile(durations, .5), p95Ms: percentile(durations, .95),
    p99Ms: percentile(durations, .99), maxMs: durations.at(-1) ?? 0,
    totalMs: durations.reduce((sum, n) => sum + n, 0),
    cpuMs: (cpu.user + cpu.system) / 1_000, loopMaxMs,
    rssStartBytes: rssStart, rssEndBytes: rssEnd, gcCount, gcPauseMs,
  };
}

/** A/B against the pre-index implementation, on the exact same ring and points.
 * Build cost is reported separately and never counted in hot-path throughput. */
export async function runV1AtcLatitudeIndexBenchmark(): Promise<object> {
  const source = JSON.parse(readFileSync(new URL("../data/atc/sk-state-boundary.json", import.meta.url), "utf8"));
  const raw = longestRing(source);
  if (raw.length < 40_000 || raw.length > 100_000) throw new Error("atc_fixture_invalid");
  // Compare the SAME current V1 implementation, switching only ring mutability.
  // Mutable rings intentionally take the existing unindexed geometry path.
  const plainRing = raw.map((point) => [point[0], point[1]] as LonLat);
  const ring = Object.freeze(raw.map((point) => Object.freeze([point[0], point[1]] as LonLat))) as unknown as Ring;
  const points = positionsFor(ring, 128);
  const before = await measure(points, plainRing, pointInPolygon);
  const { prewarmFrozenAtcRing } = await import("../lib/atc-context/latitude-ring-index");
  const prewarmStart = performance.now();
  const indexed = await prewarmFrozenAtcRing(ring);
  const buildMs = performance.now() - prewarmStart;
  if (!indexed) throw new Error("atc_index_build_rejected_fixture");
  let mismatches = 0;
  for (const point of points) {
    if (pointInPolygon(point, [plainRing]) !== pointInPolygon(point, [ring])) mismatches++;
  }
  if (mismatches) throw new Error(`atc_index_semantic_mismatch:${mismatches}`);
  const after = await measure(points, ring, pointInPolygon);
  return {
    scenario: "v1-atc-latitude-index", vertices: ring.length, points: points.length,
    mismatches, buildMs: Number(buildMs.toFixed(3)), before, after,
    relativeCpu: before.cpuMs > 0 ? Number((after.cpuMs / before.cpuMs).toFixed(3)) : null,
    limitation: "CI synthetic positions, same hardware and run; not a production T58/CPU claim.",
  };
}

export async function runAtcRingScenario(multiplier: number) {
  if (![1, 2, 4].includes(multiplier)) throw new Error("invalid_atc_ring_multiplier");
  const source = JSON.parse(readFileSync(new URL("../data/atc/sk-state-boundary.json", import.meta.url), "utf8"));
  const ring = longestRing(source);
  if (ring.length < 40_000 || ring.length > 100_000) throw new Error("atc_ring_fixture_invalid");
  const points = positionsFor(ring, 64 * multiplier);
  let mismatches = 0;
  for (const point of points) if (legacyPointInPolygon(point, [ring]) !== pointInPolygon(point, [ring])) mismatches++;
  if (mismatches) throw new Error(`atc_ring_semantic_mismatch:${mismatches}`);
  for (const point of points.slice(0, 8)) { legacyPointInPolygon(point, [ring]); pointInPolygon(point, [ring]); }
  const before = await measure(points, ring, legacyPointInPolygon);
  const after = await measure(points, ring, pointInPolygon);
  return { ringVertices: ring.length, points: points.length, mismatches,
    before, after, relativeCpu: before.cpuMs > 0 ? after.cpuMs / before.cpuMs : null,
    limitation: "Same-run synthetic points on checked-in SK boundary; not a production latency claim." };
}
