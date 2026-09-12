import { load, type CheerioAPI } from "cheerio";
import { aviationCoordinateToDecimal } from "@/lib/atc/cz-geometry";
import { CZ_EAIP_GEN02_URL, fetchOfficialCzEaip, parseCzPublicationMetadata } from "@/lib/atc/cz-eaip";

export const CZ_EAIP_ENR32_URL = "https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-3.2-en-GB.html";
export const CZ_ATS_ROUTES_DEFAULT_PATH = "data/ats/generated/cz-routes.json";

const ROUTE_DESIGNATOR_PATTERN = /^[A-Z]{1,2}\d{1,4}[A-Z]?$/;
const MAX_DISTANCE_ERROR_NM = 1.5;
const MAX_DISTANCE_ERROR_RATIO = 0.08;

export type CzAtsPointKind = "DESIGNATED_POINT" | "NAVAID";
export type CzAtsForeignMaintainer = "DE" | "PL" | "AT" | "SK";
export type CzAtsCruisingLevel = "ODD" | "EVEN";
export type CzAtsAvailabilityClass = "CDR1" | "CDR2" | "CDR3";

export interface CzAtsRoutePoint {
  id: string;
  sourceId: string;
  name: string;
  kind: CzAtsPointKind;
  latitude: number;
  longitude: number;
  foreignMaintainer: CzAtsForeignMaintainer | null;
  remarks: string | null;
}

export interface CzAtsRouteDiscontinuity {
  afterPointId: string;
  beforePointId: string;
}

export interface CzAtsRouteSegment {
  id: string;
  sourceId: string;
  fromPointId: string;
  toPointId: string;
  fromName: string;
  toName: string;
  from: [number, number];
  to: [number, number];
  navigationSpecification: string | null;
  magTrackForwardDeg: number | null;
  magTrackReverseDeg: number | null;
  distanceNm: number;
  geometricDistanceNm: number;
  upperLimit: string | null;
  lowerLimit: string | null;
  lowerOverride: string | null;
  cruisingLevelForward: CzAtsCruisingLevel | null;
  cruisingLevelReverse: CzAtsCruisingLevel | null;
  availabilityClass: CzAtsAvailabilityClass | null;
  availabilityStatus: "UNKNOWN";
  remarks: string | null;
}

export interface CzAtsRoute {
  designator: string;
  sourceId: string;
  points: CzAtsRoutePoint[];
  segments: CzAtsRouteSegment[];
  discontinuities: CzAtsRouteDiscontinuity[];
}

export interface CzAtsRouteDocument {
  schemaVersion: 1;
  source: {
    name: string;
    reference: string;
    effectiveDate: string;
    lastVerifiedAt: string;
    aipAmendment: string | null;
    airacAmendment: string | null;
    countryCode?: string;
    provider?: string;
    sections?: string[];
  };
  routes: CzAtsRoute[];
  counts: {
    routes: number;
    points: number;
    segments: number;
    cdrSegments: number;
    discontinuities: number;
  };
}

