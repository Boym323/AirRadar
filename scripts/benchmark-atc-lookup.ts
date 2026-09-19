#!/usr/bin/env node
/** Read-only ATC A/B benchmark and correctness audit. */
import "dotenv/config";
import "temporal-polyfill/full/global";
import { serialize } from "node:v8";
import { pointInPolygon, bbox, bboxContains } from "../lib/atc-context/geometry";
import { prepareAtcContextDataset } from "../lib/atc-context/engine";
import type { PreparedAtcContextDataset } from "../lib/atc-context/types";
import { getAtcData } from "../lib/server/providers";
import { compareAtcMatches, matchSector } from "../lib/server/atc-sector-service";
import { getPollIntervalMs } from "../lib/server/config";
import type { AtcLookup, AtcSector, AtcSectorMatch } from "../lib/atc/types";

if (process.env.ATC_BENCHMARK_NON_PRODUCTION !== "true") throw new Error("Set ATC_BENCHMARK_NON_PRODUCTION=true.");
const CORRECTNESS_POSITIONS = Number(process.env.ATC_BENCHMARK_POSITIONS ?? 100_000);
const RUNS = 3; const WARMUP = 20_000; const OBSERVED_AT = new Date("2026-09-19T12:00:00.000Z"); const SEED = 0x5eed1234;
type Position = AtcLookup & { lat: number; lon: number };

