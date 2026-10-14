#!/usr/bin/env node
/**
 * Read-only ATC preparation benchmark. Run outside the live service with:
 *   ATC_BENCHMARK_NON_PRODUCTION=true npm run benchmark:atc:preparation
 */
import "dotenv/config";
import "temporal-polyfill/full/global";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { getAtcDataSnapshot } from "../lib/server/providers";
import { loadAtAtsRoutes } from "../lib/ats/at-routes";
import { loadCzAtsRoutes } from "../lib/ats/cz-routes";
import { loadSkAtsRoutes } from "../lib/ats/sk-routes";
import {
  atcContextDatasetIdentityAsync,
  prepareAtcContextDataset,
  prepareAtcContextDatasetAsync,
  prepareAtcSectorDatasetAsync,
  getAtcSectorCandidatesFromIndex,
} from "../lib/atc-context/engine";
import { matchSector } from "../lib/server/atc-sector-service";
import type { AtcContextDataset } from "../lib/atc-context/types";
import type { AtcLookup, AtcSector } from "../lib/atc/types";

if (process.env.ATC_BENCHMARK_NON_PRODUCTION !== "true") throw new Error("Set ATC_BENCHMARK_NON_PRODUCTION=true.");

const LOOKUPS = Number(process.env.ATC_BENCHMARK_LOOKUPS ?? 3637);
const now = new Date("2026-10-14T08:00:00.000Z");

function fmt(value: number): number { return Number(value.toFixed(3)); }
function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}
function memory(): NodeJS.MemoryUsage { return process.memoryUsage(); }
async function timed<T>(operation: () => T | Promise<T>): Promise<{ value: T; wallMs: number; maxTurnMs: number; eventLoop: { p95Ms: number; p99Ms: number; maxMs: number }; elu: number }> {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const eluStart = performance.eventLoopUtilization();
  let running = true;
  let previous = performance.now();
  let maxTurnMs = 0;
  const tick = () => {
    const current = performance.now();
    maxTurnMs = Math.max(maxTurnMs, current - previous);
    previous = current;
    if (running) setImmediate(tick);
  };
  setImmediate(tick);
  const started = performance.now();
  const value = await operation();
  running = false;
  await new Promise<void>((resolve) => setImmediate(resolve));
  const wallMs = performance.now() - started;
  const elu = performance.eventLoopUtilization(eluStart).utilization;
  histogram.disable();
  return {
    value,
    wallMs,
    maxTurnMs,
    eventLoop: {
      p95Ms: histogram.percentile(95) / 1e6,
      p99Ms: histogram.percentile(99) / 1e6,
      maxMs: histogram.max / 1e6,
    },
    elu,
  };
}

function datasetCounts(sectors: readonly AtcSector[], routeDocuments: AtcContextDataset["routeDocuments"]): Record<string, number> {
  const polygons = sectors.flatMap((sector) => sector.polygons);
  const vertices = polygons.reduce((sum, polygon) => sum + polygon.length, 0);
  const rings = polygons.length;
  const routeSegments = routeDocuments.reduce((sum, doc) => sum + doc.routes.reduce((inner, route) => inner + route.segments.length, 0), 0);
  const routePoints = routeDocuments.reduce((sum, doc) => sum + doc.routes.reduce((inner, route) => inner + route.points.length, 0), 0);
  return { sectors: sectors.length, polygons: rings, rings, vertices, routeDocuments: routeDocuments.length, routeSegments, routePoints };
}

function lookupPositions(sectors: readonly AtcSector[], count: number): AtcLookup[] {
  const positions: AtcLookup[] = [];
  for (let index = 0; index < count; index += 1) {
    const sector = sectors[index % Math.max(1, sectors.length)];
    const polygon = sector?.polygons[0];
    const point = polygon?.[index % Math.max(1, polygon.length)] ?? [14, 50];
    positions.push({ longitude: point[0] + 0.001, latitude: point[1] + 0.001, altitudeFt: 8000, observedAt: now });
  }
  return positions;
}

const beforeMemory = memory();
const providerLoad = await timed(() => getAtcDataSnapshot());
const snapshot = providerLoad.value;
const routeDocuments = [loadCzAtsRoutes(), loadSkAtsRoutes(), loadAtAtsRoutes()].filter((doc): doc is NonNullable<typeof doc> => doc !== null);
const dataset = { sectors: [...snapshot.sectors], routeDocuments } satisfies AtcContextDataset;
const counts = datasetCounts(dataset.sectors, routeDocuments);

const clone = await timed(() => structuredClone(dataset));
const identity = await timed(() => atcContextDatasetIdentityAsync(dataset.sectors, routeDocuments));
const before = await timed(() => prepareAtcContextDataset(dataset));
const afterAssignment = await timed(() => prepareAtcSectorDatasetAsync(snapshot.sectors, { owned: true }));
const afterContext = await timed(() => prepareAtcContextDatasetAsync(dataset, { owned: true }));

const positions = lookupPositions(snapshot.sectors, LOOKUPS);
const lookupDurations: number[] = [];
for (const position of positions) {
  const started = performance.now();
  const candidateSectors = getAtcSectorCandidatesFromIndex(afterAssignment.value, position.longitude, position.latitude);
  candidateSectors.map((sector) => matchSector(sector, position)).filter(Boolean);
  lookupDurations.push(performance.now() - started);
}
const afterMemory = memory();
function diagnostic(value: Awaited<ReturnType<typeof timed>>): Record<string, unknown> {
  return {
  wallMs: fmt(value.wallMs),
  maxUninterruptedTurnMs: fmt(value.maxTurnMs),
  eventLoop: { p95Ms: fmt(value.eventLoop.p95Ms), p99Ms: fmt(value.eventLoop.p99Ms), maxMs: fmt(value.eventLoop.maxMs) },
  eventLoopUtilization: fmt(value.elu),
  };
}
const diagnostics = {
  "atc.dataset.structured-clone": diagnostic(clone),
  "atc.dataset.identity": diagnostic(identity),
  "before.full-preparation": diagnostic(before),
  "after.assignment-preparation": diagnostic(afterAssignment),
  "after.context-preparation": diagnostic(afterContext),
};

console.log(JSON.stringify({
  commit: process.env.GIT_COMMIT ?? "unknown",
  node: process.version,
  dataset: { ...counts, atcGridCells: afterAssignment.value.atcGrid.size, contextAtcGridCells: afterContext.value.atcGrid.size, atsGridCells: afterContext.value.atsGrid.size, pointGridCells: afterContext.value.pointGrid.size },
  scenarios: { lookups: LOOKUPS, observedAt: now.toISOString(), gcAvailable: typeof global.gc === "function" },
  preparation: { providerLoadMs: fmt(providerLoad.wallMs), ...diagnostics },
  lookup: { p50Ms: fmt(percentile(lookupDurations, 0.5)), p95Ms: fmt(percentile(lookupDurations, 0.95)), p99Ms: fmt(percentile(lookupDurations, 0.99)), maxMs: fmt(Math.max(...lookupDurations)), totalMs: fmt(lookupDurations.reduce((sum, value) => sum + value, 0)) },
  memory: { before: { heapUsed: beforeMemory.heapUsed, rss: beforeMemory.rss }, after: { heapUsed: afterMemory.heapUsed, rss: afterMemory.rss }, delta: { heapUsed: afterMemory.heapUsed - beforeMemory.heapUsed, rss: afterMemory.rss - beforeMemory.rss } },
  note: "before is the legacy synchronous universal context builder with a full structuredClone; after separates the assignment-only index from the async full context builder. Event-loop numbers are laboratory measurements outside the live process.",
}, null, 2));
