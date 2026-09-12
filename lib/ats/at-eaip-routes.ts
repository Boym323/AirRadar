import { aviationCoordinateToDecimal } from "@/lib/atc/cz-geometry";
import type { CzAtsPoint, CzAtsRoute, CzAtsRouteDocument, CzAtsSegment } from "./cz-routes";

const POINT = /(\S+)\s+(\d{2,3}\s+\d{2}\s+\d{2}(?:[.,]\d+)?[NS])\s+(\d{2,3}\s+\d{2}\s+\d{2}(?:[.,]\d+)?[EW])/g;
const NIL = /\bNIL\b/i;

function coordinate(value: string): [number, number] {
  const match = /(\d{2,3}\s+\d{2}\s+\d{2}(?:[.,]\d+)?[NS])\s+(\d{2,3}\s+\d{2}\s+\d{2}(?:[.,]\d+)?[EW])/.exec(value);
  if (!match) throw new Error(`Invalid Austrian ATS coordinate: ${value}`);
  return [aviationCoordinateToDecimal(match[2]), aviationCoordinateToDecimal(match[1])];
}

export interface AustrianAtsDiagnostic { section: "ENR 3.1" | "ENR 3.2" | "ENR 3.3"; status: "healthy-zero" | "parsed" | "rejected"; reason: string | null; }

export function parseAustrianEnr31Or33(text: string, section: "ENR 3.1" | "ENR 3.3"): { routes: CzAtsRoute[]; diagnostic: AustrianAtsDiagnostic } {
  if (NIL.test(text)) return { routes: [], diagnostic: { section, status: "healthy-zero", reason: null } };
  return { routes: [], diagnostic: { section, status: "rejected", reason: "non-NIL source requires the dedicated section parser" } };
}

export function parseAustrianEnr32(text: string, effectiveDate: string, sourceReference: string): { document: CzAtsRouteDocument; diagnostics: AustrianAtsDiagnostic[] } {
  const routes: CzAtsRoute[] = [];
  const routeMatches = [...text.matchAll(/(?:^|\s)([A-Z]\d{1,3}|\d[A-Z]\d{1,3})(?=\s+[^\n]{0,80}?\d{2,3}\s+\d{2}\s+\d{2})/g)];
  for (const routeMatch of routeMatches) {
    const start = routeMatch.index ?? 0;
    const end = routeMatches[routeMatches.indexOf(routeMatch) + 1]?.index ?? text.length;
    const block = text.slice(start, end);
    const designator = routeMatch[1];
    const points: CzAtsPoint[] = [];
    for (const match of block.matchAll(POINT)) {
      const name = match[1].replace(/^[^A-Z0-9]+/, "").slice(0, 40);
      if (!name || /^(Route|designator|Specification|Name)$/i.test(name)) continue;
      const [longitude, latitude] = coordinate(match[0]);
      points.push({ id: `AT-${designator}-${name}`, name, kind: "DESIGNATED_POINT", latitude, longitude, foreignMaintainer: null, remarks: null });
    }
    const unique = [...new Map(points.map((point) => [point.id, point])).values()];
    const segments: CzAtsSegment[] = unique.slice(1).map((point, index) => ({ id: `AT-${designator}-${index + 1}`, fromName: unique[index].name, toName: point.name, from: [unique[index].longitude, unique[index].latitude], to: [point.longitude, point.latitude], navigationSpecification: "RNAV", magTrackForwardDeg: null, magTrackReverseDeg: null, distanceNm: 0, upperLimit: "UNL", lowerLimit: "SFC", lowerOverride: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, availabilityStatus: "UNKNOWN", remarks: "Parsed from Austro Control ENR 3.2; source row metadata retained in source reference." }));
    if (unique.length > 1) routes.push({ designator, points: unique, segments, discontinuities: [] });
  }
  const uniqueRoutes = [...new Map(routes.map((route) => [route.designator, route])).values()];
  return { document: { schemaVersion: 1, source: { name: "Austro Control AIP", reference: sourceReference, effectiveDate, aipAmendment: null, airacAmendment: null, countryCode: "AT", provider: "AUSTRO_CONTROL", sections: ["ENR 3.2"] }, routes: uniqueRoutes, counts: { routes: uniqueRoutes.length, points: uniqueRoutes.reduce((sum, route) => sum + route.points.length, 0), segments: uniqueRoutes.reduce((sum, route) => sum + route.segments.length, 0), cdrSegments: 0, discontinuities: 0 } }, diagnostics: [{ section: "ENR 3.2", status: uniqueRoutes.length ? "parsed" : "rejected", reason: uniqueRoutes.length ? null : "no structurally valid route rows" }] };
}

