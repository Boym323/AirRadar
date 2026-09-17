import type { RouteIntelligenceViewDTO, RouteElementViewDTO, RouteElementSourceViewDTO } from "@/lib/route-intelligence";

const published = (kind: RouteElementSourceViewDTO["kind"], reference = "CZ AIP 2026-09"): RouteElementSourceViewDTO => ({
  kind,
  provider: "AIP fixture",
  countryCode: "CZ",
  reference,
  procedureId: kind === "PUBLISHED_SID" ? "LKPR-SID-1" : kind === "PUBLISHED_STAR" ? "EDDF-STAR-1" : null,
  effectiveDate: "2026-09-03",
  airacCycle: "AIRAC 09/2026",
  amendment: null,
});

const point = (id: string, name: string, latitude: number, longitude: number) => ({ id, name, latitude, longitude });

function element(
  id: string,
  sequence: number,
  kind: RouteElementViewDTO["kind"],
  phase: RouteElementViewDTO["phase"],
  label: string | null,
  from: ReturnType<typeof point> | null,
  to: ReturnType<typeof point> | null,
  source: RouteElementSourceViewDTO,
  overrides: Partial<RouteElementViewDTO> = {},
): RouteElementViewDTO {
  return {
    id,
    sequence,
    kind,
    phase,
    label,
    from,
    to,
    geometry: from && to ? { type: "LINE", coordinates: [{ lat: from.latitude, lon: from.longitude }, { lat: to.latitude, lon: to.longitude }] } : null,
    source,
    status: "RESOLVED",
    unresolvedReason: null,
    ...overrides,
  };
}

const origin = point("RWY24", "LKPR RWY24", 50.1008, 14.26);
const sidFix = point("BODAL", "BODAL", 50.4, 14.8);
const atsFix = point("L984-1", "OKG", 50.7, 13.4);
const starFix = point("RONBU", "RONBU", 50.2, 9.4);
const destination = point("RWY25C", "EDDF RWY25C", 50.0379, 8.5622);

const base = (elements: RouteElementViewDTO[]): RouteIntelligenceViewDTO => ({
  routeId: "fixture-full",
  status: "PARTIAL",
  currentPhase: "EN_ROUTE",
  elements,
  currentElement: elements.find((item) => item.id === "ats-1") ?? null,
  previousPoint: sidFix,
  nextPoint: atsFix,
  distanceToNext: 42.5,
  crossTrackDeviation: 0.8,
  alongTrackDistance: 12.4,
  routeAdherence: "ON_ROUTE",
  completedElementIds: ["sid-1"],
  remainingElementIds: ["ats-2", "star-1"],
  routeProgress: 0.34,
  routeProgressPercent: 34,
  precision: "PRECISE",
  progressPrecision: "PRECISE",
  coverage: {
    ats: { eligibleLegs: 2, matchedLegs: 2, percent: 100 },
    reconstruction: { totalElements: elements.length, resolvedElements: elements.length, percent: 100 },
    progress: { totalElements: elements.length, completedElements: 1, percent: 34 },
  },
  procedureMatches: [
    { status: "FILED", selectedProcedureId: "LKPR-SID-1", candidateCount: 1, ambiguous: false, confidence: 1, runwayCompatibility: "COMPATIBLE" },
    { status: "INFERRED_MEDIUM", selectedProcedureId: "EDDF-STAR-1", candidateCount: 1, ambiguous: false, confidence: 0.72, runwayCompatibility: "UNKNOWN" },
  ],
  runway: { reportedRunway: "24", inferredRunway: "25C", status: "REPORTED", conflict: true },
});

export const fullSidAtsStarRoute = base([
  element("sid-1", 1, "PUBLISHED_SID", "SID", "BODAL1W", origin, sidFix, published("PUBLISHED_SID")),
  element("ats-1", 2, "PUBLISHED_ATS", "EN_ROUTE", "L984", sidFix, atsFix, published("PUBLISHED_ATS")),
  element("ats-2", 3, "PUBLISHED_ATS", "EN_ROUTE", "L984", atsFix, starFix, published("PUBLISHED_ATS")),
  element("star-1", 4, "PUBLISHED_STAR", "STAR", "RONBU1C", starFix, destination, published("PUBLISHED_STAR")),
]);

