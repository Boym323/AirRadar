import { load, type CheerioAPI } from "cheerio";
import type { AtcImportDocument, AtcImportFrequency, AtcImportSector, ImportAltitude } from "./import-format";
import type { Coordinate } from "./types";
import { BKG_VG25_ATTRIBUTION, BKG_VG25_WFS_URL } from "./bkg-boundary";
import { type BoundaryResolver, type StateBoundaryReference } from "./boundary-resolver";
import { CZ_CUZK_DATA50_METADATA_URL, CZ_CUZK_DATA50_QUERY_URL, type StateBoundaryResolution } from "./cz-boundary";
import { aviationCoordinateToDecimal, densifyArc, type ArcDirection } from "./cz-geometry";

export const CZ_EAIP_ENR21_URL = "https://aim.rlp.cz/eaip/html/eAIP/LK-ENR-2.1-en-GB.html";
export const CZ_EAIP_GEN02_URL = "https://aim.rlp.cz/ais_data/aip/data/valid/g0-2.html";
export const CZ_ATC_SOURCE_REFERENCE = `${CZ_EAIP_ENR21_URL} | Czech boundary geometry: ${CZ_CUZK_DATA50_QUERY_URL} | metadata: ${CZ_CUZK_DATA50_METADATA_URL} | Germany–Poland boundary geometry: ${BKG_VG25_WFS_URL} (${BKG_VG25_ATTRIBUTION})`;
const AUTHORITATIVE_HOST = "aim.rlp.cz";
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export type CzAtcObjectType = "ACC_OPERATIONAL_SECTOR" | "FIC_SECTOR" | "TMA" | "CTA" | "OTHER";

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
    classification: Record<CzAtcObjectType, number>;
  };
}

