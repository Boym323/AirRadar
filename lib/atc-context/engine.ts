import { createHash } from "node:crypto";
import type { AtcSector } from "@/lib/atc/types";
import { loadAtAtsRoutes } from "@/lib/ats/at-routes";
import { loadCzAtsRoutes } from "@/lib/ats/cz-routes";
import { loadSkAtsRoutes } from "@/lib/ats/sk-routes";
import { onAtcDataCacheInvalidated } from "@/lib/server/atc-data";
import { getAtcDataSnapshot } from "@/lib/server/providers";
import { measureRuntime, measureRuntimeAsync } from "@/lib/server/runtime-performance";
import type { Aircraft } from "@/lib/aircraft/types";
import { angleDifference, bbox, bboxAsync, bboxContains, bearing, distanceNm, distanceToSegmentNm } from "./geometry";
import { prewarmFrozenAtcRing } from "./latitude-ring-index";
import { matchAtcRing } from "@/lib/server/atc-native-geometry";
import type { AtcContextDataset, AtcContextInput, AtcContextLookupDiagnostics, AtcContextResult, AtsRouteMatch, ContextAirspace, ContextConfidence, ContextPoint, PreparedAtcContextDataset, PreparedAtcSectorDataset, VerticalMatch } from "./types";

const SUPPORTED = new Set(["CZ", "SK", "AT"]);
const ORDER: Record<string, number> = { TMA: 10, CTR: 15, CTA_SECTOR: 20, CTA: 30, FIR: 40, OTHER: 90 };
const GRID_DEGREES = 1;
type Box = [number, number, number, number];
function cell(value: number): number { return Math.floor(value / GRID_DEGREES); }
function key(lon: number, lat: number): string { return `${cell(lon)}:${cell(lat)}`; }
function addGrid(grid: Map<string, number[]>, box: Box, index: number, expansion = 0): void {
  for (let x = cell(box[0] - expansion); x <= cell(box[2] + expansion); x++) for (let y = cell(box[1] - expansion); y <= cell(box[3] + expansion); y++) {
    const k = `${x}:${y}`; const values = grid.get(k); if (values) values.push(index); else grid.set(k, [index]);
  }
}
function queryGrid(grid: ReadonlyMap<string, ReadonlyArray<number>>, point: [number, number], seen = new Set<number>()): number[] {
  for (const index of grid.get(key(point[0], point[1])) ?? []) seen.add(index);
  return [...seen];
}
function immutableGrid(grid: Map<string, number[]>): ReadonlyMap<string, ReadonlyArray<number>> {
  const map = new Map([...grid].map(([k, v]) => [k, Object.freeze(v.slice())] as const));
  return new Proxy(map, {
    get(target, property) {
      if (property === "set" || property === "delete" || property === "clear") {
        return () => { throw new TypeError("Prepared ATC grids are immutable"); };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set() { throw new TypeError("Prepared ATC grids are immutable"); },
    deleteProperty() { throw new TypeError("Prepared ATC grids are immutable"); },
  }) as unknown as ReadonlyMap<string, ReadonlyArray<number>>;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

type PreparationOptions = { owned?: boolean };
type PreparedAirspace = { sector: AtcSector; boxes: ReadonlyArray<Box>; order: number };

function cloneSectors(sectors: readonly AtcSector[]): AtcSector[] {
  return structuredClone(sectors) as AtcSector[];
}

function freezeSectorIndex(
  sectors: readonly AtcSector[],
  airspaces: PreparedAirspace[],
  atcGrid: Map<string, number[]>,
): PreparedAtcSectorDataset {
  const frozenAirspaces = Object.freeze(airspaces.map((entry) => Object.freeze({
    sector: entry.sector,
    boxes: Object.freeze(entry.boxes.map((box) => Object.freeze(box) as unknown as Box)),
    order: entry.order,
  })));
  return {
    sectors: Object.freeze([...sectors]),
    airspaces: frozenAirspaces,
    atcGrid: immutableGrid(atcGrid),
    builtAt: new Date().toISOString(),
    prepared: true,
  };
}

/** Lightweight assignment-only index. It intentionally excludes ATS routes and points. */
export function prepareAtcSectorDataset(sectors: readonly AtcSector[]): PreparedAtcSectorDataset {
  const ownedSectors = cloneSectors(sectors);
  const airspaces: PreparedAirspace[] = ownedSectors.map((sector) => ({
    sector,
    boxes: sector.polygons.map((polygon) => bbox([polygon as unknown as [number, number][]])),
    order: ORDER[typeOf(sector)] ?? 90,
  }));
  airspaces.sort((a, b) => a.order - b.order || a.sector.id.localeCompare(b.sector.id));
  const atcGrid = new Map<string, number[]>();
  airspaces.forEach((entry, index) => entry.boxes.forEach((box) => addGrid(atcGrid, box, index)));
  deepFreeze(ownedSectors);
  return freezeSectorIndex(ownedSectors, airspaces, atcGrid);
}

async function addGridAsync(grid: Map<string, number[]>, box: Box, index: number, expansion = 0): Promise<void> {
  let started = performance.now();
  for (let x = cell(box[0] - expansion); x <= cell(box[2] + expansion); x++) {
    for (let y = cell(box[1] - expansion); y <= cell(box[3] + expansion); y++) {
      const k = `${x}:${y}`;
      const values = grid.get(k);
      if (values) values.push(index); else grid.set(k, [index]);
      if (performance.now() - started >= 6) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        started = performance.now();
      }
    }
  }
}

/**
 * Async assignment preparation. `owned: true` is reserved for provider
 * snapshots whose runtime ownership is immutable; the generic path retains a
 * defensive clone for custom providers.
 */
export async function prepareAtcSectorDatasetAsync(
  sectors: readonly AtcSector[],
  options: PreparationOptions = {},
): Promise<PreparedAtcSectorDataset> {
  const ownedSectors = options.owned
    ? sectors
    : measureRuntime("atc.dataset.structured-clone", sectors.length, () => cloneSectors(sectors));
  const airspaces: PreparedAirspace[] = [];
  let lastYield = performance.now();
  let sectorIndex = 0;
  for (const sector of ownedSectors) {
    const boxes: Box[] = [];
    for (const polygon of sector.polygons) boxes.push(await bboxAsync([polygon as unknown as [number, number][]]));
    airspaces.push({ sector, boxes, order: ORDER[typeOf(sector)] ?? 90 });
    sectorIndex += 1;
    if ((sectorIndex & 63) === 0 || performance.now() - lastYield >= 6) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      lastYield = performance.now();
    }
  }
  airspaces.sort((a, b) => a.order - b.order || a.sector.id.localeCompare(b.sector.id));
  const atcGrid = new Map<string, number[]>();
  await measureRuntimeAsync("atc.dataset.grid", sectors.length, async () => {
    for (let index = 0; index < airspaces.length; index += 1) {
      for (const box of airspaces[index].boxes) await addGridAsync(atcGrid, box, index);
    }
  });
  if (!options.owned) deepFreeze(ownedSectors);
  // CPU-heavy ring scanning now indexes latitude bands outside the live event
  // loop. Only deeply frozen rings qualify; mutable custom providers fall back.
  for (const sector of ownedSectors) {
    for (const ring of sector.polygons) await prewarmFrozenAtcRing(ring as [number, number][]);
  }
  return measureRuntime("atc.dataset.deep-freeze", sectors.length, () => freezeSectorIndex(ownedSectors, airspaces, atcGrid));
}

export function getAtcSectorCandidatesFromIndex(dataset: PreparedAtcSectorDataset, longitude: number, latitude: number): AtcSector[] {
  const candidates: AtcSector[] = [];
  const seen = new Set<string>();
  for (const index of queryGrid(dataset.atcGrid, [longitude, latitude])) {
    const sector = dataset.airspaces[index]?.sector;
    if (!sector || seen.has(sector.id)) continue;
    seen.add(sector.id);
    candidates.push(sector);
  }
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

export function prepareAtcContextDataset(dataset: AtcContextDataset): PreparedAtcContextDataset {
  // Do not freeze caller-owned input: providers may reuse and refresh their source objects.
  const ownedDataset = measureRuntime("atc.dataset.structured-clone", dataset.sectors.length, () => structuredClone(dataset));
  const airspaces = ownedDataset.sectors.map((sector) => ({ sector, boxes: sector.polygons.map((polygon) => bbox([polygon as unknown as [number, number][]])), order: ORDER[typeOf(sector)] ?? 90 }));
  airspaces.sort((a, b) => a.order - b.order || a.sector.id.localeCompare(b.sector.id));
  const segments = ownedDataset.routeDocuments.flatMap((doc) => doc.routes.flatMap((route) => route.segments.map((segment) => ({ routeId: route.designator, countryCode: doc.source.countryCode ?? null, sourceReference: doc.source.reference, segment, box: bbox([[segment.from, segment.to]]), forwardBearing: bearing(segment.from, segment.to), reverseBearing: bearing(segment.to, segment.from) }))));
  const points = ownedDataset.routeDocuments.flatMap((doc) => doc.routes.flatMap((route) => route.points.map((point) => ({ point, sourceReference: doc.source.reference, box: [point.longitude, point.latitude, point.longitude, point.latitude] as Box }))));
  const atcGrid = new Map<string, number[]>(); const atsGrid = new Map<string, number[]>(); const pointGrid = new Map<string, number[]>();
  airspaces.forEach((entry, i) => entry.boxes.forEach((box) => addGrid(atcGrid, box, i)));
  segments.forEach((entry, i) => addGrid(atsGrid, entry.box, i, 0.3)); points.forEach((entry, i) => addGrid(pointGrid, entry.box, i, 5));
  return measureRuntime("atc.dataset.deep-freeze", ownedDataset.sectors.length, () => deepFreeze({ ...ownedDataset, prepared: true as const, airspaces: Object.freeze(airspaces), segments: Object.freeze(segments), points: Object.freeze(points), atcGrid: immutableGrid(atcGrid), atsGrid: immutableGrid(atsGrid), pointGrid: immutableGrid(pointGrid), builtAt: new Date().toISOString() }));
}

/** Event-loop-safe context preparation used by the live prediction lane. */
export async function prepareAtcContextDatasetAsync(
  dataset: AtcContextDataset,
  options: PreparationOptions = {},
): Promise<PreparedAtcContextDataset> {
  const ownedDataset = options.owned
    ? dataset
    : measureRuntime("atc.dataset.structured-clone", dataset.sectors.length, () => structuredClone(dataset));
  const airspaces: PreparedAirspace[] = [];
  let lastYield = performance.now();
  await measureRuntimeAsync("atc.dataset.bbox", ownedDataset.sectors.length, async () => {
    for (const sector of ownedDataset.sectors) {
      const boxes: Box[] = [];
      for (const polygon of sector.polygons) boxes.push(await bboxAsync([polygon as unknown as [number, number][]]));
      airspaces.push({ sector, boxes, order: ORDER[typeOf(sector)] ?? 90 });
      if ((airspaces.length & 63) === 0 || performance.now() - lastYield >= 6) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        lastYield = performance.now();
      }
    }
  });
  airspaces.sort((a, b) => a.order - b.order || a.sector.id.localeCompare(b.sector.id));

  const segments: Array<PreparedAtcContextDataset["segments"][number]> = [];
  const points: Array<PreparedAtcContextDataset["points"][number]> = [];
  for (const doc of ownedDataset.routeDocuments) {
    for (const route of doc.routes) {
      for (const segment of route.segments) {
        segments.push({
          routeId: route.designator,
          countryCode: doc.source.countryCode ?? null,
          sourceReference: doc.source.reference,
          segment,
          box: await bboxAsync([[segment.from, segment.to]]),
          forwardBearing: bearing(segment.from, segment.to),
          reverseBearing: bearing(segment.to, segment.from),
        });
        if (performance.now() - lastYield >= 6) {
          await new Promise<void>((resolve) => setImmediate(resolve));
          lastYield = performance.now();
        }
      }
      for (const point of route.points) {
        points.push({ point, sourceReference: doc.source.reference, box: [point.longitude, point.latitude, point.longitude, point.latitude] });
        if (performance.now() - lastYield >= 6) {
          await new Promise<void>((resolve) => setImmediate(resolve));
          lastYield = performance.now();
        }
      }
    }
  }
  const atcGrid = new Map<string, number[]>();
  const atsGrid = new Map<string, number[]>();
  const pointGrid = new Map<string, number[]>();
  await measureRuntimeAsync("atc.dataset.grid", ownedDataset.sectors.length, async () => {
    for (let index = 0; index < airspaces.length; index += 1) {
      for (const box of airspaces[index].boxes) await addGridAsync(atcGrid, box, index);
    }
    for (let index = 0; index < segments.length; index += 1) await addGridAsync(atsGrid, segments[index].box, index, 0.3);
    for (let index = 0; index < points.length; index += 1) await addGridAsync(pointGrid, points[index].box, index, 5);
  });

  if (!options.owned) deepFreeze(ownedDataset);
  for (const sector of ownedDataset.sectors) {
    for (const ring of sector.polygons) await prewarmFrozenAtcRing(ring as [number, number][]);
  }
  return measureRuntime("atc.dataset.deep-freeze", ownedDataset.sectors.length, () => ({
    ...ownedDataset,
    prepared: true as const,
    airspaces: Object.freeze(airspaces.map((entry) => Object.freeze({
      sector: entry.sector,
      boxes: Object.freeze(entry.boxes.map((box) => Object.freeze(box) as unknown as Box)),
      order: entry.order,
    }))),
    segments: Object.freeze(segments),
    points: Object.freeze(points),
    atcGrid: immutableGrid(atcGrid),
    atsGrid: immutableGrid(atsGrid),
    pointGrid: immutableGrid(pointGrid),
    builtAt: new Date().toISOString(),
  }));
}

/** Returns only the sectors whose polygon bboxes cover the position. */
export function getAtcSectorCandidates(dataset: PreparedAtcContextDataset, longitude: number, latitude: number): AtcSector[] {
  const candidates: AtcSector[] = [];
  const seen = new Set<string>();
  for (const index of queryGrid(dataset.atcGrid, [longitude, latitude])) {
    const sector = dataset.airspaces[index]?.sector;
    if (!sector || seen.has(sector.id)) continue;
    seen.add(sector.id);
    candidates.push(sector);
  }
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

function validPosition(lat: number, lon: number): boolean { return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0); }
function typeOf(sector: AtcSector): string { const raw = sector.airspaceType?.trim().toUpperCase() || (/\bFIR\b/i.test(sector.name) ? "FIR" : "OTHER"); return raw; }
function ref(value: string | null | undefined): string { return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? ""; }
function altitudeFor(input: AtcContextInput, reference: string): { value: number | null; certain: boolean } {
  if (reference.includes("AGL")) return { value: input.geomAltitude ?? input.altitude, certain: false };
  if (reference.includes("FL") || reference.includes("PRESSURE")) return { value: input.baroAltitude ?? (input.altitudeSource === "baro" ? input.altitude : null), certain: input.baroAltitude !== null && input.baroAltitude !== undefined };
  return { value: input.geomAltitude ?? input.altitude, certain: input.geomAltitude !== null && input.geomAltitude !== undefined };
}
function verticalMatch(sector: AtcSector, input: AtcContextInput): { match: VerticalMatch; source: "baro" | "geom" | "none" } {
  const lowerRef = ref(sector.lowerAltitudeReference); const upperRef = ref(sector.upperAltitudeReference);
  const lower = altitudeFor(input, lowerRef); const upper = altitudeFor(input, upperRef);
  if (lower.value === null && upper.value === null) return { match: "uncertain", source: "none" };
  const lowerInside = sector.lowerAltitudeFt === null || lower.value === null || lower.value >= sector.lowerAltitudeFt;
  const upperInside = sector.upperAltitudeFt === null || upper.value === null || upper.value <= sector.upperAltitudeFt;
  const fullyComparable = (sector.lowerAltitudeFt === null || lower.certain) && (sector.upperAltitudeFt === null || upper.certain);
  if (!lowerInside || !upperInside) return { match: fullyComparable ? "false" : "uncertain", source: lowerRef.includes("FL") || upperRef.includes("FL") ? "baro" : "geom" };
  return { match: fullyComparable ? "true" : "uncertain", source: lowerRef.includes("FL") || upperRef.includes("FL") ? "baro" : "geom" };
}
function horizontalMatch(entry: PreparedAirspace, point: [number, number]): "inside" | "boundary" | null {
  let result: "inside" | "boundary" | null = null;
  for (let polygonIndex = 0; polygonIndex < entry.boxes.length; polygonIndex += 1) {
    const polygon = entry.sector.polygons[polygonIndex];
    const box = entry.boxes[polygonIndex];
    if (!polygon || !box || !bboxContains(box, point)) continue;
    const containment = matchAtcRing(point, polygon as [number, number][]);
    if (containment === "boundary") return "boundary";
    if (containment === "inside") result = "inside";
  }
  return result;
}
function airspace(sector: AtcSector, horizontal: "inside" | "boundary", vertical: VerticalMatch): ContextAirspace {
  const type = typeOf(sector); const confidence: ContextConfidence = vertical === "true" ? horizontal === "inside" ? "high" : "medium" : "partial";
  return { id: sector.id, name: sector.name, countryCode: sector.country, airspaceType: type, airspaceClass: sector.airspaceClass ?? null, verticalMatch: vertical, horizontalMatch: horizontal, confidence, lowerLimitFt: sector.lowerAltitudeFt, upperLimitFt: sector.upperAltitudeFt, lowerLimitReference: sector.lowerAltitudeReference ?? null, upperLimitReference: sector.upperAltitudeReference ?? null, publishedUnit: sector.atcCallsign ?? sector.service ?? null, publishedFrequenciesMhz: sector.frequencies.map((f) => f.frequencyMhz), remarks: sector.remarks ?? null, provenance: { source: sector.source, sourceReference: sector.sourceReference, effectiveDate: sector.validFrom, lastVerifiedAt: sector.lastVerifiedAt } };
}
function routeMatch(routeId: string, countryCode: string | null, sourceReference: string, segment: { id: string; fromName: string; toName: string; from: [number, number]; to: [number, number] }, point: [number, number], track: number | null): AtsRouteMatch {
  const distance = distanceToSegmentNm(point, segment.from, segment.to); const alignment = track === null ? null : Math.min(angleDifference(track, bearing(segment.from, segment.to)), angleDifference(track, bearing(segment.to, segment.from)));
  const confidence: AtsRouteMatch["confidence"] = distance <= 3 && (alignment === null || alignment <= 15) ? "high" : distance <= 6 && (alignment === null || alignment <= 30) ? "medium" : "low";
  return { routeId, segmentId: segment.id, from: segment.fromName, to: segment.toName, distanceNm: Number(distance.toFixed(2)), alignmentDifferenceDeg: alignment === null ? null : Number(alignment.toFixed(1)), confidence, countryCode, sourceReference };
}

/**
 * Current-sector membership only: the full ATC context would additionally
 * compute routes, nearest ATS points and projected/ahead sectors. This path
 * intentionally shares the full-context polygon and vertical predicates.
 */
export function getCurrentAtcSectorIds(
  input: AtcContextInput,
  prepared: PreparedAtcContextDataset,
): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!validPosition(input.lat, input.lon)) return ids;
  const point: [number, number] = [input.lon, input.lat];
  for (const index of queryGrid(prepared.atcGrid, point)) {
    const entry = prepared.airspaces[index];
    if (!entry) continue;
    const sector = entry.sector;
    const horizontal = entry.boxes.some((box, polygonIndex) => {
      const polygon = sector.polygons[polygonIndex];
      return Boolean(polygon) && bboxContains(box, point)
        && matchAtcRing(point, polygon as [number, number][]) !== null;
    });
    if (horizontal && verticalMatch(sector, input).match !== "false") ids.add(sector.id);
  }
  return ids;
}

