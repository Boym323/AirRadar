import fs from "node:fs";
import path from "node:path";

export type CzAtsPoint = { id: string; name: string; kind: "DESIGNATED_POINT" | "NAVAID"; latitude: number; longitude: number; foreignMaintainer: string | null; remarks: string | null };
export type CzAtsSegment = { id: string; fromName: string; toName: string; from: [number, number]; to: [number, number]; navigationSpecification: string; magTrackForwardDeg: number | null; magTrackReverseDeg: number | null; distanceNm: number; upperLimit: string; lowerLimit: string; lowerOverride: string | null; cruisingLevelForward: string | null; cruisingLevelReverse: string | null; availabilityClass: "CDR1" | "CDR2" | "CDR3" | null; availabilityStatus: "UNKNOWN"; remarks: string | null };
export type CzAtsRoute = { designator: string; points: CzAtsPoint[]; segments: CzAtsSegment[]; discontinuities: Array<{ afterPointId: string; beforePointId: string }> };
export type CzAtsRouteDocument = { schemaVersion: 1; source: { name: string; reference: string; effectiveDate: string; aipAmendment: string | null; airacAmendment: string | null }; routes: CzAtsRoute[]; counts: { routes: number; points: number; segments: number; cdrSegments: number; discontinuities: number } };

const DEFAULT_PATH = path.join(process.cwd(), "data/ats/generated/cz-routes.json");
let cached: { file: string; mtimeMs: number; document: CzAtsRouteDocument } | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
function point(value: unknown): value is CzAtsPoint { return isRecord(value) && text(value.id) && text(value.name) && (value.kind === "DESIGNATED_POINT" || value.kind === "NAVAID") && finite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 && finite(value.longitude) && value.longitude >= -180 && value.longitude <= 180 && (value.foreignMaintainer === null || text(value.foreignMaintainer)) && (value.remarks === null || typeof value.remarks === "string"); }
function segment(value: unknown): value is CzAtsSegment { return isRecord(value) && text(value.id) && text(value.fromName) && text(value.toName) && Array.isArray(value.from) && value.from.length === 2 && finite(value.from[0]) && finite(value.from[1]) && Array.isArray(value.to) && value.to.length === 2 && finite(value.to[0]) && finite(value.to[1]) && text(value.navigationSpecification) && (value.magTrackForwardDeg === null || finite(value.magTrackForwardDeg)) && (value.magTrackReverseDeg === null || finite(value.magTrackReverseDeg)) && finite(value.distanceNm) && text(value.upperLimit) && text(value.lowerLimit) && (value.lowerOverride === null || text(value.lowerOverride)) && (value.cruisingLevelForward === null || text(value.cruisingLevelForward)) && (value.cruisingLevelReverse === null || text(value.cruisingLevelReverse)) && (value.availabilityClass === null || value.availabilityClass === "CDR1" || value.availabilityClass === "CDR2" || value.availabilityClass === "CDR3") && value.availabilityStatus === "UNKNOWN" && (value.remarks === null || typeof value.remarks === "string"); }

export function validateCzAtsRouteDocument(value: unknown): CzAtsRouteDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.source) || !text(value.source.name) || !text(value.source.reference) || !text(value.source.effectiveDate) || !Array.isArray(value.routes) || !isRecord(value.counts)) throw new Error("Invalid CZ ATS route document");
  for (const route of value.routes) {
    if (!isRecord(route) || !text(route.designator) || !Array.isArray(route.points) || !route.points.every(point) || !Array.isArray(route.segments) || !route.segments.every(segment) || !Array.isArray(route.discontinuities)) throw new Error("Invalid CZ ATS route document");
    if (route.discontinuities.some((item) => !isRecord(item) || !text(item.afterPointId) || !text(item.beforePointId))) throw new Error("Invalid CZ ATS discontinuity");
  }
  return value as unknown as CzAtsRouteDocument;
}

export function getCzAtsRoutesPath(): string { return process.env.ATS_CZ_ROUTES_PATH?.trim() || DEFAULT_PATH; }
export function clearCzAtsRouteCache(): void { cached = null; }
export function loadCzAtsRoutes(): CzAtsRouteDocument | null {
  const file = getCzAtsRoutesPath();
  try {
    const stat = fs.statSync(file);
    if (cached?.file === file && cached.mtimeMs === stat.mtimeMs) return cached.document;
    const document = validateCzAtsRouteDocument(JSON.parse(fs.readFileSync(file, "utf8")));
    cached = { file, mtimeMs: stat.mtimeMs, document };
    return document;
  } catch { return null; }
}