function rng(seed: number): () => number { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x1_0000_0000; }; }
function fmt(value: number): number { return Number(value.toFixed(3)); }
function ids(matches: readonly AtcSectorMatch[]): string[] { return matches.map((match) => match.sector.id); }
function resultKey(matches: readonly AtcSectorMatch[]): Array<[string, string, string | null]> { return matches.map((m) => [m.sector.id, m.confidence, m.altitudeConfidence ?? null]); }
function equal(a: readonly AtcSectorMatch[], b: readonly AtcSectorMatch[]): boolean {
  if (JSON.stringify(resultKey(a[0] ? [a[0]] : [])) !== JSON.stringify(resultKey(b[0] ? [b[0]] : []))) return false;
  return JSON.stringify([...resultKey(a)].sort((left, right) => left[0].localeCompare(right[0]))) === JSON.stringify([...resultKey(b)].sort((left, right) => left[0].localeCompare(right[0])));
}
function allMatches(sectors: readonly AtcSector[], point: Position): AtcSectorMatch[] { return sectors.map((sector) => matchSector(sector, point)).filter((m): m is AtcSectorMatch => m !== null).sort(compareAtcMatches); }
function bboxPotential(sectorBoxes: ReadonlyArray<{ sector: AtcSector; boxes: Array<[number, number, number, number]> }>, point: Position): AtcSector[] {
  return sectorBoxes.filter((entry) => entry.boxes.some((box) => bboxContains(box, [point.lon, point.lat]))).map((entry) => entry.sector);
}
function altitudeFor(sector: AtcSector, random: () => number): number | null { if (random() < 0.12) return null; const low = sector.lowerAltitudeFt ?? 0; const high = sector.upperAltitudeFt ?? Math.max(low + 45_000, 45_000); return Math.max(0, low - 5_000 + Math.floor(random() * Math.max(1, high - low + 10_000))); }
function point(lon: number, lat: number, altitudeFt: number | null): Position { return { longitude: lon, latitude: lat, lon, lat, altitudeFt, observedAt: OBSERVED_AT }; }
function insidePosition(sector: AtcSector, random: () => number): Position | null {
  for (const polygon of sector.polygons) { const box = bbox([polygon]); for (let attempt = 0; attempt < 100; attempt++) { const lon = box[0] + random() * (box[2] - box[0]); const lat = box[1] + random() * (box[3] - box[1]); if (pointInPolygon([lon, lat], [polygon]) !== null) return point(lon, lat, altitudeFor(sector, random)); } }
  return null;
}
function makePositions(count: number, sectors: readonly AtcSector[]): Position[] {
  const random = rng(SEED + count); const vertices: Array<{ sector: AtcSector; lon: number; lat: number }> = []; let minLon = Number.POSITIVE_INFINITY; let maxLon = Number.NEGATIVE_INFINITY; let minLat = Number.POSITIVE_INFINITY; let maxLat = Number.NEGATIVE_INFINITY;
  for (const sector of sectors) for (const polygon of sector.polygons) { const box = bbox([polygon]); minLon = Math.min(minLon, box[0]); maxLon = Math.max(maxLon, box[2]); minLat = Math.min(minLat, box[1]); maxLat = Math.max(maxLat, box[3]); for (const [lon, lat] of polygon.slice(0, 40)) if (vertices.length < 5_000) vertices.push({ sector, lon, lat }); }
  minLon -= 1; maxLon += 1; minLat -= 1; maxLat += 1;
  const overlap: Position[] = []; const outside: Position[] = [];
  for (let attempt = 0; attempt < 5_000 && (overlap.length < 100 || outside.length < 100); attempt++) { const candidate = point(minLon + random() * (maxLon - minLon), minLat + random() * (maxLat - minLat), 500 + Math.floor(random() * 39_500)); const found = allMatches(sectors, candidate); if (found.length >= 2 && overlap.length < 100) overlap.push(candidate); if (!found.length && outside.length < 100) outside.push(candidate); }
  const boundary = vertices.map(({ sector, lon, lat }) => point(lon, lat, altitudeFor(sector, random))); const gridBoundary: Position[] = [];
  for (const { lon, lat } of vertices) for (const x of [Math.floor(lon), Math.ceil(lon)]) for (const y of [Math.floor(lat), Math.ceil(lat)]) gridBoundary.push(point(x, y, null));
  const result: Position[] = [];
  for (let i = 0; i < count; i++) { const mode = i % 6; if (mode === 0) { const candidate = insidePosition(sectors[i % sectors.length], random); if (candidate) { result.push(candidate); continue; } } if (mode === 1 && overlap.length) { result.push(overlap[i % overlap.length]); continue; } if (mode === 2 && boundary.length) { result.push(boundary[i % boundary.length]); continue; } if (mode === 3 && outside.length) { result.push(outside[i % outside.length]); continue; } if (mode === 4 && gridBoundary.length) { result.push(gridBoundary[i % gridBoundary.length]); continue; } result.push(point(minLon + random() * (maxLon - minLon), minLat + random() * (maxLat - minLat), 500 + Math.floor(random() * 39_500))); }
  return result;
}
function gridIndexes(dataset: PreparedAtcContextDataset, point: Position): number[] { return [...new Set(dataset.atcGrid.get(`${Math.floor(point.lon)}:${Math.floor(point.lat)}`) ?? [])]; }
function indexedMatches(dataset: PreparedAtcContextDataset, point: Position): AtcSectorMatch[] { return gridIndexes(dataset, point).map((index) => dataset.airspaces[index]?.sector).filter((sector): sector is AtcSector => Boolean(sector)).flatMap((sector) => { const match = matchSector(sector, point); return match ? [match] : []; }).sort(compareAtcMatches); }
function candidateStats(sectors: readonly AtcSector[], dataset: PreparedAtcContextDataset, point: Position): { linearCandidates: number; gridCandidates: number; linearPolygonTests: number; gridPolygonTests: number } {
  let linearPolygonTests = 0; for (const sector of sectors) for (const polygon of sector.polygons) { linearPolygonTests++; void pointInPolygon([point.lon, point.lat], [polygon]); }
  const indexes = gridIndexes(dataset, point); let gridPolygonTests = 0; for (const index of indexes) { const entry = dataset.airspaces[index]; if (!entry) continue; for (let i = 0; i < entry.boxes.length; i++) if (bboxContains(entry.boxes[i], [point.lon, point.lat])) { gridPolygonTests++; void pointInPolygon([point.lon, point.lat], [entry.sector.polygons[i] ?? []]); } }
  return { linearCandidates: sectors.length, gridCandidates: indexes.length, linearPolygonTests, gridPolygonTests };
}
function gridPolygonTestCount(dataset: PreparedAtcContextDataset, point: Position): number { let count = 0; for (const index of gridIndexes(dataset, point)) { const entry = dataset.airspaces[index]; if (!entry) continue; for (const box of entry.boxes) if (bboxContains(box, [point.lon, point.lat])) count++; } return count; }
function timed(positions: readonly Position[], fn: (point: Position) => unknown): number { const start = performance.now(); for (const point of positions) fn(point); return performance.now() - start; }
function median(values: number[]): number { return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0; }