export function computeAtcContext(input: AtcContextInput, dataset: AtcContextDataset | PreparedAtcContextDataset, now = new Date(), diagnostics?: AtcContextLookupDiagnostics): AtcContextResult {
  const prepared = "prepared" in dataset && dataset.prepared ? dataset : prepareAtcContextDataset(dataset);
  const computedAt = now.toISOString();
  if (!validPosition(input.lat, input.lon)) return { status: "invalid", position: { lat: input.lat, lon: input.lon, altitude: input.altitude, altitudeSource: input.altitudeSource ?? "none" }, supportedCountry: false, fir: null, currentAirspaces: [], primaryAirspace: null, atsRoute: null, nearestAtsCandidate: null, nearestPoint: null, nextPoint: null, ahead: null, nextSector: null, limitation: "Invalid aircraft position", computedAt, dataset: { atcVersion: "none", atsVersion: "none", atcCount: dataset.sectors.length, atsSegmentCount: 0 } };
  const point: [number, number] = [input.lon, input.lat];
  const matches: ContextAirspace[] = [];
  for (const index of queryGrid(prepared.atcGrid, point)) {
    const entry = prepared.airspaces[index]; if (!entry) continue;
    const sector = entry.sector;
    if (diagnostics) diagnostics.atcBboxCandidates += entry.boxes.length;
    const h = horizontalMatch(entry, point);
    if (diagnostics) diagnostics.atcExactPolygonTests += entry.boxes.filter((box) => bboxContains(box, point)).length;
    if (h === null) continue;
    const vertical = verticalMatch(sector, input).match;
    if (vertical !== "false") matches.push(airspace(sector, h, vertical));
  }
  matches.sort((a, b) => (ORDER[a.airspaceType] ?? 90) - (ORDER[b.airspaceType] ?? 90) || a.id.localeCompare(b.id));
  const fir = matches.find((m) => m.airspaceType === "FIR") ?? null;
  const docs = prepared.routeDocuments;
  const segments = prepared.segments;
  // Routes are static too; avoid geodesic work for segments clearly outside
  // the local lookup window. The 0.3° envelope is a prefilter only, not a
  // confidence threshold, and deliberately keeps crossing/parallel cases.
  const routeCandidates = queryGrid(prepared.atsGrid, point).map((index) => segments[index]).filter((item): item is typeof segments[number] => Boolean(item) && point[0] >= item.box[0] - 0.3 && point[0] <= item.box[2] + 0.3 && point[1] >= item.box[1] - 0.3 && point[1] <= item.box[3] + 0.3);
  let nearestAtsCandidate: AtsRouteMatch | null = null;
  for (const item of routeCandidates) {
    if (diagnostics) {
      diagnostics.atsBboxCandidates += 1;
      diagnostics.atsGeodesicCalculations += 1;
    }
    const candidate = routeMatch(item.routeId, item.countryCode, item.sourceReference, item.segment, point, input.track);
    if (!nearestAtsCandidate || candidate.distanceNm < nearestAtsCandidate.distanceNm) nearestAtsCandidate = candidate;
  }
  const atsRoute = input.onGround ? null : nearestAtsCandidate?.confidence === "low" ? null : nearestAtsCandidate;
  const pointCandidates = queryGrid(prepared.pointGrid, point);
  if (diagnostics) diagnostics.pointBboxCandidates += pointCandidates.length;
  let nearestRaw: typeof prepared.points[number] | undefined; let nearestDistance = Number.POSITIVE_INFINITY;
  for (const index of pointCandidates) {
    const candidate = prepared.points[index];
    if (!candidate) continue;
    if (diagnostics) diagnostics.pointDistanceCalculations += 1;
    const distance = distanceNm(point, [candidate.point.longitude, candidate.point.latitude]);
    if (distance < nearestDistance) { nearestDistance = distance; nearestRaw = candidate; }
  }
  const nearestPoint: ContextPoint | null = nearestRaw ? { identifier: nearestRaw.point.name, distanceNm: Number(distanceNm(point, [nearestRaw.point.longitude, nearestRaw.point.latitude]).toFixed(1)), bearing: Number(bearing(point, [nearestRaw.point.longitude, nearestRaw.point.latitude]).toFixed(1)), kind: nearestRaw.point.kind } : null;
  let nextPoint: ContextPoint | null = null;
  if (atsRoute) { const item = segments.find((s) => s.segment.id === atsRoute.segmentId && s.routeId === atsRoute.routeId); if (item) { const forward = input.track !== null && angleDifference(input.track, item.forwardBearing) <= angleDifference(input.track, item.reverseBearing); const destinationPoint = forward ? item.segment.to : item.segment.from; nextPoint = { identifier: forward ? item.segment.toName : item.segment.fromName, distanceNm: Number(distanceNm(point, destinationPoint).toFixed(1)), bearing: Number(bearing(point, destinationPoint).toFixed(1)), kind: "DESIGNATED_POINT" }; } }
  // T05 is retired: no future-sector or handoff prediction.
  // Preserve fields as null for compatible readers; R17 uses observed sectors.
  const ahead: AtcContextResult["ahead"] = null;
  const nextSector: AtcContextResult["nextSector"] = null;
  return { status: "available", position: { lat: input.lat, lon: input.lon, altitude: input.altitude, altitudeSource: input.altitudeSource ?? "none" }, supportedCountry: fir?.countryCode ? SUPPORTED.has(fir.countryCode) : matches.some((m) => m.countryCode !== null && SUPPORTED.has(m.countryCode!)), fir, currentAirspaces: matches, primaryAirspace: matches[0] ?? null, atsRoute, nearestAtsCandidate, nearestPoint, nextPoint, ahead, nextSector, limitation: input.onGround ? "Ground aircraft: en-route ATS route prediction skipped" : ahead ? "Ahead on current track only; no turn or flight-plan prediction" : null, computedAt, dataset: { atcVersion: prepared.sectors.map((s) => s.lastVerifiedAt).sort().at(-1) ?? "none", atsVersion: docs.map((d) => d.source.effectiveDate).sort().at(-1) ?? "none", atcCount: prepared.sectors.length, atsSegmentCount: segments.length } };
}

