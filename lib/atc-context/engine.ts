import type { AtcSector } from "@/lib/atc/types";
import { loadAtAtsRoutes } from "@/lib/ats/at-routes";
import { loadCzAtsRoutes } from "@/lib/ats/cz-routes";
import { loadSkAtsRoutes } from "@/lib/ats/sk-routes";
import { getAtcData } from "@/lib/server/providers";
import type { Aircraft } from "@/lib/aircraft/types";
import { angleDifference, bbox, bboxContains, bearing, destination, distanceNm, distanceToSegmentNm, pointInPolygon } from "./geometry";
import type { AtcContextDataset, AtcContextInput, AtcContextLookupDiagnostics, AtcContextResult, AtsRouteMatch, ContextAirspace, ContextConfidence, ContextPoint, PreparedAtcContextDataset, VerticalMatch } from "./types";

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
function immutableGrid(grid: Map<string, number[]>): ReadonlyMap<string, ReadonlyArray<number>> { return new Map([...grid].map(([k, v]) => [k, Object.freeze(v.slice())] as const)); }
export function prepareAtcContextDataset(dataset: AtcContextDataset): PreparedAtcContextDataset {
  const airspaces = dataset.sectors.map((sector) => ({ sector, boxes: sector.polygons.map((polygon) => bbox([polygon as unknown as [number, number][]])), order: ORDER[typeOf(sector)] ?? 90 }));
  airspaces.sort((a, b) => a.order - b.order || a.sector.id.localeCompare(b.sector.id));
  const segments = dataset.routeDocuments.flatMap((doc) => doc.routes.flatMap((route) => route.segments.map((segment) => ({ routeId: route.designator, countryCode: doc.source.countryCode ?? null, sourceReference: doc.source.reference, segment, box: bbox([[segment.from, segment.to]]), forwardBearing: bearing(segment.from, segment.to), reverseBearing: bearing(segment.to, segment.from) }))));
  const points = dataset.routeDocuments.flatMap((doc) => doc.routes.flatMap((route) => route.points.map((point) => ({ point, sourceReference: doc.source.reference, box: [point.longitude, point.latitude, point.longitude, point.latitude] as Box }))));
  const atcGrid = new Map<string, number[]>(); const atsGrid = new Map<string, number[]>(); const pointGrid = new Map<string, number[]>();
  airspaces.forEach((entry, i) => entry.boxes.forEach((box) => addGrid(atcGrid, box, i)));
  segments.forEach((entry, i) => addGrid(atsGrid, entry.box, i, 0.3)); points.forEach((entry, i) => addGrid(pointGrid, entry.box, i, 5));
  return Object.freeze({ ...dataset, prepared: true as const, airspaces: Object.freeze(airspaces), segments: Object.freeze(segments), points: Object.freeze(points), atcGrid: immutableGrid(atcGrid), atsGrid: immutableGrid(atsGrid), pointGrid: immutableGrid(pointGrid), builtAt: new Date().toISOString() });
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
function airspace(sector: AtcSector, horizontal: "inside" | "boundary", vertical: VerticalMatch): ContextAirspace {
  const type = typeOf(sector); const confidence: ContextConfidence = vertical === "true" ? horizontal === "inside" ? "high" : "medium" : "partial";
  return { id: sector.id, name: sector.name, countryCode: sector.country, airspaceType: type, airspaceClass: sector.airspaceClass ?? null, verticalMatch: vertical, horizontalMatch: horizontal, confidence, lowerLimitFt: sector.lowerAltitudeFt, upperLimitFt: sector.upperAltitudeFt, lowerLimitReference: sector.lowerAltitudeReference ?? null, upperLimitReference: sector.upperAltitudeReference ?? null, publishedUnit: sector.atcCallsign ?? sector.service ?? null, publishedFrequenciesMhz: sector.frequencies.map((f) => f.frequencyMhz), remarks: sector.remarks ?? null, provenance: { source: sector.source, sourceReference: sector.sourceReference, effectiveDate: sector.validFrom, lastVerifiedAt: sector.lastVerifiedAt } };
}
function routeMatch(routeId: string, countryCode: string | null, sourceReference: string, segment: { id: string; fromName: string; toName: string; from: [number, number]; to: [number, number] }, point: [number, number], track: number | null): AtsRouteMatch {
  const distance = distanceToSegmentNm(point, segment.from, segment.to); const alignment = track === null ? null : Math.min(angleDifference(track, bearing(segment.from, segment.to)), angleDifference(track, bearing(segment.to, segment.from)));
  const confidence: AtsRouteMatch["confidence"] = distance <= 3 && (alignment === null || alignment <= 15) ? "high" : distance <= 6 && (alignment === null || alignment <= 30) ? "medium" : "low";
  return { routeId, segmentId: segment.id, from: segment.fromName, to: segment.toName, distanceNm: Number(distance.toFixed(2)), alignmentDifferenceDeg: alignment === null ? null : Number(alignment.toFixed(1)), confidence, countryCode, sourceReference };
}

export function computeAtcContext(input: AtcContextInput, dataset: AtcContextDataset | PreparedAtcContextDataset, now = new Date(), diagnostics?: AtcContextLookupDiagnostics): AtcContextResult {
  const prepared = "prepared" in dataset && dataset.prepared ? dataset : prepareAtcContextDataset(dataset);
  const computedAt = now.toISOString();
  if (!validPosition(input.lat, input.lon)) return { status: "invalid", position: { lat: input.lat, lon: input.lon, altitude: input.altitude, altitudeSource: input.altitudeSource ?? "none" }, supportedCountry: false, fir: null, currentAirspaces: [], primaryAirspace: null, atsRoute: null, nearestAtsCandidate: null, nearestPoint: null, nextPoint: null, ahead: null, limitation: "Invalid aircraft position", computedAt, dataset: { atcVersion: "none", atsVersion: "none", atcCount: dataset.sectors.length, atsSegmentCount: 0 } };
  const point: [number, number] = [input.lon, input.lat];
  const matches: ContextAirspace[] = [];
  for (const index of queryGrid(prepared.atcGrid, point)) {
    const entry = prepared.airspaces[index]; if (!entry) continue;
    const sector = entry.sector;
    const horizontal = entry.boxes.some((box, polygonIndex) => {
      diagnostics && (diagnostics.atcBboxCandidates += 1);
      const polygon = sector.polygons[polygonIndex];
      if (!polygon || !bboxContains(box, point)) return false;
      diagnostics && (diagnostics.atcExactPolygonTests += 1);
      const rings = polygon as unknown as [number, number][];
      return pointInPolygon(point, [rings]) !== null;
    });
    if (!horizontal) continue;
    const h = sector.polygons.some((polygon) => pointInPolygon(point, [polygon as unknown as [number, number][]]) === "boundary") ? "boundary" : "inside";
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
  for (const item of routeCandidates) { diagnostics && (diagnostics.atsBboxCandidates += 1); diagnostics && (diagnostics.atsGeodesicCalculations += 1); const candidate = routeMatch(item.routeId, item.countryCode, item.sourceReference, item.segment, point, input.track); if (!nearestAtsCandidate || candidate.distanceNm < nearestAtsCandidate.distanceNm) nearestAtsCandidate = candidate; }
  const atsRoute = input.onGround ? null : nearestAtsCandidate?.confidence === "low" ? null : nearestAtsCandidate;
  const pointCandidates = queryGrid(prepared.pointGrid, point); for (const _ of pointCandidates) diagnostics && (diagnostics.pointBboxCandidates += 1);
  let nearestRaw: typeof prepared.points[number] | undefined; let nearestDistance = Number.POSITIVE_INFINITY;
  for (const index of pointCandidates) { const candidate = prepared.points[index]; if (!candidate) continue; diagnostics && (diagnostics.pointDistanceCalculations += 1); const distance = distanceNm(point, [candidate.point.longitude, candidate.point.latitude]); if (distance < nearestDistance) { nearestDistance = distance; nearestRaw = candidate; } }
  const nearestPoint: ContextPoint | null = nearestRaw ? { identifier: nearestRaw.point.name, distanceNm: Number(distanceNm(point, [nearestRaw.point.longitude, nearestRaw.point.latitude]).toFixed(1)), bearing: Number(bearing(point, [nearestRaw.point.longitude, nearestRaw.point.latitude]).toFixed(1)), kind: nearestRaw.point.kind } : null;
  let nextPoint: ContextPoint | null = null;
  if (atsRoute) { const item = segments.find((s) => s.segment.id === atsRoute.segmentId && s.routeId === atsRoute.routeId); if (item) { const forward = input.track !== null && angleDifference(input.track, item.forwardBearing) <= angleDifference(input.track, item.reverseBearing); const destinationPoint = forward ? item.segment.to : item.segment.from; nextPoint = { identifier: forward ? item.segment.toName : item.segment.fromName, distanceNm: Number(distanceNm(point, destinationPoint).toFixed(1)), bearing: Number(bearing(point, destinationPoint).toFixed(1)), kind: "DESIGNATED_POINT" }; } }
  let ahead: AtcContextResult["ahead"] = null;
  const currentIds = new Set(matches.map((m) => m.id));
  if (!input.onGround && input.track !== null && input.groundSpeed !== null && input.groundSpeed > 20) {
    for (let nm = 2; nm <= 45; nm += 2) { diagnostics && (diagnostics.aheadProjectedSteps += 1); const projected = destination(point, nm, input.track); const candidate = queryGrid(prepared.atcGrid, projected).map((index) => prepared.airspaces[index]?.sector).find((sector) => sector && !currentIds.has(sector.id) && sector.polygons.some((p) => pointInPolygon(projected, [p as unknown as [number, number][]]) !== null) && verticalMatch(sector, input).match !== "false"); diagnostics && (diagnostics.aheadAirspaceQueries += 1); if (candidate) { const match = airspace(candidate, "inside", verticalMatch(candidate, input).match); ahead = { airspace: match, distanceNm: nm, estimatedMinutes: Number((nm / input.groundSpeed * 60).toFixed(1)), confidence: nm <= 15 ? "medium" : "low" }; break; } }
  }
  return { status: "available", position: { lat: input.lat, lon: input.lon, altitude: input.altitude, altitudeSource: input.altitudeSource ?? "none" }, supportedCountry: fir?.countryCode ? SUPPORTED.has(fir.countryCode) : matches.some((m) => m.countryCode !== null && SUPPORTED.has(m.countryCode!)), fir, currentAirspaces: matches, primaryAirspace: matches[0] ?? null, atsRoute, nearestAtsCandidate, nearestPoint, nextPoint, ahead, limitation: input.onGround ? "Ground aircraft: en-route ATS route prediction skipped" : ahead ? "Ahead on current track only; no turn or flight-plan prediction" : null, computedAt, dataset: { atcVersion: prepared.sectors.map((s) => s.lastVerifiedAt).sort().at(-1) ?? "none", atsVersion: docs.map((d) => d.source.effectiveDate).sort().at(-1) ?? "none", atcCount: prepared.sectors.length, atsSegmentCount: segments.length } };
}

export function inputFromAircraft(aircraft: Pick<Aircraft, "lat" | "lon" | "altitude" | "baroAltitude" | "geomAltitude" | "groundSpeed" | "track" | "verticalRate" | "lastSeen" | "onGround">): AtcContextInput | null {
  if (aircraft.lat === null || aircraft.lon === null) return null;
  return { lat: aircraft.lat, lon: aircraft.lon, altitude: aircraft.altitude, baroAltitude: aircraft.baroAltitude, geomAltitude: aircraft.geomAltitude, altitudeSource: aircraft.baroAltitude !== null ? "baro" : aircraft.geomAltitude !== null ? "geom" : "none", track: aircraft.track, groundSpeed: aircraft.groundSpeed, verticalRate: aircraft.verticalRate, timestamp: aircraft.lastSeen, onGround: aircraft.onGround };
}

export async function loadAtcContextDataset(): Promise<PreparedAtcContextDataset | null> {
  if (cachedDataset && Date.now() - cachedDatasetAt < 30_000) return cachedDataset;
  if (loadingDataset) return loadingDataset;
  loadingDataset = rebuildAtcContextDataset();
  try { return await loadingDataset; } finally { loadingDataset = null; }
}

let loadingDataset: Promise<PreparedAtcContextDataset | null> | null = null;
async function rebuildAtcContextDataset(): Promise<PreparedAtcContextDataset | null> {
  const atc = await getAtcData();
  const routeDocuments = [loadCzAtsRoutes(), loadSkAtsRoutes(), loadAtAtsRoutes()].filter((doc): doc is NonNullable<typeof doc> => doc !== null);
  if (!atc && !routeDocuments.length) return null;
  cachedDataset = prepareAtcContextDataset({ sectors: atc?.sectors ?? [], routeDocuments });
  cachedDatasetAt = Date.now();
  return cachedDataset;
}

let cachedDataset: PreparedAtcContextDataset | null = null;
let cachedDatasetAt = 0;
