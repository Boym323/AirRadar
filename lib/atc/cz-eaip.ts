import { load, type CheerioAPI } from "cheerio";
import type { AtcImportDocument, AtcImportFrequency, AtcImportSector, ImportAltitude } from "./import-format";
import type { Coordinate } from "./types";
import { BKG_VG25_ATTRIBUTION, BKG_VG25_WFS_URL } from "./bkg-boundary";
import { type BoundaryResolver, type StateBoundaryReference } from "./boundary-resolver";
import { CZ_CUZK_DATA50_METADATA_URL, CZ_CUZK_DATA50_QUERY_URL, type StateBoundaryResolution } from "./cz-boundary";
import { aviationCoordinateToDecimal, densifyArc, type ArcDirection } from "./cz-geometry";
import { isSupportedAtcFrequencyMhz } from "./frequency-policy";
import { classifyMissingCzEaipStableId, CZ_EAIP_MISSING_ID_REASON, type CzEaipDiagnosticClassification } from "./cz-eaip-policy";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const CZ_EAIP_ENR21_URL = "https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-2.1-en-GB.html";
export const CZ_EAIP_GEN02_URL = "https://aim.rlp.cz/ais_data/aip/data/valid/g0-2.html";
export const CZ_EAIP_AD2_URL = "https://aim.rlp.cz/eaip/html/eAIP/LK-AD-2.{icao}-en-GB.html";
/** Civil aerodromes whose official AD 2.17/2.18 pages publish controlled CTR data. */
export const CZ_CIVIL_CONTROLLED_AERODROMES = ["LKPR", "LKTB", "LKMT", "LKKV"] as const;
export const CZ_ATC_SOURCE_REFERENCE = `${CZ_EAIP_ENR21_URL} | Czech boundary geometry: ${CZ_CUZK_DATA50_QUERY_URL} | metadata: ${CZ_CUZK_DATA50_METADATA_URL} | Germany–Poland boundary geometry: ${BKG_VG25_WFS_URL} (${BKG_VG25_ATTRIBUTION})`;
const AUTHORITATIVE_HOST = "aim.rlp.cz";
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export type CzAtcObjectType = "ACC_OPERATIONAL_SECTOR" | "FIC_SECTOR" | "TMA" | "CTA" | "CTR" | "OTHER";

export interface CzPublicationMetadata {
  aipAmendment: string | null;
  airacAmendment: string | null;
  effectiveDate: string | null;
}

export interface CzEaipSectorDiagnostic {
  name: string;
  stableId: string | null;
  objectType: CzAtcObjectType;
  status: "accepted" | "skipped";
  classification: CzEaipDiagnosticClassification;
  reason?: string;
  boundaryError?: string;
  boundaryResolutions?: StateBoundaryResolution[];
  polygonMetrics?: CzPolygonMetric[];
}

export interface CzPolygonMetric {
  vertexCount: number;
  areaSquareKm: number;
  maxSegmentKm: number;
  boundingBox: { west: number; south: number; east: number; north: number };
}

export interface CzEaipParseResult {
  document: AtcImportDocument;
  publication: CzPublicationMetadata;
  effectiveDate: string;
  publicationDate: string | null;
  diagnostics: CzEaipSectorDiagnostic[];
  counts: {
    accOperationalDetected: number;
    valid: number;
    skipped: number;
    sourceLimitedRows: number;
    blockingSupportedRows: number;
    classification: Record<CzAtcObjectType, number>;
  };
}

export interface CzAd2AtcParseResult {
  document: AtcImportDocument;
  diagnostic: CzEaipSectorDiagnostic;
}