export function inputFromAircraft(aircraft: Pick<Aircraft, "lat" | "lon" | "altitude" | "baroAltitude" | "geomAltitude" | "groundSpeed" | "track" | "verticalRate" | "lastSeen" | "onGround">): AtcContextInput | null {
  if (aircraft.lat === null || aircraft.lon === null) return null;
  return { lat: aircraft.lat, lon: aircraft.lon, altitude: aircraft.altitude, baroAltitude: aircraft.baroAltitude, geomAltitude: aircraft.geomAltitude, altitudeSource: aircraft.baroAltitude !== null ? "baro" : aircraft.geomAltitude !== null ? "geom" : "none", track: aircraft.track, groundSpeed: aircraft.groundSpeed, verticalRate: aircraft.verticalRate, timestamp: aircraft.lastSeen, onGround: aircraft.onGround };
}

export async function loadAtcContextDataset(): Promise<PreparedAtcContextDataset | null> {
  while (true) {
    if (cachedDataset && Date.now() - cachedDatasetAt < 30_000) return cachedDataset;
    const generation = contextDatasetGeneration;
    if (!loadingDataset) {
      loadingDataset = rebuildAtcContextDataset(generation);
    }
    const flight = loadingDataset;
    try {
      const result = await flight;
      if (generation === contextDatasetGeneration) return result;
    } finally {
      if (loadingDataset === flight) loadingDataset = null;
    }
  }
}