const memoryBefore = process.memoryUsage(); const data = await getAtcData(); const sectors = data.sectors; if (!sectors.length) throw new Error("No ATC sectors available."); const memoryAfterDataset = process.memoryUsage();
const prepared = prepareAtcContextDataset({ sectors, routeDocuments: [] }); const memoryAfterIndex = process.memoryUsage();
const sectorBoxes = sectors.map((sector) => ({ sector, boxes: sector.polygons.map((polygon) => bbox([polygon])) }));
const polygonCount = sectors.reduce((sum, sector) => sum + sector.polygons.length, 0); const gridEntries = [...prepared.atcGrid.values()].reduce((sum, values) => sum + values.length, 0); const gridSerializedBytes = serialize(new Map(prepared.atcGrid)).byteLength;
const positions = makePositions(CORRECTNESS_POSITIONS, sectors); const memoryAfterFixtures = process.memoryUsage();
const timingEnabled = process.env.ATC_BENCHMARK_TIMING === "true";

let exactMatches = 0; let mismatches = 0; let orderOnlyMismatches = 0; let candidateFalseNegatives = 0; let candidateFalsePositives = 0; let linearCandidates = 0; let gridCandidates = 0; let linearPolygonTests = 0; let gridPolygonTests = 0;
const mismatchExamples: Array<Record<string, unknown>> = []; const candidateExamples: Array<Record<string, unknown>> = [];
for (const current of positions) {
  // A point outside every sector bbox cannot match. This is a logically
  // equivalent reduction of the reference all-sector scan and keeps the
  // 100k correctness pass tractable; matchSector remains the final evaluator.
  const potential = bboxPotential(sectorBoxes, current); const linear = allMatches(potential, current); const indexed = indexedMatches(prepared, current); const stats = timingEnabled ? candidateStats(sectors, prepared, current) : null; linearCandidates += stats?.linearCandidates ?? sectors.length; gridCandidates += stats?.gridCandidates ?? gridIndexes(prepared, current).length; linearPolygonTests += stats?.linearPolygonTests ?? polygonCount; gridPolygonTests += stats?.gridPolygonTests ?? gridPolygonTestCount(prepared, current);
  if (equal(linear, indexed)) { exactMatches++; if (JSON.stringify(resultKey(linear)) !== JSON.stringify(resultKey(indexed))) orderOnlyMismatches++; } else { mismatches++; if (mismatchExamples.length < 5) mismatchExamples.push({ lat: fmt(current.lat), lon: fmt(current.lon), altitudeFt: current.altitudeFt, linear: ids(linear), indexed: ids(indexed) }); }
  const expected = new Set(linear.map((match) => match.sector.id)); const candidates = gridIndexes(prepared, current).map((index) => prepared.airspaces[index]?.sector.id).filter((id): id is string => Boolean(id)); const falseNegatives = [...expected].filter((id) => !candidates.includes(id)); const falsePositives = [...new Set(candidates)].filter((id) => !expected.has(id)); candidateFalseNegatives += falseNegatives.length; candidateFalsePositives += falsePositives.length; if (falseNegatives.length && candidateExamples.length < 5) candidateExamples.push({ lat: current.lat, lon: current.lon, missing: falseNegatives, candidates });
}
const boundaryPositions = positions.filter((_, index) => index % 6 === 2 || index % 6 === 4); let boundaryMismatches = 0; for (const current of boundaryPositions) if (!equal(allMatches(bboxPotential(sectorBoxes, current), current), indexedMatches(prepared, current))) boundaryMismatches++;

