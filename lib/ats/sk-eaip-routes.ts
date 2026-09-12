import { load, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { aviationCoordinateToDecimal } from "@/lib/atc/cz-geometry";
import type { CzAtsRoute, CzAtsRouteDocument, CzAtsRoutePoint, CzAtsRouteSegment } from "./cz-eaip-routes";

const POINT = /(\d{6}[NS])\s+(\d{7}[EW])/i;
const ROUTE = /^[A-Z]{1,2}\d{1,4}[A-Z]?$/;

function text(value: string): string { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function number(value: string): number | null { const n = Number(value.replace(/,/g, ".").replace(/[^0-9.+-]/g, "")); return Number.isFinite(n) ? n : null; }
function pointFromRow($: CheerioAPI, row: Element): CzAtsRoutePoint | null {
  const value = text($(row).text());
  const match = POINT.exec(value);
  if (!match) return null;
  const cells = $(row).find("td").toArray().map((cell) => text($(cell).text()));
  const name = cells.find((cell) => cell && !POINT.test(cell) && !/\(FIR BDRY\)/i.test(cell))?.replace(/\(FIR BDRY\)/i, "").trim();
  if (!name) return null;
  try {
    return { id: `DP:${name.toUpperCase()}`, sourceId: name.toUpperCase(), name: name.toUpperCase(), kind: "DESIGNATED_POINT", latitude: aviationCoordinateToDecimal(match[1]), longitude: aviationCoordinateToDecimal(match[2]), foreignMaintainer: null, remarks: /For continuation/i.test(value) ? value : null };
  } catch { return null; }
}

function parseSegment(route: CzAtsRoute, from: CzAtsRoutePoint, to: CzAtsRoutePoint, metadata: string, sequence: number): CzAtsRouteSegment {
  const distance = /([\d,]+)\s*NM/i.exec(metadata)?.[1];
  const limits = [...metadata.matchAll(/\b(FL\s*\d{1,3}|\d[\d ]*\s*ft\s*AMSL|UNL|SFC|GND)\b/gi)].map((m) => text(m[1]).toUpperCase());
  const tracks = /([\d-]+)\s*\/\s*([\d-]+)/.exec(metadata);
  return { id: `${route.designator}:${sequence}`, sourceId: `${route.designator}:${sequence}`, fromPointId: from.id, toPointId: to.id, fromName: from.name, toName: to.name, from: [from.longitude, from.latitude], to: [to.longitude, to.latitude], navigationSpecification: /RNAV\s*\d/i.exec(metadata)?.[0] ?? "CONVENTIONAL", magTrackForwardDeg: tracks?.[1] && tracks[1] !== "-" ? number(tracks[1]) : null, magTrackReverseDeg: tracks?.[2] && tracks[2] !== "-" ? number(tracks[2]) : null, distanceNm: number(distance ?? "") ?? 0, geometricDistanceNm: number(distance ?? "") ?? 0, upperLimit: limits[0] ?? null, lowerLimit: limits[1] ?? null, lowerOverride: null, cruisingLevelForward: /\bOdd\b/i.test(metadata) ? "ODD" : /\bEven\b/i.test(metadata) ? "EVEN" : null, cruisingLevelReverse: null, availabilityClass: /CDR\s*([123])/i.exec(metadata)?.[1] ? `CDR${/CDR\s*([123])/i.exec(metadata)![1]}` as "CDR1" | "CDR2" | "CDR3" : null, availabilityStatus: "UNKNOWN", remarks: /For continuation[^.]*\.?/i.exec(metadata)?.[0] ?? null };
}

/** Parses the LPS SR EUROCONTROL eAIP table layout used by ENR 3.1 and 3.2. */
export function parseSkEaipRoutes(html: string, section: "ENR 3.1" | "ENR 3.2", sourceReference: string, effectiveDate: string): CzAtsRouteDocument {
  const $ = load(html);
  const routes: CzAtsRoute[] = [];
  $("tbody").each((_table, body) => {
    let route: CzAtsRoute | undefined;
    let points: CzAtsRoutePoint[] = [];
    let metadata = "";
    $(body).find("tr").each((_index, row) => {
      const rowId = $(row).attr("row_id") ?? "";
      const cells = $(row).find("td").toArray().map((cell) => text($(cell).text()));
      if (rowId.startsWith("ROUTE_1of3_")) {
        const designator = cells.find((cell) => ROUTE.test(cell));
        if (route && route.points.length > 1) routes.push(route);
        route = designator ? { designator, sourceId: designator, points: [], segments: [], discontinuities: [] } : undefined;
        points = []; metadata = "";
      } else if (route && rowId.startsWith("ROUTE_3of3_")) {
        const continuation = text($(row).text());
        if (/For continuation/i.test(continuation) && points.length) points.at(-1)!.remarks = continuation;
      } else if (route && rowId.startsWith("SEGMENT_1of3_")) {
        const current = pointFromRow($, row);
        if (current) { if (points.length) route.segments.push(parseSegment(route, points.at(-1)!, current, metadata, route.segments.length + 1)); points.push(current); route.points = points; }
        metadata = "";
      } else if (route && rowId.startsWith("SEGMENT_2of3_")) metadata += ` ${text($(row).text())}`;
    });
    if (route !== undefined && route.points.length > 1) routes.push(route);
  });
  const unique = new Map<string, CzAtsRoute>();
  for (const route of routes) unique.set(`${route.designator}:${route.sourceId}`, route);
  const result = [...unique.values()];
  const points = result.reduce((sum, route) => sum + route.points.length, 0);
  const segments = result.reduce((sum, route) => sum + route.segments.length, 0);
  if (!result.length || !segments) throw new Error(`Slovak ${section} contained no valid route segments`);
  return { schemaVersion: 1, source: { name: "LPS SR eAIP", reference: sourceReference, effectiveDate, lastVerifiedAt: new Date().toISOString(), aipAmendment: null, airacAmendment: null, countryCode: "SK", provider: "LPS_SR_AIP", sections: [section] }, routes: result, counts: { routes: result.length, points, segments, cdrSegments: result.flatMap((r) => r.segments).filter((s) => s.availabilityClass !== null).length, discontinuities: 0 } };
}