export class CzAtsRouteParseError extends Error {
  constructor(readonly issues: string[]) {
    super(`Czech eAIP ENR 3.2 route parse failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "CzAtsRouteParseError";
  }
}

interface SourceToken {
  value: string;
  param: string;
}

interface SegmentDraft {
  sourceId: string;
  navigationSpecification: string | null;
  magTrackForwardDeg: number | null;
  magTrackReverseDeg: number | null;
  distanceNm: number;
  upperLimit: string | null;
  lowerLimit: string | null;
  lowerOverride: string | null;
  cruisingLevelForward: CzAtsCruisingLevel | null;
  cruisingLevelReverse: CzAtsCruisingLevel | null;
  availabilityClass: CzAtsAvailabilityClass | null;
  remarks: string | null;
}

interface SegmentCell {
  text: string;
  tokens: SourceToken[];
}

type RouteBuilder = CzAtsRoute;

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function sourceTokens($: CheerioAPI, node: Parameters<CheerioAPI>[0]): SourceToken[] {
  return $(node).find(".SD").toArray().map((element) => {
    const span = $(element);
    return {
      value: normalizedText(span.text()),
      param: normalizedText(span.next(".sdParams").text()),
    };
  }).filter((token) => token.value.length > 0 && token.param.length > 0);
}

function visibleText($: CheerioAPI, node: Parameters<CheerioAPI>[0]): string {
  const clone = $(node).clone();
  clone.find(".sdParams").remove();
  return normalizedText(clone.text());
}

function paramParts(param: string): { feature: string; key: string; id: string } {
  const parts = param.split(";");
  return {
    feature: parts[0] ?? "",
    key: parts[1] ?? "",
    id: parts.at(-1) ?? "",
  };
}

function tokenFor(tokens: SourceToken[], feature: string, key: string, sourceId?: string): SourceToken | null {
  return tokens.find((token) => {
    const parsed = paramParts(token.param);
    return parsed.feature === feature && parsed.key === key && (!sourceId || parsed.id === sourceId);
  }) ?? null;
}

function tokensForFeature(tokens: SourceToken[], feature: string): SourceToken[] {
  return tokens.filter((token) => paramParts(token.param).feature === feature);
}

function numericToken(tokens: SourceToken[], feature: string, key: string, sourceId: string): number | null {
  const raw = tokenFor(tokens, feature, key, sourceId)?.value;
  if (!raw || raw === "-") return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseEffectiveDate($: CheerioAPI): string {
  const value = $("meta[name='EM.effectiveDateStart']").attr("content")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    throw new CzAtsRouteParseError([`Missing or invalid ENR 3.2 effective date: ${value || "none"}`]);
  }
  return value;
}

function pointMaintainer(rowText: string): CzAtsForeignMaintainer | null {
  const marker = /\*(ED|EP|LO|LZ)\b/i.exec(rowText)?.[1]?.toUpperCase();
  const mapping: Record<string, CzAtsForeignMaintainer> = { ED: "DE", EP: "PL", LO: "AT", LZ: "SK" };
  return marker ? mapping[marker] ?? null : null;
}

function pointRemarks(rowText: string): string | null {
  const continuation = /For continuation see\s+AIP\s+([A-Z]+)/i.exec(rowText);
  return continuation ? `For continuation see AIP ${continuation[1].toUpperCase()}` : null;
}

function parsePoint($: CheerioAPI, row: Parameters<CheerioAPI>[0], tokens: SourceToken[]): CzAtsRoutePoint | null {
  for (const feature of ["TDESIGNATED_POINT", "TNAVAID"] as const) {
    const featureTokens = tokensForFeature(tokens, feature);
    const ids = [...new Set(featureTokens.map((token) => paramParts(token.param).id).filter(Boolean))];
    for (const sourceId of ids) {
      const latitudeToken = tokenFor(featureTokens, feature, "GEO_LAT", sourceId);
      const longitudeToken = tokenFor(featureTokens, feature, "GEO_LONG", sourceId);
      if (!latitudeToken || !longitudeToken) continue;
      const nameToken = tokenFor(featureTokens, feature, "CODE_ID", sourceId)
        ?? tokenFor(featureTokens, feature, "TXT_NAME", sourceId);
      if (!nameToken) continue;
      try {
        const latitude = aviationCoordinateToDecimal(latitudeToken.value);
        const longitude = aviationCoordinateToDecimal(longitudeToken.value);
        const rowText = visibleText($, row);
        return {
          id: `${feature === "TNAVAID" ? "NAV" : "DP"}:${sourceId}`,
          sourceId,
          name: nameToken.value.toUpperCase(),
          kind: feature === "TNAVAID" ? "NAVAID" : "DESIGNATED_POINT",
          latitude,
          longitude,
          foreignMaintainer: pointMaintainer(rowText),
          remarks: pointRemarks(rowText),
        };
      } catch (error) {
        throw new CzAtsRouteParseError([error instanceof Error ? error.message : String(error)]);
      }
    }
  }
  return null;
}

function formatAltitude(tokens: SourceToken[], side: "UPPER" | "LOWER", sourceId: string, override = false): string | null {
  const suffix = override ? "_OVRDE" : "";
  const value = tokenFor(tokens, "TRTE_SEG", `VAL_DIST_VER_${side}${suffix}`, sourceId)?.value ?? null;
  if (!value || value === "-") return null;
  const unit = tokenFor(tokens, "TRTE_SEG", `UOM_DIST_VER_${side}${suffix}`, sourceId)?.value?.toUpperCase() ?? null;
  const reference = tokenFor(tokens, "TRTE_SEG", `CODE_DIST_VER_${side}${suffix}`, sourceId)?.value?.toUpperCase() ?? null;
  if (unit === "FL") return `FL${value}`;
  return [value, unit, reference].filter((part): part is string => Boolean(part)).join(" ");
}

function cruisingLevel(value: string | undefined): CzAtsCruisingLevel | null {
  const normalized = normalizedText(value ?? "").toUpperCase();
  if (normalized === "ODD") return "ODD";
  if (normalized === "EVEN") return "EVEN";
  return null;
}

function availabilityClass(tokens: SourceToken[]): CzAtsAvailabilityClass | null {
  const value = tokensForFeature(tokens, "TRTE_AVBL")
    .find((token) => paramParts(token.param).key === "CODE_RTE_AVBL")?.value?.toUpperCase();
  return value === "CDR1" || value === "CDR2" || value === "CDR3" ? value : null;
}

function segmentCells($: CheerioAPI, row: Parameters<CheerioAPI>[0]): SegmentCell[] {
  return $(row).children("td").toArray().map((cell) => ({
    text: visibleText($, cell),
    tokens: sourceTokens($, cell),
  }));
}

function parseSegmentDraft($: CheerioAPI, row: Parameters<CheerioAPI>[0], tokens: SourceToken[]): SegmentDraft {
  const segmentTokens = tokensForFeature(tokens, "TRTE_SEG");
  const sourceIds = [...new Set(segmentTokens.map((token) => paramParts(token.param).id).filter(Boolean))];
  if (sourceIds.length !== 1) {
    throw new CzAtsRouteParseError([`Expected one TRTE_SEG object in row, found ${sourceIds.length}`]);
  }
  const sourceId = sourceIds[0];
  const distanceNm = numericToken(segmentTokens, "TRTE_SEG", "VAL_LEN", sourceId);
  if (distanceNm === null || distanceNm <= 0 || distanceNm > 1000) {
    throw new CzAtsRouteParseError([`Segment ${sourceId} has invalid GEO DIST`]);
  }
  const rnp = tokenFor(segmentTokens, "TRTE_SEG", "CODE_RNP", sourceId)?.value ?? null;
  const cells = segmentCells($, row);
  const distanceCell = cells.findIndex((cell) => cell.tokens.some((token) => token.param === `TRTE_SEG;VAL_LEN;${sourceId}`));
  if (distanceCell < 0) {
    throw new CzAtsRouteParseError([`Segment ${sourceId} GEO DIST cell could not be identified from its eAIP annotation`]);
  }
  const forwardCell = cells[distanceCell + 2]?.text;
  const reverseCell = cells[distanceCell + 3]?.text;
  const remarksCell = cells[distanceCell + 4]?.text;
  const remarks = normalizedText(remarksCell ?? "") || null;
  return {
    sourceId,
    navigationSpecification: rnp ? `RNAV ${rnp}` : null,
    magTrackForwardDeg: numericToken(segmentTokens, "TRTE_SEG", "VAL_MAG_TRACK", sourceId),
    magTrackReverseDeg: numericToken(segmentTokens, "TRTE_SEG", "VAL_REVERSE_MAG_TRACK", sourceId),
    distanceNm,
    upperLimit: formatAltitude(segmentTokens, "UPPER", sourceId),
    lowerLimit: formatAltitude(segmentTokens, "LOWER", sourceId),
    lowerOverride: formatAltitude(segmentTokens, "LOWER", sourceId, true),
    cruisingLevelForward: cruisingLevel(forwardCell),
    cruisingLevelReverse: cruisingLevel(reverseCell),
    availabilityClass: availabilityClass(tokens),
    remarks,
  };
}

function geometricDistanceNm(from: CzAtsRoutePoint, to: CzAtsRoutePoint): number {
  const earthRadiusNm = 3440.065;
  const latitude1 = from.latitude * Math.PI / 180;
  const latitude2 = to.latitude * Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * Math.PI / 180;
  const longitudeDelta = (to.longitude - from.longitude) * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusNm * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function materializeSegment(route: RouteBuilder, draft: SegmentDraft, from: CzAtsRoutePoint, to: CzAtsRoutePoint): CzAtsRouteSegment {
  const geometryNm = geometricDistanceNm(from, to);
  const allowedErrorNm = Math.max(MAX_DISTANCE_ERROR_NM, draft.distanceNm * MAX_DISTANCE_ERROR_RATIO);
  const difference = Math.abs(geometryNm - draft.distanceNm);
  if (difference > allowedErrorNm) {
    throw new CzAtsRouteParseError([
      `${route.designator} segment ${draft.sourceId} ${from.name}→${to.name}: published ${draft.distanceNm.toFixed(1)} NM differs from coordinate distance ${geometryNm.toFixed(1)} NM`,
    ]);
  }
  return {
    id: `CZ-${route.designator}-${draft.sourceId}`,
    sourceId: draft.sourceId,
    fromPointId: from.id,
    toPointId: to.id,
    fromName: from.name,
    toName: to.name,
    from: [from.longitude, from.latitude],
    to: [to.longitude, to.latitude],
    navigationSpecification: draft.navigationSpecification,
    magTrackForwardDeg: draft.magTrackForwardDeg,
    magTrackReverseDeg: draft.magTrackReverseDeg,
    distanceNm: draft.distanceNm,
    geometricDistanceNm: Number(geometryNm.toFixed(3)),
    upperLimit: draft.upperLimit,
    lowerLimit: draft.lowerLimit,
    lowerOverride: draft.lowerOverride,
    cruisingLevelForward: draft.cruisingLevelForward,
    cruisingLevelReverse: draft.cruisingLevelReverse,
    availabilityClass: draft.availabilityClass,
    availabilityStatus: "UNKNOWN",
    remarks: draft.remarks,
  };
}

function uniquePoint(route: RouteBuilder, point: CzAtsRoutePoint): void {
  const existing = route.points.find((candidate) => candidate.id === point.id);
  if (!existing) {
    route.points.push(point);
    return;
  }
  if (existing.name !== point.name || existing.latitude !== point.latitude || existing.longitude !== point.longitude) {
    throw new CzAtsRouteParseError([`${route.designator} point ${point.id} has inconsistent repeated coordinates or name`]);
  }
}

function publicationName(aipAmendment: string | null, airacAmendment: string | null): string {
  const suffix = [
    aipAmendment ? `AIP AMDT ${aipAmendment}` : null,
    airacAmendment ? `AIRAC ${airacAmendment}` : null,
  ].filter(Boolean).join(", ");
  return `AIM ŘLP ČR eAIP ENR 3.2${suffix ? ` (${suffix})` : ""}`;
}

export function parseCzEaipEnr32Routes(
  html: string,
  options: { publicationHtml?: string; lastVerifiedAt?: string } = {},
): CzAtsRouteDocument {
  const $ = load(html, { xmlMode: true });
  const effectiveDate = parseEffectiveDate($);
  const publication = options.publicationHtml ? parseCzPublicationMetadata(options.publicationHtml) : {
    aipAmendment: null,
    airacAmendment: null,
    effectiveDate: null,
  };
  if (publication.effectiveDate && publication.effectiveDate !== effectiveDate) {
    throw new CzAtsRouteParseError([
      `ENR 3.2 effective date ${effectiveDate} does not match publication record ${publication.effectiveDate}`,
    ]);
  }

  const routes: CzAtsRoute[] = [];
  let route: RouteBuilder | null = null;
  let currentPoint: CzAtsRoutePoint | null = null;
  let pendingSegment: SegmentDraft | null = null;
  let discontinuityAfterPointId: string | null = null;

  const finishRoute = (): void => {
    if (!route) return;
    if (pendingSegment) {
      throw new CzAtsRouteParseError([`${route.designator} ends with segment ${pendingSegment.sourceId} without destination point`]);
    }
    if (route.segments.length === 0) {
      throw new CzAtsRouteParseError([`${route.designator} contains no route segments`]);
    }
    routes.push(route);
    route = null;
    currentPoint = null;
    pendingSegment = null;
    discontinuityAfterPointId = null;
  };

  for (const row of $("tr").toArray()) {
    const rowText = visibleText($, row);
    const tokens = sourceTokens($, row);
    if (/\bAWY discontinuation\b/i.test(rowText)) {
      if (pendingSegment) {
        throw new CzAtsRouteParseError([`${route?.designator ?? "unknown route"} has an airway discontinuation before segment ${pendingSegment.sourceId} receives a destination point`]);
      }
      if (route && currentPoint) discontinuityAfterPointId = currentPoint.id;
      currentPoint = null;
      continue;
    }

    const segmentTokens = tokensForFeature(tokens, "TRTE_SEG");
    if (segmentTokens.length > 0) {
      if (!route || !currentPoint) {
        throw new CzAtsRouteParseError([`Route segment appears without an active route origin: ${rowText.slice(0, 120)}`]);
      }
      if (pendingSegment) {
        throw new CzAtsRouteParseError([`${route.designator} has consecutive segment rows without a destination point`]);
      }
      pendingSegment = parseSegmentDraft($, row, tokens);
      continue;
    }

    const routeTokens = tokens.filter((token) => {
      const parsed = paramParts(token.param);
      return parsed.feature === "TEN_ROUTE_RTE" && parsed.key === "TXT_DESIG";
    });
    const routeHeaderToken = routeTokens.length === 1 && tokens.length === 1 && rowText.toUpperCase() === routeTokens[0].value.toUpperCase()
      ? routeTokens[0]
      : null;
    if (routeHeaderToken) {
      finishRoute();
      const sourceId = paramParts(routeHeaderToken.param).id;
      const designator = routeHeaderToken.value.toUpperCase();
      if (!ROUTE_DESIGNATOR_PATTERN.test(designator) || !sourceId) {
        throw new CzAtsRouteParseError([`Invalid ATS route designator or source id: ${routeHeaderToken.value}`]);
      }
      route = { designator, sourceId, points: [], segments: [], discontinuities: [] };
      continue;
    }

    if (!route) continue;
    const point = parsePoint($, row, tokens);
    if (!point) continue;

    if (discontinuityAfterPointId) {
      route.discontinuities.push({ afterPointId: discontinuityAfterPointId, beforePointId: point.id });
      discontinuityAfterPointId = null;
    }
    uniquePoint(route, point);
    if (pendingSegment) {
      if (!currentPoint) {
        throw new CzAtsRouteParseError([`${route.designator} segment ${pendingSegment.sourceId} has no origin point`]);
      }
      route.segments.push(materializeSegment(route, pendingSegment, currentPoint, point));
      pendingSegment = null;
    }
    currentPoint = point;
  }

  finishRoute();
  if (routes.length === 0) throw new CzAtsRouteParseError(["No ATS routes were found in ENR 3.2"]);

  const routeDesignators = new Set<string>();
  const routeSourceIds = new Set<string>();
  for (const candidate of routes) {
    if (routeDesignators.has(candidate.designator)) throw new CzAtsRouteParseError([`Duplicate route designator ${candidate.designator}`]);
    if (routeSourceIds.has(candidate.sourceId)) throw new CzAtsRouteParseError([`Duplicate route source id ${candidate.sourceId}`]);
    routeDesignators.add(candidate.designator);
    routeSourceIds.add(candidate.sourceId);
  }

  const document: CzAtsRouteDocument = {
    schemaVersion: 1,
    source: {
      name: publicationName(publication.aipAmendment, publication.airacAmendment),
      reference: CZ_EAIP_ENR32_URL,
      effectiveDate,
      lastVerifiedAt: options.lastVerifiedAt ?? new Date().toISOString(),
      aipAmendment: publication.aipAmendment,
      airacAmendment: publication.airacAmendment,
    },
    routes,
    counts: {
      routes: routes.length,
      points: routes.reduce((sum, candidate) => sum + candidate.points.length, 0),
      segments: routes.reduce((sum, candidate) => sum + candidate.segments.length, 0),
      cdrSegments: routes.reduce((sum, candidate) => sum + candidate.segments.filter((segment) => segment.availabilityClass !== null).length, 0),
      discontinuities: routes.reduce((sum, candidate) => sum + candidate.discontinuities.length, 0),
    },
  };
  return validateCzAtsRouteDocument(document);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCzAtsRouteDocument(value: unknown): CzAtsRouteDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.source) || !Array.isArray(value.routes) || !isRecord(value.counts)) {
    throw new CzAtsRouteParseError(["ATS route document does not match schema version 1"]);
  }
  if (value.source.reference !== CZ_EAIP_ENR32_URL || typeof value.source.effectiveDate !== "string" || typeof value.source.lastVerifiedAt !== "string") {
    throw new CzAtsRouteParseError(["ATS route document has invalid source metadata"]);
  }
  if (!Number.isFinite(Date.parse(`${value.source.effectiveDate}T00:00:00Z`)) || !Number.isFinite(Date.parse(value.source.lastVerifiedAt))) {
    throw new CzAtsRouteParseError(["ATS route document has invalid source timestamps"]);
  }
  for (const rawRoute of value.routes) {
    if (!isRecord(rawRoute) || typeof rawRoute.designator !== "string" || !ROUTE_DESIGNATOR_PATTERN.test(rawRoute.designator)
      || typeof rawRoute.sourceId !== "string" || !Array.isArray(rawRoute.points) || !Array.isArray(rawRoute.segments)
      || !Array.isArray(rawRoute.discontinuities) || rawRoute.segments.length === 0) {
      throw new CzAtsRouteParseError(["ATS route document contains an invalid route"]);
    }
    for (const rawSegment of rawRoute.segments) {
      if (!isRecord(rawSegment) || typeof rawSegment.id !== "string" || typeof rawSegment.sourceId !== "string"
        || typeof rawSegment.fromPointId !== "string" || typeof rawSegment.toPointId !== "string"
        || typeof rawSegment.distanceNm !== "number" || !Number.isFinite(rawSegment.distanceNm)
        || rawSegment.distanceNm <= 0 || rawSegment.availabilityStatus !== "UNKNOWN") {
        throw new CzAtsRouteParseError([`ATS route ${rawRoute.designator} contains an invalid segment`]);
      }
    }
  }
  return value as unknown as CzAtsRouteDocument;
}

export async function fetchCurrentCzAtsRoutes(): Promise<{ enr32Html: string; publicationHtml: string }> {
  const [enr32Html, publicationHtml] = await Promise.all([
    fetchOfficialCzEaip(CZ_EAIP_ENR32_URL),
    fetchOfficialCzEaip(CZ_EAIP_GEN02_URL),
  ]);
  return { enr32Html, publicationHtml };
}