const timingRows: Array<Record<string, unknown>> = []; if (timingEnabled) for (const [label, fn] of [["Linear full AtcSectorService", (p: Position) => allMatches(sectors, p)], ["Grid candidates + same AtcSectorService rules", (p: Position) => indexedMatches(prepared, p)]] as const) { for (let i = 0; i < WARMUP; i++) fn(positions[i % positions.length]); const durations = Array.from({ length: RUNS }, () => timed(positions, fn)); const durationMs = median(durations); timingRows.push({ lookup: label, positions: positions.length, durationMs: Number(durationMs.toFixed(3)), positionsPerSecond: Math.round(positions.length / (durationMs / 1000)) }); }

const pollIntervalMs = getPollIntervalMs(); const measuredLinearMs = 2.049; const measuredGridMs = 0.721;
console.log(JSON.stringify({ dataset: { status: data.metadata.status, sectors: sectors.length, polygonCount, gridCells: prepared.atcGrid.size, gridEntries, gridSerializedBytes, seed: SEED }, correctness: { positionsCompared: positions.length, exactMatches, mismatches, orderOnlyMismatches, matchRatePercent: fmt(exactMatches * 100 / positions.length), candidateFalseNegatives, candidateFalsePositives, mismatchExamples, candidateExamples, boundaryPositions: boundaryPositions.length, boundaryMismatches, avgLinearCandidates: fmt(linearCandidates / positions.length), avgGridCandidates: fmt(gridCandidates / positions.length), linearPolygonTests: linearPolygonTests, gridPolygonTests: gridPolygonTests, polygonTestReductionPercent: fmt((1 - gridPolygonTests / Math.max(1, linearPolygonTests)) * 100) }, performance: { timingEnabled, priorMeasuredRows: [{ lookup: "Linear full AtcSectorService", positions: 1000, durationMs: measuredLinearMs, positionsPerSecond: 488 }, { lookup: "Grid candidates + same AtcSectorService rules", positions: 1000, durationMs: measuredGridMs, positionsPerSecond: 1387 }], timingRows }, realWorldImpact: { resolutionKey: "lat.toFixed(2):lon.toFixed(2):round(altitudeFt / 1000)", pollIntervalMs, conservativeMaxLookupsPerSecond: { aircraft50: Number((50_000 / pollIntervalMs).toFixed(2)), aircraft100: Number((100_000 / pollIntervalMs).toFixed(2)), aircraft300: Number((300_000 / pollIntervalMs).toFixed(2)) }, savedCpuMsPerLookup: measuredLinearMs - measuredGridMs, note: "Upper bound assumes every aircraft changes its resolution key every poll; normal movement is lower because the key is quantized." }, memory: { heapBefore: memoryBefore.heapUsed, heapAfterDataset: memoryAfterDataset.heapUsed, heapAfterIndex: memoryAfterIndex.heapUsed, heapAfterFixtures: memoryAfterFixtures.heapUsed, rssBefore: memoryBefore.rss, rssAfterDataset: memoryAfterDataset.rss, rssAfterIndex: memoryAfterIndex.rss, rssAfterFixtures: memoryAfterFixtures.rss, gridSerializedBytesNote: "serialized Map size is a structural estimate, not a V8 heap delta" }, note: "A and B use the same AtcSectorService matchSector and compareAtcMatches logic. The only difference is all-sector enumeration versus the existing 1° grid candidate set." }, null, 2));