export class CzEaipParseError extends Error {
  constructor(readonly issues: string[]) {
    super(`Czech eAIP ENR 2.1 parse failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
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
  center: Coordinate;
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
  if (!radiusToken || !centerLatitude || !centerLongitude) throw new CzEaipParseError([`Arc ${directionToken.value} is missing radius or center`]);
  const radiusNm = Number(radiusToken.value);
  if (!Number.isFinite(radiusNm) || radiusNm <= 0) throw new CzEaipParseError([`Arc ${directionToken.value} has invalid radius ${radiusToken.value}`]);
  try {
    return {
      direction: directionToken.value.toUpperCase() as ArcDirection,
      radiusNm,
      center: [aviationCoordinateToDecimal(centerLongitude.value), aviationCoordinateToDecimal(centerLatitude.value)],
    };
  } catch (error) {
    throw new CzEaipParseError([error instanceof Error ? error.message : String(error)]);
  }
}

function parseBoundary($: CheerioAPI, cell: Parameters<CheerioAPI>[0]): ParsedBoundary {
  const cellText = normalizedText($(cell).text());
  const references = $(cell).find(".SD").map((_, element) => normalizedText($(element).text())).get().filter((value) => /^SECTOR /.test(value));
  const name = $(cell).find("strong .SD").first().text().trim();
  const uniqueReferences = [...new Set(references.filter((value) => value !== name))];
  const lateralReference = /lateral limits same as/i.test(cellText) ? uniqueReferences[0] ?? null : null;
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
  let pendingArc: ArcEvent | null = null;
  let pendingBorder: StateBoundaryEvent | null = null;
  const resolutions: StateBoundaryResolution[] = [];
  for (const event of boundary.events) {
    if (event.kind === "coordinate") {
      if (pendingArc) {
        const start = coordinates.at(-1);
        if (!start) throw new CzEaipParseError([`Arc in ${name || "unnamed airspace"} has no start point`]);
        appendUniqueCoordinates(coordinates, densifyArc({ start, end: event.coordinate, ...pendingArc }).slice(1));
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
    if (!Number.isFinite(value)) return [];
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
  if (normalizedName.startsWith("TMA") || normalizedName.startsWith("MTMA")) return "TMA";
  if (normalizedName.startsWith("CTA")) return "CTA";
  return "OTHER";
}

function stableId($: CheerioAPI, cell: Parameters<CheerioAPI>[0]): string | null {
  const values = $(cell).find(".SD").map((_, element) => normalizedText($(element).text())).get();
  const official = values.find((value) => /^LKAA[A-Z0-9]+$/.test(value));
  if (official) return official;
  const sourceObject = $(cell).find(".sdParams").map((_, element) => normalizedText($(element).text())).get().find((param) => param.startsWith("TAIRSPACE;TXT_NAME;"));
  const numeric = sourceObject ? paramValue(sourceObject) : null;
  return numeric ? `LKAA-AIP-${numeric}` : null;
}

function parseRow($: CheerioAPI, rowNode: Parameters<CheerioAPI>[0]): ParsedRow | null {
  const cells = $(rowNode).children("td").toArray();
  if (cells.length < 4) return null;
  const first = $(cells[0]);
  const name = normalizedText(first.find("strong .SD").first().text());
  if (!name) return null;
  const unit = sourceValue($, $(cells[1]), "TUNIT", "TXT_NAME") ?? (normalizedText($(cells[1]).text()).split(";")[0] || null);
  const callsign = sourceValue($, $(cells[2]), "TCALLSIGN_DETAIL", "TXT_CALL_SIGN") ?? null;
  const objectType = classifyRow(name, unit, callsign);
  const boundary = parseBoundary($, first);
  const vertical = parseVerticalLimits($, first);
  const parsedFrequencies = parseFrequencies($, $(rowNode));
  const id = stableId($, first);
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
  };
  if (objectType === "ACC_OPERATIONAL_SECTOR" && !id) parsedRow.skipReason = "missing stable source identifier";
  return parsedRow;
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
  const classification = { ACC_OPERATIONAL_SECTOR: 0, FIC_SECTOR: 0, TMA: 0, CTA: 0, OTHER: 0 } satisfies Record<CzAtcObjectType, number>;
  for (const row of rows) classification[row.objectType] += 1;
  const accRows = rows.filter((row) => row.objectType === "ACC_OPERATIONAL_SECTOR");
  if (!accRows.length) throw new CzEaipParseError(["No PRAHA ACC operational sector rows were found"]);
  inheritLogicalVerticalLimits(accRows);
  for (const row of accRows) {
    try {
      assembleBoundary(row.boundary, row.name, options.boundaryResolver);
    } catch (error) {
      if (!(error instanceof CzEaipParseError)) throw error;
      row.boundaryError = error.issues.join("; ");
      row.skipReason = row.boundaryError;
    }
  }
  const byName = new Map(accRows.map((row) => [row.name, row]));
  const diagnostics: CzEaipSectorDiagnostic[] = [];
  const accepted: AtcImportSector[] = [];
  const lastVerifiedAt = options.lastVerifiedAt ?? new Date().toISOString();
  const sourceName = `${publicationName(publication)}${options.boundaryResolver ? " + authoritative boundary geometry" : ""}`;

  for (const row of accRows) {
    if (!row.skipReason) {
      if (row.boundary.constituentReferences.length) {
        row.skipReason = "aggregate sector row; constituent sectors are imported separately";
      } else if (row.boundary.borderSegments.length && !options.boundaryResolver) {
        row.skipReason = `state-border segment requires authoritative geometry (${row.boundary.borderNames.join(", ")})`;
      } else if (!row.boundary.directGeometry && row.boundary.lateralReference) {
        const target = byName.get(row.boundary.lateralReference);
        if (!target) row.skipReason = `lateral geometry reference not found: ${row.boundary.lateralReference}`;
        else if (target.boundaryError) {
          row.boundaryError = `Referenced sector ${row.boundary.lateralReference} is blocked: ${target.boundaryError}`;
          row.skipReason = `lateral geometry reference is blocked: ${row.boundary.lateralReference}`;
        }
        else if (!target.boundary.directGeometry) row.skipReason = `lateral geometry reference is unsupported: ${row.boundary.lateralReference}`;
        else {
          row.boundary.polygons = target.boundary.polygons;
          row.boundary.boundaryResolutions = target.boundary.boundaryResolutions;
        }
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
    if (row.skipReason) {
      diagnostics.push({ name: row.name, stableId: row.stableId, objectType: row.objectType, status: "skipped", reason: row.skipReason, boundaryError: row.boundaryError, boundaryResolutions: row.boundary.boundaryResolutions, polygonMetrics: polygonMetrics(row.boundary.polygons) });
      continue;
    }
    accepted.push({
      id: row.stableId!,
      name: row.name,
      atcCallsign: row.callsign,
      service: "ACC",
      country: "CZ",
      polygons: row.boundary.polygons,
      lowerAltitude: row.lowerAltitude,
      upperAltitude: row.upperAltitude,
      primaryFrequencyMhz: row.primaryFrequencyMhz,
      alternateFrequencies: row.frequencies.filter((frequency) => frequency.frequencyMhz !== row.primaryFrequencyMhz || frequency.label === "Reserve"),
    });
    diagnostics.push({ name: row.name, stableId: row.stableId, objectType: row.objectType, status: "accepted", boundaryResolutions: row.boundary.boundaryResolutions, polygonMetrics: polygonMetrics(row.boundary.polygons) });
  }

  if (!accepted.length) throw new CzEaipParseError(["No valid PRAHA ACC operational sector geometry was produced", ...accRows.map((row) => `${row.name}: ${row.skipReason ?? "unknown parser rejection"}`)]);
  const skipped = diagnostics.filter((diagnostic) => diagnostic.status === "skipped").length;
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
    counts: { accOperationalDetected: accRows.length, valid: accepted.length, skipped, classification },
  };
}

function assertOfficialUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== AUTHORITATIVE_HOST) throw new Error(`Refusing non-authoritative Czech eAIP URL: ${url}`);
}

export async function fetchOfficialCzEaip(url: string): Promise<string> {
  assertOfficialUrl(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "AirRadar Czech eAIP sync/1.0" } });
  if (!response.ok) throw new Error(`Official eAIP request failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("Official eAIP response exceeds the safety size limit");
  return new TextDecoder().decode(bytes);
}

export async function fetchCurrentCzEaip(): Promise<{ enr21Html: string; publicationHtml: string }> {
  const [enr21Html, publicationHtml] = await Promise.all([fetchOfficialCzEaip(CZ_EAIP_ENR21_URL), fetchOfficialCzEaip(CZ_EAIP_GEN02_URL)]);
  return { enr21Html, publicationHtml };
}