let loadingDataset: Promise<PreparedAtcContextDataset | null> | null = null;
let contextDatasetGeneration = 0;

export function invalidateAtcContextDatasetCache(): void {
  contextDatasetGeneration += 1;
  cachedDataset = null;
  cachedDatasetAt = 0;
  cachedDatasetIdentity = null;
}

// A local import calls both invalidation APIs, while an import in another
// process is observed when the provider re-checks AtcDatasetVersion. Keep the
// context cache behind the same bounded freshness boundary in both cases.
onAtcDataCacheInvalidated(() => invalidateAtcContextDatasetCache());

async function rebuildAtcContextDataset(generation: number): Promise<PreparedAtcContextDataset | null> {
  const atc = await getAtcDataSnapshot();
  if (generation !== contextDatasetGeneration) return null;
  const routeDocuments = [loadCzAtsRoutes(), loadSkAtsRoutes(), loadAtAtsRoutes()].filter((doc): doc is NonNullable<typeof doc> => doc !== null);
  if (generation !== contextDatasetGeneration) return null;
  if (!atc && !routeDocuments.length) return null;
  const identity = await atcContextDatasetIdentityAsync(atc?.sectors ?? [], routeDocuments);
  if (generation !== contextDatasetGeneration) return null;
  // getAtcDataSnapshot() deliberately revalidates the source on its own bounded TTL.
  // Reuse the expensive owned clone, bboxes and grids when that source version
  // is unchanged; the 30s freshness check remains the invalidation boundary.
  if (cachedDataset && cachedDatasetIdentity === identity) {
    cachedDatasetAt = Date.now();
    return cachedDataset;
  }
  if (generation !== contextDatasetGeneration) return null;
  const preparedDataset = await prepareAtcContextDatasetAsync({ sectors: [...(atc?.sectors ?? [])], routeDocuments }, { owned: true });
  if (generation !== contextDatasetGeneration) return null;
  // Publish the complete tuple together. No observer can see a dataset whose
  // identity or timestamp belongs to a different generation.
  cachedDataset = preparedDataset;
  cachedDatasetIdentity = identity;
  cachedDatasetAt = Date.now();
  return preparedDataset;
}

