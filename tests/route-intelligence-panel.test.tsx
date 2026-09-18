import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouteIntelligencePanel } from "@/components/route-intelligence-panel";
import type { RouteElementViewDTO, RouteIntelligenceViewDTO, RoutePhase } from "@/lib/route-intelligence";

function element(id: string, sourceKind: RouteElementViewDTO["source"]["kind"]): RouteElementViewDTO {
  return {
    id,
    sequence: id === "dct" ? 1 : 2,
    kind: sourceKind === "FILED_DCT" ? "FILED_DCT" : "SCHEMATIC",
    phase: "EN_ROUTE",
    label: id.toUpperCase(),
    from: { id: `${id}-from`, name: `${id.toUpperCase()}A`, latitude: 50, longitude: 14 },
    to: { id: `${id}-to`, name: `${id.toUpperCase()}B`, latitude: 51, longitude: 15 },
    geometry: null,
    source: {
      kind: sourceKind,
      provider: null,
      countryCode: null,
      reference: null,
      procedureId: null,
      effectiveDate: null,
      airacCycle: null,
      amendment: null,
    },
    status: "RESOLVED",
    unresolvedReason: null,
  };
}

function route(currentPhase: RoutePhase): RouteIntelligenceViewDTO {
  const elements = [element("dct", "FILED_DCT"), element("schematic", "SCHEMATIC")];
  return {
    routeId: "display-test",
    status: "RESOLVED",
    currentPhase,
    elements,
    currentElement: elements[0],
    previousPoint: null,
    nextPoint: null,
    distanceToNext: null,
    crossTrackDeviation: null,
    alongTrackDistance: null,
    routeAdherence: "UNKNOWN",
    completedElementIds: [],
    remainingElementIds: elements.map((item) => item.id),
    routeProgress: null,
    routeProgressPercent: null,
    precision: "UNAVAILABLE",
    progressPrecision: "UNAVAILABLE",
    coverage: {
      ats: { eligibleLegs: 0, matchedLegs: 0, percent: null },
      reconstruction: { totalElements: 2, resolvedElements: 2, percent: 100 },
      progress: null,
    },
    procedureMatches: [],
    runway: { reportedRunway: null, inferredRunway: null, status: "UNKNOWN", conflict: false },
  };
}

describe("Route Intelligence display", () => {
  it.each([
    ["ENROUTE", "Na trati"],
    ["EN_ROUTE", "Na trati"],
    ["DEPARTURE", "Odlet"],
    ["ARRIVAL", "Přílet"],
  ] as const)("renders %s with its real phase label", (phase, label) => {
    const markup = renderToStaticMarkup(<RouteIntelligencePanel route={route(phase)} />);
    expect(markup).toContain(label);
  });

  it("keeps distinct provenance when provider and reference are absent", () => {
    const markup = renderToStaticMarkup(<RouteIntelligencePanel route={route("ENROUTE")} />);
    expect(markup).toContain("Podaná DCT");
    expect(markup).toContain("Schematická spojnice");
  });
});