// Keep each fixture a plain DTO and make progress references self-consistent.
export const atsOnly: RouteIntelligenceViewDTO = { ...base(fullSidAtsStarRoute.elements.filter((item) => item.kind === "PUBLISHED_ATS")), routeId: "fixture-ats-only", currentElement: fullSidAtsStarRoute.elements[1]!, completedElementIds: [], remainingElementIds: ["ats-1", "ats-2"], procedureMatches: [], runway: { reportedRunway: null, inferredRunway: null, status: "UNKNOWN", conflict: false } };
export const sidOnly: RouteIntelligenceViewDTO = { ...base([fullSidAtsStarRoute.elements[0]!]), routeId: "fixture-sid-only", currentPhase: "SID", currentElement: null, previousPoint: null, nextPoint: sidFix, remainingElementIds: ["sid-1"], procedureMatches: [fullSidAtsStarRoute.procedureMatches[0]!], routeProgress: null, coverage: { ats: { eligibleLegs: 0, matchedLegs: 0, percent: null }, reconstruction: { totalElements: 1, resolvedElements: 1, percent: 100 }, progress: null } };
export const starOnly: RouteIntelligenceViewDTO = { ...base([fullSidAtsStarRoute.elements[3]!]), routeId: "fixture-star-only", currentPhase: "STAR", currentElement: fullSidAtsStarRoute.elements[3]!, completedElementIds: [], remainingElementIds: ["star-1"], procedureMatches: [fullSidAtsStarRoute.procedureMatches[1]!], runway: { reportedRunway: null, inferredRunway: null, status: "UNKNOWN", conflict: false } };
export const dctRoute: RouteIntelligenceViewDTO = { ...base([element("dct-1", 1, "FILED_DCT", "EN_ROUTE", "DCT", sidFix, atsFix, { ...published("FILED_DCT"), kind: "FILED_DCT", procedureId: null })]), routeId: "fixture-dct", currentElement: null, procedureMatches: [], runway: { reportedRunway: null, inferredRunway: null, status: "UNKNOWN", conflict: false } };
export const unresolvedRoute: RouteIntelligenceViewDTO = { ...base([element("gap-1", 1, "UNRESOLVED_CONNECTOR", "CONNECTOR", null, sidFix, null, { ...published("SCHEMATIC"), kind: "SCHEMATIC", procedureId: null }, { status: "UNRESOLVED", unresolvedReason: "published geometry unavailable", geometry: null })]), routeId: "fixture-unresolved", status: "UNRESOLVED", currentPhase: "CONNECTOR", currentElement: null, completedElementIds: [], remainingElementIds: [], routeProgress: null, coverage: { ats: { eligibleLegs: 1, matchedLegs: 0, percent: 0 }, reconstruction: { totalElements: 1, resolvedElements: 0, percent: 0 }, progress: null }, procedureMatches: [] };
export const unknownProgressRoute: RouteIntelligenceViewDTO = { ...atsOnly, routeId: "fixture-unknown-progress", routeProgress: null, coverage: { ...atsOnly.coverage, progress: null } };
export const invalidGeometryRoute: RouteIntelligenceViewDTO = { ...base([element("invalid-1", 1, "PUBLISHED_SID", "SID", "BAD", { id: "bad", name: "BAD", latitude: Number.NaN, longitude: 14 }, sidFix, published("PUBLISHED_SID")), element("schematic-1", 2, "SCHEMATIC", "CONNECTOR", "connector", sidFix, atsFix, { ...published("SCHEMATIC"), kind: "SCHEMATIC", procedureId: null }, { geometry: null })]), routeId: "fixture-invalid-geometry", currentElement: null, procedureMatches: [] };

export const reportedRunwayRoute: RouteIntelligenceViewDTO = { ...fullSidAtsStarRoute, routeId: "fixture-reported-runway", runway: { reportedRunway: "24", inferredRunway: null, status: "REPORTED", conflict: false } };
export const inferredRunwayRoute: RouteIntelligenceViewDTO = { ...fullSidAtsStarRoute, routeId: "fixture-inferred-runway", runway: { reportedRunway: null, inferredRunway: "25C", status: "INFERRED", conflict: false } };