export function atcContextDatasetIdentity(
  sectors: readonly AtcSector[],
  routeDocuments: readonly AtcContextDataset["routeDocuments"][number][],
): string {
  return identityDigest({ sectors, routes: routeDocuments });
}

function* identityTokens(value: unknown): Generator<string> {
  if (value === null) { yield "null;"; return; }
  if (value === undefined) { yield "undefined;"; return; }
  if (typeof value === "string") { yield `string:${value.length}:${value};`; return; }
  if (typeof value === "number") { yield `number:${value};`; return; }
  if (typeof value === "boolean") { yield `boolean:${value ? 1 : 0};`; return; }
  if (Array.isArray(value)) {
    yield `array:${value.length};`;
    for (const item of value) yield* identityTokens(item);
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    yield `object:${keys.length};`;
    for (const key of keys) {
      yield `key:${key.length}:${key};`;
      yield* identityTokens(record[key]);
    }
    return;
  }
  yield `${typeof value}:${String(value)};`;
}

function identityDigest(value: unknown): string {
  const hash = createHash("sha256");
  hash.update("airradar-atc-identity-v2;");
  if (isIdentityDataset(value)) {
    for (let index = 0; index < value.sectors.length; index += 1) {
      const { polygons, ...metadata } = value.sectors[index];
      hash.update(`sector:${index}:${JSON.stringify(metadata)};`);
      for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex += 1) updatePolygonHash(hash, polygonIndex, polygons[polygonIndex]);
    }
    for (let index = 0; index < value.routes.length; index += 1) hash.update(`route:${index}:${JSON.stringify(value.routes[index])};`);
  } else {
    for (const token of identityTokens(value)) hash.update(token);
  }
  return hash.digest("hex");
}