export class CzEaipParseError extends Error {
  constructor(readonly issues: string[]) {
    super(`Czech eAIP parse failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "CzEaipParseError";
  }
}

interface SourceToken {
  value: string;
  param: string;
  paragraphText: string;
}

interface ArcEvent {
  direction: ArcDirection;
  radiusNm: number;
  center: Coordinate | null;
  centerReference: string | null;
}

interface StateBoundaryEvent {
  label: string;
  reference: StateBoundaryReference;
}

type BoundaryEvent =
  | { kind: "coordinate"; coordinate: Coordinate }
  | { kind: "arc"; arc: ArcEvent }
  | { kind: "border"; border: StateBoundaryEvent };

interface ParsedBoundary {
  polygons: Coordinate[][];
  directGeometry: boolean;
  arcCount: number;
  borderNames: string[];
  borderSegments: StateBoundaryEvent[];
  boundaryResolutions: StateBoundaryResolution[];
  events: BoundaryEvent[];
  lateralReference: string | null;
  lateralReferenceCandidates: string[];
  constituentReferences: string[];
}

interface ParsedRow {
  name: string;
  stableId: string | null;
  objectType: CzAtcObjectType;
  unit: string | null;
  callsign: string | null;
  frequencies: AtcImportFrequency[];
  primaryFrequencyMhz: number | null;
  lowerAltitude: ImportAltitude | null;
  upperAltitude: ImportAltitude | null;
  boundary: ParsedBoundary;
  annotationParams: string[];
  missingStableId: boolean;
  skipReason?: string;
  boundaryError?: string;
}

function normalizedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseDateParts(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizedText(value).toUpperCase().replace(/,/g, "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (iso) return normalized;
  const match = /^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})$/.exec(normalized);
  if (!match) return null;
  const months: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
  return `${match[3]}-${months[match[2]]}-${match[1].padStart(2, "0")}`;
}

function validIsoDate(value: string | null): value is string {
  return value !== null && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function metadataValue($: CheerioAPI, name: string): string | null {
  const value = $(`meta[name="${name}"]`).attr("content")?.trim();
  return value || null;
}

/** Parse GEN 0.2 without depending on the current amendment number. */
export function parseCzPublicationMetadata(html: string): CzPublicationMetadata {
  const $ = load(html, { xmlMode: false });
  let aipAmendment: string | null = null;
  let airacAmendment: string | null = null;
  $("table").each((_, table) => {
    const heading = normalizedText($(table).find("th").first().text()).toUpperCase();
    const row = $(table).find("tr").filter((__, candidate) => /^\d+\/\d+$/.test(normalizedText($(candidate).find("td").first().text()))).first();
    const amendment = normalizedText(row.find("td").first().text());
    if (!/^\d+\/\d+$/.test(amendment)) return;
    if (heading.includes("AIRAC")) airacAmendment = amendment;
    else if (heading.includes("AIP")) aipAmendment = amendment;
  });
  const effectiveDate = parseDateParts(normalizedText($("body").text()).match(/as of\s+(\d{1,2}\s+[A-Z]{3}\s+\d{4})/i)?.[1] ?? "");
  return { aipAmendment, airacAmendment, effectiveDate };
}

function sourceTokens($: CheerioAPI, node: Parameters<CheerioAPI>[0]): SourceToken[] {
  return $(node).find(".SD").toArray().map((element) => {
    const span = $(element);
    return {
      value: normalizedText(span.text()),
      param: normalizedText(span.next(".sdParams").text()),
      paragraphText: normalizedText(span.closest("p").text()),
    };
  }).filter((token) => token.value.length > 0 && token.param.length > 0);
}

function paramKey(param: string): string {
  return param.split(";")[1] ?? "";
}

function paramValue(param: string): string | null {
  const parts = param.split(";");
  return parts.length >= 3 ? parts.slice(2).join(";") : null;
}

function findToken(tokens: SourceToken[], key: string, feature?: string): SourceToken | null {
  return tokens.find((token) => paramKey(token.param) === key && (!feature || token.param.startsWith(`${feature};`))) ?? null;
}

function tokensForKey(tokens: SourceToken[], key: string, feature?: string): SourceToken[] {
  return tokens.filter((token) => paramKey(token.param) === key && (!feature || token.param.startsWith(`${feature};`)));
}

function parseCoordinatePair($: CheerioAPI, paragraph: Parameters<CheerioAPI>[0]): Coordinate | null {
  const tokens = sourceTokens($, paragraph);
  const latitude = findToken(tokens, "GEO_LAT", "TAIRSPACE_VERTEX");
  const longitude = findToken(tokens, "GEO_LONG", "TAIRSPACE_VERTEX");
  if (!latitude || !longitude) return null;
  try {
    return [aviationCoordinateToDecimal(longitude.value), aviationCoordinateToDecimal(latitude.value)];
  } catch (error) {
    throw new CzEaipParseError([error instanceof Error ? error.message : String(error)]);
  }
}

function parseArc($: CheerioAPI, paragraph: Parameters<CheerioAPI>[0]): ArcEvent | null {
  const tokens = sourceTokens($, paragraph);
  const directionToken = tokens.find((token) => token.param.startsWith("TAIRSPACE_VERTEX;CODE_TYPE;") && /^(CWA|CCA)$/i.test(token.value));
  if (!directionToken) return null;
  const radiusToken = findToken(tokens, "VAL_RADIUS_ARC", "TAIRSPACE_VERTEX");
  const centerLatitude = findToken(tokens, "GEO_LAT_ARC", "TAIRSPACE_VERTEX");
  const centerLongitude = findToken(tokens, "GEO_LONG_ARC", "TAIRSPACE_VERTEX");
  const centerReferenceToken = tokens.find((token) => token.param.startsWith("TDME;CODE_ID;"));
  const centerReference = centerReferenceToken ? paramValue(centerReferenceToken.param) : null;
  if (!radiusToken || !centerLatitude || (!centerLongitude && !centerReference)) throw new CzEaipParseError([`Arc ${directionToken.value} is missing radius or authoritative center`]);
  const radiusNm = Number(radiusToken.value);
  if (!Number.isFinite(radiusNm) || radiusNm <= 0) throw new CzEaipParseError([`Arc ${directionToken.value} has invalid radius ${radiusToken.value}`]);
  try {
    return {
      direction: directionToken.value.toUpperCase() as ArcDirection,
      radiusNm,
      center: centerLongitude
        ? [aviationCoordinateToDecimal(centerLongitude.value), aviationCoordinateToDecimal(centerLatitude.value)]
        : null,
      centerReference,
    };
  } catch (error) {
    throw new CzEaipParseError([error instanceof Error ? error.message : String(error)]);
  }
}

function parseBoundary($: CheerioAPI, cell: Parameters<CheerioAPI>[0]): ParsedBoundary {
  const cellText = normalizedText($(cell).text());
  const name = $(cell).find("strong .SD").first().text().trim();
  const references = sourceTokens($, cell)
    .filter((token) => token.param.startsWith("TAIRSPACE;TXT_NAME;"))
    .map((token) => token.value)
    .filter((value) => value !== name);
  const uniqueReferences = [...new Set(references)];
  const lateralReferenceCandidates = /lateral limits same as/i.test(cellText) ? uniqueReferences : [];
  const lateralReference = lateralReferenceCandidates.length === 1 ? lateralReferenceCandidates[0] : null;
  const constituentReferences = /consists of:/i.test(cellText) ? uniqueReferences : [];
  const events: BoundaryEvent[] = [];
  const borderNames: string[] = [];
  $(cell).find("p, div").each((_, paragraph) => {
    const paragraphNode = $(paragraph);
    const coordinate = parseCoordinatePair($, paragraphNode);
    const arc = parseArc($, paragraphNode);
    const borderTokens = sourceTokens($, paragraphNode).filter((token) => token.param.startsWith("TGEO_BORDER;"));
    if (coordinate) events.push({ kind: "coordinate", coordinate });
    if (arc) events.push({ kind: "arc", arc });
    if (borderTokens.length) {
      const label = borderTokens.map((token) => token.value).join(" ");
      borderNames.push(...borderTokens.map((token) => token.value));
      events.push({ kind: "border", border: { label, reference: parseStateBoundaryReference(label) } });
    }
  });
  return {
    polygons: [],
    directGeometry: false,
    arcCount: events.filter((event) => event.kind === "arc").length,
    borderNames: [...new Set(borderNames)],
    borderSegments: events.filter((event): event is { kind: "border"; border: StateBoundaryEvent } => event.kind === "border").map((event) => event.border),
    boundaryResolutions: [],
    events,
    lateralReference,
    lateralReferenceCandidates,
    constituentReferences,
  };
}

function parseStateBoundaryReference(label: string): StateBoundaryReference {
  const normalized = normalizedText(label).toLocaleLowerCase("en-US");
  const countryLabel = normalized.replace(/^state boundary with\s+/, "");
  const neighbour = /^(germany|poland|austria|slovakia)$/.exec(countryLabel)?.[1];
  const czechNeighbours = { germany: "DE", poland: "PL", austria: "AT", slovakia: "SK" } as const;
  if (neighbour && neighbour in czechNeighbours) return { kind: "czech-border", neighbour: czechNeighbours[neighbour as keyof typeof czechNeighbours] };
  if (/^(?:state boundary\s+)?(germany\s*-\s*poland|poland\s*-\s*germany)$/.test(normalized)) return { kind: "foreign-border", countryA: "DE", countryB: "PL" };
  throw new CzEaipParseError([`Unsupported state-boundary semantics: ${label}`]);
}

function formatStateBoundaryReference(reference: StateBoundaryReference): string {
  return reference.kind === "czech-border" ? `Czech border with ${reference.neighbour}` : "Germany–Poland international border";
}

function assembleBoundary(boundary: ParsedBoundary, name: string, provider?: BoundaryResolver): void {
  const coordinates: Coordinate[] = [];
  const arcCenters = new Map<string, Coordinate>();
  let pendingArc: ArcEvent | null = null;
  let pendingBorder: StateBoundaryEvent | null = null;
  const resolutions: StateBoundaryResolution[] = [];
  for (const event of boundary.events) {
    if (event.kind === "coordinate") {
      if (pendingArc) {
        const start = coordinates.at(-1);
        if (!start) throw new CzEaipParseError([`Arc in ${name || "unnamed airspace"} has no start point`]);
        const center = pendingArc.center ?? (pendingArc.centerReference ? arcCenters.get(pendingArc.centerReference) ?? null : null);
        if (!center) throw new CzEaipParseError([`Arc in ${name || "unnamed airspace"} has no resolvable authoritative center`]);
        if (pendingArc.centerReference) arcCenters.set(pendingArc.centerReference, center);
        appendUniqueCoordinates(coordinates, densifyArc({ start, end: event.coordinate, center, direction: pendingArc.direction, radiusNm: pendingArc.radiusNm }).slice(1));
        pendingArc = null;
      } else if (pendingBorder) {
        const start = coordinates.pop();
        if (!start) throw new CzEaipParseError([`State boundary in ${name || "unnamed airspace"} has no start point`]);
        if (!provider) {
          coordinates.push(start);
          coordinates.push(event.coordinate);
        } else {
          let resolution: StateBoundaryResolution;
          try {
            resolution = { ...provider.getBoundarySegment(pendingBorder.reference, { start, end: event.coordinate }), semantic: formatStateBoundaryReference(pendingBorder.reference) };
          } catch (error) {
            throw new CzEaipParseError([`${name || "unnamed airspace"}: ${error instanceof Error ? error.message : String(error)}`]);
          }
          appendUniqueCoordinates(coordinates, resolution.coordinates);
          resolutions.push(resolution);
        }
        pendingBorder = null;
      } else {
        appendUniqueCoordinates(coordinates, [event.coordinate]);
      }
    } else if (event.kind === "arc") {
      if (pendingArc || pendingBorder) throw new CzEaipParseError([`Consecutive or unterminated boundary constructs are not supported in ${name || "unnamed airspace"}`]);
      pendingArc = event.arc;
    } else {
      if (pendingArc || pendingBorder || !coordinates.length) throw new CzEaipParseError([`Malformed state-boundary construct in ${name || "unnamed airspace"}`]);
      pendingBorder = event.border;
    }
  }
  if (pendingArc) throw new CzEaipParseError([`Arc in ${name || "unnamed airspace"} has no end point`]);
  if (pendingBorder) throw new CzEaipParseError([`State boundary in ${name || "unnamed airspace"} has no end point`]);
  if (coordinates.length > 1 && coordinates[0][0] === coordinates.at(-1)?.[0] && coordinates[0][1] === coordinates.at(-1)?.[1]) {
    // The source already closes the ring.
  } else if (coordinates.length >= 3) {
    coordinates.push(coordinates[0]);
  }
  boundary.polygons = coordinates.length >= 3 ? polygonizeBoundaryWalk(coordinates) : [];
  boundary.directGeometry = boundary.polygons.length > 0;
  boundary.boundaryResolutions = resolutions;
}

function appendUniqueCoordinates(target: Coordinate[], coordinates: Coordinate[]): void {
  for (const coordinate of coordinates) {
    const previous = target.at(-1);
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) target.push(coordinate);
  }
}

function properSegmentIntersection(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): { point: Coordinate; firstFraction: number; secondFraction: number } | null {
  const firstX = b[0] - a[0];
  const firstY = b[1] - a[1];
  const secondX = d[0] - c[0];
  const secondY = d[1] - c[1];
  const denominator = firstX * secondY - firstY * secondX;
  if (Math.abs(denominator) < 1e-12) return null;
  const offsetX = c[0] - a[0];
  const offsetY = c[1] - a[1];
  const firstFraction = (offsetX * secondY - offsetY * secondX) / denominator;
  const secondFraction = (offsetX * firstY - offsetY * firstX) / denominator;
  const epsilon = 1e-10;
  if (firstFraction <= epsilon || firstFraction >= 1 - epsilon || secondFraction <= epsilon || secondFraction >= 1 - epsilon) return null;
  return {
    point: [a[0] + firstX * firstFraction, a[1] + firstY * firstFraction],
    firstFraction,
    secondFraction,
  };
}

function pointAlongSegment(start: Coordinate, end: Coordinate, fraction: number): Coordinate {
  return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
}

function boundaryPathSlice(ring: Coordinate[], startSegment: number, startFraction: number, endSegment: number, endFraction: number): Coordinate[] {
  const segmentCount = ring.length - 1;
  const result = [pointAlongSegment(ring[startSegment], ring[startSegment + 1], startFraction)];
  const steps = (endSegment - startSegment + segmentCount) % segmentCount;
  for (let step = 1; step <= steps; step += 1) {
    result.push(ring[(startSegment + step) % segmentCount]);
  }
  result.push(pointAlongSegment(ring[endSegment], ring[endSegment + 1], endFraction));
  appendUniqueCoordinates(result, [result[0]]);
  return result;
}

function firstBoundaryIntersection(ring: Coordinate[]): { firstSegment: number; secondSegment: number; firstFraction: number; secondFraction: number } | null {
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      if (second === first + 1 || (first === 0 && second === segmentCount - 1)) continue;
      const intersection = properSegmentIntersection(ring[first], ring[first + 1], ring[second], ring[second + 1]);
      if (intersection) return { firstSegment: first, secondSegment: second, ...intersection };
    }
  }
  return null;
}

function polygonizeBoundaryWalk(ring: Coordinate[]): Coordinate[][] {
  const pending = [ring];
  const polygons: Coordinate[][] = [];
  let splitCount = 0;
  while (pending.length) {
    const current = pending.pop()!;
    const intersection = firstBoundaryIntersection(current);
    if (!intersection) {
      polygons.push(current);
      continue;
    }
    splitCount += 1;
    if (splitCount > 32) throw new CzEaipParseError(["Boundary walk contains too many self-intersections to polygonize safely"]);
    pending.push(
      boundaryPathSlice(current, intersection.firstSegment, intersection.firstFraction, intersection.secondSegment, intersection.secondFraction),
      boundaryPathSlice(current, intersection.secondSegment, intersection.secondFraction, intersection.firstSegment, intersection.firstFraction),
    );
  }
  return polygons.filter((polygon) => polygon.length >= 4);
}

function parseAltitude(value: string | null, unit: string | null, code: string | null, boundary: "lower" | "upper"): ImportAltitude | null {
  if (!value) return null;
  const normalized = normalizedText(value).toUpperCase();
  if (normalized === "GND" || normalized === "SFC") return boundary === "lower" ? "SFC" : null;
  if (normalized === "UNL") return boundary === "upper" ? "UNL" : null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) return null;
  if (unit?.toUpperCase() === "FL") return `FL${numeric}`;
  if (code?.toUpperCase() === "AGL") return `${numeric} AGL`;
  return numeric;
}

function parseVerticalLimits($: CheerioAPI, cell: Parameters<CheerioAPI>[0]): { lower: ImportAltitude | null; upper: ImportAltitude | null } {
  const tokens = sourceTokens($, cell);
  const upperValue = findToken(tokens, "VAL_DIST_VER_UPPER")?.value ?? null;
  const lowerValue = findToken(tokens, "VAL_DIST_VER_LOWER")?.value ?? null;
  const upperUnit = findToken(tokens, "UOM_DIST_VER_UPPER")?.value ?? null;
  const lowerUnit = findToken(tokens, "UOM_DIST_VER_LOWER")?.value ?? null;
  const upperCode = findToken(tokens, "CODE_DIST_VER_UPPER")?.value ?? null;
  const lowerCode = findToken(tokens, "CODE_DIST_VER_LOWER")?.value ?? null;
  return {
    lower: parseAltitude(lowerValue, lowerUnit, lowerCode, "lower"),
    upper: parseAltitude(upperValue, upperUnit, upperCode, "upper"),
  };
}

function parseFrequencies($: CheerioAPI, cell: Parameters<CheerioAPI>[0]): { primary: number | null; frequencies: AtcImportFrequency[] } {
  const tokens = sourceTokens($, cell);
  const reserveIds = new Set(tokens.filter((token) => token.param.startsWith("TFREQUENCY;CODE_TYPE;") && /reserve/i.test(token.value)).map((token) => paramValue(token.param)));
  const frequencies = tokensForKey(tokens, "VAL_FREQ_TRANS", "TFREQUENCY").flatMap((token) => {
    const value = Number(token.value.replace(",", "."));
    if (!isSupportedAtcFrequencyMhz(value)) return [];
    const id = paramValue(token.param);
    const isReserve = id !== null && reserveIds.has(id);
    return [{ frequencyMhz: value, label: isReserve ? "Reserve" : null }];
  });
  const primary = frequencies.find((frequency) => frequency.label !== "Reserve")?.frequencyMhz ?? frequencies[0]?.frequencyMhz ?? null;
  return { primary, frequencies: frequencies.filter((frequency) => frequency.frequencyMhz !== primary || frequency.label === "Reserve") };
}

function sourceValue($: CheerioAPI, cell: Parameters<CheerioAPI>[0], feature: string, key: string): string | null {
  return sourceTokens($, cell).find((token) => token.param.startsWith(`${feature};${key};`))?.value ?? null;
}

function classifyRow(name: string, unit: string | null, callsign: string | null): CzAtcObjectType {
  const normalizedName = name.toUpperCase();
  const normalizedUnit = unit?.toUpperCase() ?? "";
  const normalizedCallsign = callsign?.toUpperCase() ?? "";
  if (normalizedName.startsWith("SECTOR") && normalizedUnit.includes("PRAHA ACC") && normalizedCallsign.includes("PRAHA RADAR")) return "ACC_OPERATIONAL_SECTOR";
  if (normalizedName.startsWith("SECTOR") && (normalizedUnit.includes("FIC") || normalizedCallsign.includes("INFORMATION"))) return "FIC_SECTOR";
  if (normalizedName.startsWith("TMA")) return "TMA";
  if (normalizedName.startsWith("CTA")) return "CTA";
  return "OTHER";
}

function serviceForObjectType(objectType: CzAtcObjectType, unit: string | null): string | null {
  if (objectType === "ACC_OPERATIONAL_SECTOR" || objectType === "CTA") return "ACC";
  if (objectType === "FIC_SECTOR") return "FIS";
  if (objectType === "TMA") return "APP";
  if (objectType === "CTR") return "TWR";
  return unit;
}

function importableObjectType(objectType: CzAtcObjectType): boolean {
  return objectType !== "OTHER";
}

function stableId($: CheerioAPI, cell: Parameters<CheerioAPI>[0], prefix = "LKAA"): string | null {
  const values = $(cell).find(".SD").map((_, element) => normalizedText($(element).text())).get();
  const official = values.find((value) => new RegExp(`^${prefix}[A-Z0-9]+$`).test(value));
  if (official) return official;
  const sourceObject = $(cell).find(".sdParams").map((_, element) => normalizedText($(element).text())).get().find((param) => param.startsWith("TAIRSPACE;TXT_NAME;"));
  const numeric = sourceObject ? paramValue(sourceObject) : null;
  return numeric ? `${prefix}-AIP-${numeric}` : null;
}

function parseRow($: CheerioAPI, rowNode: Parameters<CheerioAPI>[0], geometryOnly = false): ParsedRow | null {
  const cells = $(rowNode).children("td").toArray();
  if (cells.length < 4 && !geometryOnly) return null;
  const first = $(cells[0]);
  const name = normalizedText(first.find("strong .SD").first().text());
  if (!name) return null;
  const unitCell = cells[1] ? $(cells[1]) : null;
  const callsignCell = cells[2] ? $(cells[2]) : null;
  const unit = unitCell ? sourceValue($, unitCell, "TUNIT", "TXT_NAME") ?? (normalizedText(unitCell.text()).split(";")[0] || null) : null;
  const callsign = callsignCell ? sourceValue($, callsignCell, "TCALLSIGN_DETAIL", "TXT_CALL_SIGN") ?? null : null;
  const objectType = classifyRow(name, unit, callsign);
  const boundary = parseBoundary($, first);
  const vertical = parseVerticalLimits($, first);
  const parsedFrequencies = cells.length >= 4 ? parseFrequencies($, $(rowNode)) : { primary: null, frequencies: [] };
  const id = stableId($, first);
  const annotationParams = sourceTokens($, first)
    .filter((token) => token.param.toUpperCase().startsWith("TAIRSPACE;ANNOTATION:"))
    .map((token) => token.param);
  const parsedRow: ParsedRow = {
    name,
    stableId: id,
    objectType,
    unit,
    callsign,
    frequencies: parsedFrequencies.frequencies,
    primaryFrequencyMhz: parsedFrequencies.primary,
    lowerAltitude: vertical.lower,
    upperAltitude: vertical.upper,
    boundary,
    annotationParams,
    missingStableId: importableObjectType(objectType) && !id,
  };
  return parsedRow;
}

function copyReferencedGeometry(source: ParsedRow, target: ParsedRow): void {
  source.boundary.polygons = target.boundary.polygons;
  source.boundary.directGeometry = target.boundary.directGeometry;
  source.boundary.boundaryResolutions = target.boundary.boundaryResolutions;
}

/** Resolve explicit lateral-geometry references with an iterative DFS. */
function resolveLateralReferences(rows: ParsedRow[]): void {
  const byName = new Map<string, ParsedRow[]>();
  for (const row of rows) byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  const state = new Map<string, "visiting" | "resolved" | "blocked">();
  const failure = new Map<string, string>();
  type Frame = { row: ParsedRow; entered: boolean };

  const block = (row: ParsedRow, reason: string): void => {
    row.boundaryError = reason;
    row.skipReason = reason;
    state.set(row.name, "blocked");
    failure.set(row.name, reason);
  };

  for (const root of rows.filter((row) => row.boundary.lateralReferenceCandidates.length > 0)) {
    if (root.boundary.directGeometry || state.get(root.name)) continue;
    const stack: Frame[] = [{ row: root, entered: false }];
    while (stack.length) {
      const frame = stack.at(-1)!;
      const row = frame.row;
      if (!frame.entered) {
        frame.entered = true;
        state.set(row.name, "visiting");
        if (row.boundary.lateralReferenceCandidates.length !== 1 || !row.boundary.lateralReference) {
          block(row, `lateral geometry reference is ambiguous: ${row.boundary.lateralReferenceCandidates.join(", ") || "none"}`);
          stack.pop();
          continue;
        }
        const matches = byName.get(row.boundary.lateralReference) ?? [];
        if (!matches.length) {
          block(row, `lateral geometry reference not found: ${row.boundary.lateralReference}`);
          stack.pop();
          continue;
        }
        if (matches.length > 1) {
          block(row, `lateral geometry reference is ambiguous: ${row.boundary.lateralReference}`);
          stack.pop();
          continue;
        }
        const target = matches[0];
        const targetState = state.get(target.name);
        if (targetState === "visiting") {
          const cycleStart = stack.findIndex((item) => item.row.name === target.name);
          const cycle = [...stack.slice(Math.max(0, cycleStart)).map((item) => item.row.name), target.name];
          const reason = `lateral geometry reference cycle: ${cycle.join(" -> ")}`;
          const firstCycleFrame = Math.max(0, cycleStart);
          for (const cycleFrame of stack.slice(firstCycleFrame)) block(cycleFrame.row, reason);
          stack.length = firstCycleFrame;
          continue;
        }
        if (targetState === "blocked") {
          block(row, `lateral geometry reference is blocked: ${target.name}${failure.get(target.name) ? ` (${failure.get(target.name)})` : ""}`);
          stack.pop();
          continue;
        }
        if (targetState === "resolved" || target.boundary.directGeometry) {
          copyReferencedGeometry(row, target);
          state.set(row.name, "resolved");
          stack.pop();
          continue;
        }
        stack.push({ row: target, entered: false });
        continue;
      }

      const targetName = row.boundary.lateralReference;
      const target = targetName ? byName.get(targetName)?.[0] : undefined;
      if (target && state.get(target.name) === "resolved") {
        copyReferencedGeometry(row, target);
        state.set(row.name, "resolved");
      } else {
        block(row, `lateral geometry reference is blocked: ${targetName ?? "unknown"}${targetName && failure.get(targetName) ? ` (${failure.get(targetName)})` : ""}`);
      }
      stack.pop();
    }
  }
}

function segmentIntersects(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  const orientation = (p: Coordinate, q: Coordinate, r: Coordinate) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p: Coordinate, q: Coordinate, r: Coordinate) => Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) && Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (((first > 0 && second < 0) || (first < 0 && second > 0)) && ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))) return true;
  return (Math.abs(first) < 1e-10 && onSegment(a, c, b))
    || (Math.abs(second) < 1e-10 && onSegment(a, d, b))
    || (Math.abs(third) < 1e-10 && onSegment(c, a, d))
    || (Math.abs(fourth) < 1e-10 && onSegment(c, b, d));
}

function validatePolygon(name: string, polygon: Coordinate[]): string | null {
  if (polygon.length < 4) return `${name} has fewer than three vertices`;
  let area = 0;
  for (let index = 0; index < polygon.length - 1; index += 1) area += polygon[index][0] * polygon[index + 1][1] - polygon[index + 1][0] * polygon[index][1];
  if (Math.abs(area) < 1e-12) return `${name} has zero-area geometry`;
  for (let first = 0; first < polygon.length - 1; first += 1) {
    for (let second = first + 1; second < polygon.length - 1; second += 1) {
      if (second === first + 1 || (first === 0 && second === polygon.length - 2)) continue;
      if (segmentIntersects(polygon[first], polygon[first + 1], polygon[second], polygon[second + 1])) {
        return `${name} has self-intersecting geometry`;
      }
    }
  }
  return null;
}

function polygonMetric(polygon: Coordinate[]): CzPolygonMetric {
  const latitudes = polygon.map((coordinate) => coordinate[1]);
  const longitudes = polygon.map((coordinate) => coordinate[0]);
  const meanLatitude = latitudes.reduce((sum, latitude) => sum + latitude, 0) / latitudes.length;
  let areaDegrees = 0;
  for (let index = 0; index < polygon.length - 1; index += 1) areaDegrees += polygon[index][0] * polygon[index + 1][1] - polygon[index + 1][0] * polygon[index][1];
  const longitudeKm = 111.320 * Math.cos(meanLatitude * Math.PI / 180);
  const maxSegmentKm = polygon.slice(1).reduce((maximum, coordinate, index) => {
    const start = polygon[index];
    const latitudeDelta = (coordinate[1] - start[1]) * Math.PI / 180;
    const longitudeDelta = (coordinate[0] - start[0]) * Math.PI / 180;
    const startLatitude = start[1] * Math.PI / 180;
    const endLatitude = coordinate[1] * Math.PI / 180;
    const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    const distance = 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, haversine)));
    return Math.max(maximum, distance);
  }, 0);
  return {
    vertexCount: polygon.length,
    areaSquareKm: Math.abs(areaDegrees / 2) * longitudeKm * 110.574,
    maxSegmentKm,
    boundingBox: {
      west: Math.min(...longitudes),
      south: Math.min(...latitudes),
      east: Math.max(...longitudes),
      north: Math.max(...latitudes),
    },
  };
}

function polygonMetrics(polygons: Coordinate[][]): CzPolygonMetric[] {
  return polygons.map(polygonMetric);
}

function skippedClassification(row: ParsedRow): CzEaipDiagnosticClassification {
  if (row.skipReason === "unsupported airspace object type") return "unsupported";
  if (row.skipReason === "aggregate sector row; constituent sectors are imported separately") return "aggregate";
  if (row.missingStableId && row.skipReason === CZ_EAIP_MISSING_ID_REASON) {
    return classifyMissingCzEaipStableId({ name: row.name, objectType: row.objectType, annotationParams: row.annotationParams });
  }
  return "parser_blocker";
}

function publicationName(publication: CzPublicationMetadata): string {
  const amendments = [publication.aipAmendment ? `AIP AMDT ${publication.aipAmendment}` : null, publication.airacAmendment ? `AIRAC AIP AMDT ${publication.airacAmendment}` : null].filter(Boolean);
  return `AIM ŘLP ČR eAIP ENR 2.1${amendments.length ? ` — ${amendments.join("; ")}` : ""}`;
}

function extractEffectiveDate($: CheerioAPI): string {
  const effective = parseDateParts(metadataValue($, "EM.effectiveDateStart"));
  if (!validIsoDate(effective)) throw new CzEaipParseError(["ENR 2.1 is missing a valid EM.effectiveDateStart metadata value"]);
  return effective;
}

function parseRows($: CheerioAPI): ParsedRow[] {
  const table = $("table").filter((_, candidate) => /Lateral limits/i.test(normalizedText($(candidate).find("th").first().text()))).first();
  if (!table.length) throw new CzEaipParseError(["ENR 2.1 operational airspace table was not found"]);
  return table.find("tbody > tr").toArray().map((row) => parseRow($, $(row))).filter((row): row is ParsedRow => row !== null);
}

/**
 * Resolve only explicitly referenced geometry rows that live outside the
 * operational table. They remain geometry-only helpers and are never added to
 * the import document or its diagnostics.
 */
function parseReferencedRows($: CheerioAPI, primaryRows: ParsedRow[]): ParsedRow[] {
  const primaryNames = new Set(primaryRows.map((row) => row.name));
  const pending = new Set(primaryRows.flatMap((row) => [
    ...row.boundary.lateralReferenceCandidates,
    ...row.boundary.constituentReferences,
  ]));
  const parsed = new Map<string, ParsedRow>();
  const sourceRows = $("tr").toArray();
  while (pending.size) {
    const requested = new Set(pending);
    pending.clear();
    for (const rowNode of sourceRows) {
      const first = $(rowNode).children("td").first();
      const name = normalizedText(first.find("strong .SD").first().text());
      if (!name || primaryNames.has(name) || !requested.has(name) || parsed.has(name)) continue;
      const row = parseRow($, $(rowNode), true);
      if (!row) continue;
      parsed.set(row.name, row);
      for (const reference of [...row.boundary.lateralReferenceCandidates, ...row.boundary.constituentReferences]) {
        if (!primaryNames.has(reference) && !parsed.has(reference)) pending.add(reference);
      }
    }
  }
  return [...parsed.values()];
}

function sameAltitude(left: ImportAltitude | null, right: ImportAltitude | null): boolean {
  return left === right;
}

/**
 * Some AIP aggregate rows carry the common vertical limits while a concrete
 * PART row omits them. Inherit only a unanimous complete limit pair from the
 * aggregate's explicitly named concrete siblings; never infer from sector
 * names or from unrelated rows.
 */
function inheritLogicalVerticalLimits(rows: ParsedRow[]): void {
  const byName = new Map(rows.map((row) => [row.name, row]));
  for (const aggregate of rows.filter((row) => row.boundary.constituentReferences.length > 0)) {
    const parts = aggregate.boundary.constituentReferences
      .map((reference) => byName.get(reference))
      .filter((row): row is ParsedRow => row !== undefined);
    const completeParts = parts.filter((part) => part.lowerAltitude !== null && part.upperAltitude !== null);
    if (!completeParts.length) continue;
    const reference = completeParts[0];
    if (!completeParts.every((part) => sameAltitude(part.lowerAltitude, reference.lowerAltitude) && sameAltitude(part.upperAltitude, reference.upperAltitude))) continue;
    for (const part of parts) {
      part.lowerAltitude ??= reference.lowerAltitude;
      part.upperAltitude ??= reference.upperAltitude;
    }
  }
}

export function parseCzEaipEnr21(html: string, options: { publicationHtml?: string; lastVerifiedAt?: string; boundaryResolver?: BoundaryResolver } = {}): CzEaipParseResult {
  const $ = load(html, { xmlMode: true });
  const effectiveDate = extractEffectiveDate($);
  const publicationDate = parseDateParts(metadataValue($, "DC.date"));
  const publicationFromGen02 = options.publicationHtml ? parseCzPublicationMetadata(options.publicationHtml) : { aipAmendment: null, airacAmendment: null, effectiveDate: null };
  if (publicationFromGen02.effectiveDate && publicationFromGen02.effectiveDate !== effectiveDate) {
    throw new CzEaipParseError([
      `ENR 2.1 effective date ${effectiveDate} does not match GEN 0.2 effective date ${publicationFromGen02.effectiveDate}`,
    ]);
  }
  const publication: CzPublicationMetadata = {
    ...publicationFromGen02,
    effectiveDate: publicationFromGen02.effectiveDate ?? effectiveDate,
  };
  const rows = parseRows($);
  const referencedRows = parseReferencedRows($, rows);
  const allRows = [...rows, ...referencedRows];
  const classification = { ACC_OPERATIONAL_SECTOR: 0, FIC_SECTOR: 0, TMA: 0, CTA: 0, CTR: 0, OTHER: 0 } satisfies Record<CzAtcObjectType, number>;
  for (const row of rows) classification[row.objectType] += 1;
  const accRows = rows.filter((row) => row.objectType === "ACC_OPERATIONAL_SECTOR");
  if (!accRows.length) throw new CzEaipParseError(["No PRAHA ACC operational sector rows were found"]);
  const candidateRows = rows.filter((row) => importableObjectType(row.objectType));
  inheritLogicalVerticalLimits(candidateRows);
  for (const row of allRows) {
    try {
      assembleBoundary(row.boundary, row.name, options.boundaryResolver);
    } catch (error) {
      if (!(error instanceof CzEaipParseError)) throw error;
      row.boundaryError = error.issues.join("; ");
      row.skipReason = row.boundaryError;
    }
  }
  resolveLateralReferences(allRows);
  const diagnostics: CzEaipSectorDiagnostic[] = [];
  const accepted: AtcImportSector[] = [];
  const lastVerifiedAt = options.lastVerifiedAt ?? new Date().toISOString();
  const sourceName = `${publicationName(publication)}${options.boundaryResolver ? " + authoritative boundary geometry" : ""}`;

  for (const row of rows) {
    if (!importableObjectType(row.objectType)) {
      diagnostics.push({ name: row.name, stableId: row.stableId, objectType: row.objectType, status: "skipped", classification: "unsupported", reason: "unsupported airspace object type" });
      continue;
    }
    if (!row.skipReason) {
      if (row.boundary.constituentReferences.length) {
        row.skipReason = "aggregate sector row; constituent sectors are imported separately";
      } else if (row.boundary.borderSegments.length && !options.boundaryResolver) {
        row.skipReason = `state-border segment requires authoritative geometry (${row.boundary.borderNames.join(", ")})`;
      } else if (!row.boundary.directGeometry) {
        row.skipReason = "missing explicit or resolvable lateral geometry";
      }
    }
    if (!row.skipReason && row.lowerAltitude === null) row.skipReason = "missing lower vertical limit";
    if (!row.skipReason && row.upperAltitude === null) row.skipReason = "missing upper vertical limit";
    if (!row.skipReason && row.primaryFrequencyMhz === null) row.skipReason = "missing primary frequency";
    if (!row.skipReason) {
      const geometryIssue = row.boundary.polygons.map((polygon) => validatePolygon(row.name, polygon)).find((issue): issue is string => issue !== null);
      if (geometryIssue) row.skipReason = geometryIssue;
    }
    if (!row.skipReason && row.missingStableId) row.skipReason = CZ_EAIP_MISSING_ID_REASON;
    if (row.skipReason) {
      diagnostics.push({ name: row.name, stableId: row.stableId, objectType: row.objectType, status: "skipped", classification: skippedClassification(row), reason: row.skipReason, boundaryError: row.boundaryError, boundaryResolutions: row.boundary.boundaryResolutions, polygonMetrics: polygonMetrics(row.boundary.polygons) });
      continue;
    }
    accepted.push({
      id: row.stableId!,
      name: row.name,
      atcCallsign: row.callsign,
      service: serviceForObjectType(row.objectType, row.unit),
      country: "CZ",
      polygons: row.boundary.polygons,
      lowerAltitude: row.lowerAltitude,
      upperAltitude: row.upperAltitude,
      primaryFrequencyMhz: row.primaryFrequencyMhz,
      alternateFrequencies: row.frequencies.filter((frequency) => frequency.frequencyMhz !== row.primaryFrequencyMhz || frequency.label === "Reserve"),
    });
    diagnostics.push({ name: row.name, stableId: row.stableId, objectType: row.objectType, status: "accepted", classification: "persistable", boundaryResolutions: row.boundary.boundaryResolutions, polygonMetrics: polygonMetrics(row.boundary.polygons) });
  }

  if (!accepted.length) throw new CzEaipParseError(["No valid importable ATC sector geometry was produced", ...candidateRows.map((row) => `${row.name}: ${row.skipReason ?? "unknown parser rejection"}`)]);
  const skipped = diagnostics.filter((diagnostic) => diagnostic.status === "skipped").length;
  const sourceLimitedRows = diagnostics.filter((diagnostic) => diagnostic.classification === "source_limitation").length;
  const blockingSupportedRows = diagnostics.filter((diagnostic) => diagnostic.classification === "parser_blocker").length;
  return {
    document: {
      schemaVersion: 1,
      source: { name: sourceName, reference: options.boundaryResolver ? CZ_ATC_SOURCE_REFERENCE : CZ_EAIP_ENR21_URL, effectiveDate, lastVerifiedAt },
      sectors: accepted,
      transmitters: [],
    },
    publication,
    effectiveDate,
    publicationDate,
    diagnostics,
    counts: { accOperationalDetected: accRows.length, valid: accepted.length, skipped, sourceLimitedRows, blockingSupportedRows, classification },
  };
}

interface ParsedCommunicationFrequency {
  frequencyMhz: number;
  label: string | null;
  priority: number;
  order: number;
}

interface ParsedCommunicationGroup {
  service: string;
  callsign: string | null;
  frequencies: ParsedCommunicationFrequency[];
  order: number;
}

function communicationFrequencyLabel(value: string): string | null {
  const normalized = normalizedText(value).toUpperCase();
  if (normalized.includes("EMERGENCY")) return "Emergency";
  if (normalized.includes("SUPPLEMENTARY")) return "Supplementary";
  return null;
}

function communicationFrequencyPriority(rowText: string, label: string | null): number {
  if (label === "Emergency") return 100;
  if (/\bH24\b/.test(rowText)) return 0;
  if (label === "Supplementary") return 2;
  if (/\b(?:HO|HX)\b/.test(rowText)) return 1;
  return 3;
}

/** Reads the row-spanned AD 2.18 table without guessing which service owns a frequency. */
function parseCommunicationGroups($: CheerioAPI, table: Parameters<CheerioAPI>[0]): ParsedCommunicationGroup[] {
  const groups = new Map<string, ParsedCommunicationGroup>();
  let currentService: string | null = null;
  let currentCallsign: string | null = null;
  let order = 0;
  for (const row of $(table).find("tbody > tr").toArray()) {
    const rowNode = $(row);
    const tokens = sourceTokens($, rowNode);
    const service = tokens.find((token) => token.param.startsWith("TSERVICE;CODE_TYPE;"))?.value ?? null;
    if (service) currentService = service;
    const callsign = tokens.find((token) => token.param.startsWith("TCALLSIGN_DETAIL;TXT_CALL_SIGN;"))?.value ?? null;
    if (callsign) currentCallsign = callsign;
    const frequencyTokens = tokensForKey(tokens, "VAL_FREQ_TRANS", "TFREQUENCY");
    if (!currentService || !frequencyTokens.length) continue;
    const serviceKey = normalizedText(currentService).toUpperCase();
    const callsignKey = normalizedText(currentCallsign ?? "").toUpperCase();
    const key = `${serviceKey}|${callsignKey}`;
    let group = groups.get(key);
    if (!group) {
      group = { service: currentService, callsign: currentCallsign, frequencies: [], order: order++ };
      groups.set(key, group);
    }
    const rowText = normalizedText(rowNode.text()).toUpperCase();
    for (const token of frequencyTokens) {
      const frequencyMhz = Number(token.value.replace(",", "."));
      if (!isSupportedAtcFrequencyMhz(frequencyMhz)) continue;
      const id = paramValue(token.param);
      const codeType = id === null
        ? null
        : tokens.find((candidate) => candidate.param === `TFREQUENCY;CODE_TYPE;${id}`)?.value ?? null;
      const label = communicationFrequencyLabel(`${codeType ?? ""} ${rowText}`);
      if (label === "Emergency") continue;
      if (!group.frequencies.some((item) => item.frequencyMhz === frequencyMhz)) {
        group.frequencies.push({ frequencyMhz, label, priority: communicationFrequencyPriority(rowText, label), order: group.frequencies.length });
      }
    }
  }
  return [...groups.values()];
}

function chooseCommunicationGroup(groups: ParsedCommunicationGroup[]): ParsedCommunicationGroup | null {
  return groups
    .filter((group) => group.frequencies.length > 0)
    .sort((left, right) => {
      const servicePriority = (value: string): number => /^(TWR|TOWER)$/i.test(normalizedText(value)) ? 0 : /^(APP|APPROACH)$/i.test(normalizedText(value)) ? 1 : 2;
      return servicePriority(left.service) - servicePriority(right.service)
        || (left.callsign ?? "").localeCompare(right.callsign ?? "")
        || left.order - right.order;
    })[0] ?? null;
}

function stableAd2AirspaceId(airportIcao: string, name: string): string {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `CZ-${airportIcao}-${slug}`;
}

/** Parses one official civil AD 2.17/2.18 page into a single CTR sector. */
export function parseCzEaipAd2AtcAirspace(html: string, options: { lastVerifiedAt?: string } = {}): CzAd2AtcParseResult {
  const $ = load(html, { xmlMode: true });
  const section = $("div[id$='-AD-2.17']").first();
  const communicationSection = $("div[id$='-AD-2.18']").first();
  if (!section.length || !communicationSection.length) throw new CzEaipParseError(["AD 2.17/2.18 ATS airspace or communication section was not found"]);
  const sectionId = section.attr("id") ?? "";
  const airportIcao = /^([A-Z0-9]{4})-AD-2\.17$/i.exec(sectionId)?.[1]?.toUpperCase();
  if (!airportIcao) throw new CzEaipParseError([`AD 2.17 has no stable aerodrome identifier: ${sectionId || "missing id"}`]);
  const effectiveDate = extractEffectiveDate($);
  const sourceReference = `${CZ_EAIP_AD2_URL.replace("{icao}", airportIcao)}#${airportIcao}-AD-2.17 | ${CZ_EAIP_AD2_URL.replace("{icao}", airportIcao)}#${airportIcao}-AD-2.18`;
  const table = section.find("table").first();
  const rows = table.find("tbody > tr").toArray();
  const designationRow = rows.find((row) => /Designation and lateral limits/i.test(normalizedText($(row).children("td").eq(1).text())));
  const verticalRow = rows.find((row) => /Vertical limits/i.test(normalizedText($(row).children("td").eq(1).text())));
  const callsignRow = rows.find((row) => /ATS unit call sign/i.test(normalizedText($(row).children("td").eq(1).text())));
  const designationCell = designationRow ? $(designationRow).children("td").eq(2) : null;
  const name = designationCell ? normalizedText(designationCell.find("strong .SD").first().text()) : "";
  if (!designationCell || !name) throw new CzEaipParseError([`${airportIcao} AD 2.17 is missing the ATS airspace designation`]);
  if (!/^CTR\s/i.test(name)) throw new CzEaipParseError([`${airportIcao} AD 2.17 does not publish a civil CTR designation: ${name}`]);
  const boundary = parseBoundary($, designationCell);
  try {
    assembleBoundary(boundary, name);
  } catch (error) {
    throw error instanceof CzEaipParseError ? error : new CzEaipParseError([String(error)]);
  }
  const vertical = verticalRow ? parseVerticalLimits($, $(verticalRow).children("td").eq(2)) : { lower: null, upper: null };
  const groups = chooseCommunicationGroup(parseCommunicationGroups($, communicationSection.find("table").first()));
  const callsigns = callsignRow
    ? sourceTokens($, $(callsignRow).children("td").eq(2)).filter((token) => token.param.startsWith("TCALLSIGN_DETAIL;")).map((token) => token.value)
    : [];
  const callsign = callsigns.find((value) => /\b(?:TOWER|TWR)\b/i.test(value)) ?? groups?.callsign ?? callsigns[0] ?? null;
  const orderedFrequencies = groups?.frequencies.slice().sort((left, right) => left.priority - right.priority || left.order - right.order) ?? [];
  const primary = orderedFrequencies[0] ?? null;
  const skipReason = !boundary.polygons.length
    ? "missing valid lateral geometry"
    : vertical.lower === null
      ? "missing lower vertical limit"
      : vertical.upper === null
        ? "missing upper vertical limit"
        : !primary
          ? "missing civil ATS frequency"
          : boundary.polygons.map((polygon) => validatePolygon(name, polygon)).find((issue): issue is string => issue !== null) ?? null;
  const diagnostic: CzEaipSectorDiagnostic = {
    name,
    stableId: stableAd2AirspaceId(airportIcao, name),
    objectType: "CTR",
    status: skipReason ? "skipped" : "accepted",
    classification: skipReason ? "parser_blocker" : "persistable",
    ...(skipReason ? { reason: skipReason } : {}),
    polygonMetrics: polygonMetrics(boundary.polygons),
  };
  if (skipReason) return {
    diagnostic,
    document: { schemaVersion: 1, source: { name: `AIM ŘLP ČR eAIP AD 2-${airportIcao}`, reference: sourceReference, effectiveDate, lastVerifiedAt: options.lastVerifiedAt ?? new Date().toISOString() }, sectors: [], transmitters: [] },
  };
  return {
    diagnostic,
    document: {
      schemaVersion: 1,
      source: { name: `AIM ŘLP ČR eAIP AD 2-${airportIcao}`, reference: sourceReference, effectiveDate, lastVerifiedAt: options.lastVerifiedAt ?? new Date().toISOString() },
      sectors: [{
        id: stableAd2AirspaceId(airportIcao, name),
        name,
        atcCallsign: callsign,
        service: "TWR",
        country: "CZ",
        polygons: boundary.polygons,
        lowerAltitude: vertical.lower,
        upperAltitude: vertical.upper,
        primaryFrequencyMhz: primary.frequencyMhz,
        alternateFrequencies: orderedFrequencies.slice(1).map((frequency) => ({ frequencyMhz: frequency.frequencyMhz, label: frequency.label })),
        sourceReference,
        validFrom: effectiveDate,
      }],
      transmitters: [],
    },
  };
}

export function mergeCzAd2AtcResults(result: CzEaipParseResult, additional: CzAd2AtcParseResult[]): CzEaipParseResult {
  for (const item of additional) {
    const effectiveDate = item.document.source.effectiveDate;
    if (effectiveDate !== result.effectiveDate) {
      throw new CzEaipParseError([`AD 2 effective date ${effectiveDate} does not match ENR 2.1 effective date ${result.effectiveDate}`]);
    }
  }
  const diagnostics = [...result.diagnostics, ...additional.map((item) => item.diagnostic)];
  const sectors = [...result.document.sectors, ...additional.flatMap((item) => item.document.sectors)];
  const sourceReferences = [result.document.source.reference, ...additional.map((item) => item.document.source.reference)];
  const classification = { ...result.counts.classification };
  classification.CTR += additional.length;
  return {
    ...result,
    document: { ...result.document, source: { ...result.document.source, reference: sourceReferences.join(" | ") }, sectors },
    diagnostics,
    counts: {
      ...result.counts,
      valid: result.counts.valid + sectors.length - result.document.sectors.length,
      skipped: result.counts.skipped + additional.filter((item) => item.diagnostic.status === "skipped").length,
      sourceLimitedRows: result.counts.sourceLimitedRows + additional.filter((item) => item.diagnostic.classification === "source_limitation").length,
      blockingSupportedRows: result.counts.blockingSupportedRows + additional.filter((item) => item.diagnostic.classification === "parser_blocker").length,
      classification,
    },
  };
}

function assertOfficialUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== AUTHORITATIVE_HOST) throw new Error(`Refusing non-authoritative Czech eAIP URL: ${url}`);
}

export async function fetchOfficialCzEaip(url: string): Promise<string> {
  assertOfficialUrl(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": getAirRadarUserAgent("Czech-eAIP-sync") } });
  if (!response.ok) throw new Error(`Official eAIP request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("Official eAIP response exceeds the safety size limit");
  return new TextDecoder().decode(bytes);
}

export async function fetchCurrentCzEaip(): Promise<{ enr21Html: string; publicationHtml: string; ad2Html: Array<{ airportIcao: string; html: string }> }> {
  const [enr21Html, publicationHtml, ...ad2Html] = await Promise.all([
    fetchOfficialCzEaip(CZ_EAIP_ENR21_URL),
    fetchOfficialCzEaip(CZ_EAIP_GEN02_URL),
    ...CZ_CIVIL_CONTROLLED_AERODROMES.map(async (airportIcao) => ({ airportIcao, html: await fetchOfficialCzEaip(CZ_EAIP_AD2_URL.replace("{icao}", airportIcao)) })),
  ]);
  return { enr21Html, publicationHtml, ad2Html };
}