function updatePolygonHash(hash: ReturnType<typeof createHash>, polygonIndex: number, polygon: ReadonlyArray<readonly [number, number]>): void {
  let chunk = `polygon:${polygonIndex}:`;
  for (let pointIndex = 0; pointIndex < polygon.length; pointIndex += 1) {
    const point = polygon[pointIndex];
    chunk += `${point[0]},${point[1]};`;
    if ((pointIndex + 1) % 256 === 0) {
      hash.update(chunk);
      chunk = "";
    }
  }
  hash.update(`${chunk};`);
}

function isIdentityDataset(value: unknown): value is { sectors: readonly AtcSector[]; routes: readonly AtcContextDataset["routeDocuments"][number][] } {
  return Boolean(value && typeof value === "object" && "sectors" in value && "routes" in value);
}

export async function atcContextDatasetIdentityAsync(
  sectors: readonly AtcSector[],
  routeDocuments: readonly AtcContextDataset["routeDocuments"][number][],
): Promise<string> {
  const hash = createHash("sha256");
  hash.update("airradar-atc-identity-v2;");
  let lastYield = performance.now();
  for (let index = 0; index < sectors.length; index += 1) {
    const { polygons, ...metadata } = sectors[index];
    hash.update(`sector:${index}:${JSON.stringify(metadata)};`);
    for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex += 1) {
      const polygon = polygons[polygonIndex];
      let chunk = `polygon:${polygonIndex}:`;
      for (let pointIndex = 0; pointIndex < polygon.length; pointIndex += 1) {
        const point = polygon[pointIndex];
        chunk += `${point[0]},${point[1]};`;
        if ((pointIndex + 1) % 256 === 0) {
          hash.update(chunk);
          chunk = "";
          if (performance.now() - lastYield >= 4) {
            await new Promise<void>((resolve) => setImmediate(resolve));
            lastYield = performance.now();
          }
        }
      }
      hash.update(`${chunk};`);
    }
  }
  for (let index = 0; index < routeDocuments.length; index += 1) {
    const serializedRoute = measureRuntime("atc.dataset.identity.route-serialization", 0, () => JSON.stringify(routeDocuments[index]));
    hash.update(`route:${index}:${serializedRoute};`);
    if (performance.now() - lastYield >= 6) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      lastYield = performance.now();
    }
  }
  return hash.digest("hex");
}

let cachedDataset: PreparedAtcContextDataset | null = null;
let cachedDatasetAt = 0;
let cachedDatasetIdentity: string | null = null;
