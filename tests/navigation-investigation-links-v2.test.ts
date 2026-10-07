import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildNavigationReferenceInvestigation,
  buildProcedureInvestigation,
  buildSectorDetailInvestigation,
  parseNavigationReferenceInvestigation,
  parseProcedureInvestigation,
  parseSectorDetailInvestigation,
} from "@/lib/investigation-links";

describe("Navigation Investigation Links V2 query contract", () => {
  it("round-trips navigation reference state", () => {
    const state = parseNavigationReferenceInvestigation("?id=vlm");
    expect(state).toEqual({ id: "VLM", route: null });
    expect(parseNavigationReferenceInvestigation("?" + buildNavigationReferenceInvestigation(state))).toEqual(state);

    const route = parseNavigationReferenceInvestigation("?route=l984");
    expect(route).toEqual({ id: null, route: "L984" });
    expect(parseNavigationReferenceInvestigation("?" + buildNavigationReferenceInvestigation(route))).toEqual(route);
  });

  it("round-trips procedure state", () => {
    const state = parseProcedureInvestigation("?airport=lkpr&type=star&designator=vas1s");
    expect(state).toEqual({ airport: "LKPR", type: "STAR", designator: "VAS1S" });
    expect(parseProcedureInvestigation("?" + buildProcedureInvestigation(state))).toEqual(state);
  });

  it("round-trips sector history state", () => {
    expect(parseSectorDetailInvestigation("?history=1h")).toEqual({ historyHours: 1 });
    expect(parseSectorDetailInvestigation("?history=24h")).toEqual({ historyHours: 24 });
    expect(parseSectorDetailInvestigation("?" + buildSectorDetailInvestigation({ historyHours: 6 }))).toEqual({ historyHours: 6 });
  });

  it("fails closed for malformed navigation/procedure/sector values", () => {
    expect(parseNavigationReferenceInvestigation("?id=%2Fetc%2Fpasswd&route=%2Fetc")).toEqual({ id: null, route: null });
    expect(parseProcedureInvestigation("?airport=PRAGUE&type=ARRIVAL&designator=%%%")).toEqual({
      airport: null,
      type: "ALL",
      designator: "",
    });
    expect(parseSectorDetailInvestigation("?history=365d")).toEqual({ historyHours: 6 });
  });
});

describe("Navigation Investigation Links V2 browser boundary", () => {
  const navigation = readFileSync(new URL("../components/navigation-reference-explorer.tsx", import.meta.url), "utf8");
  const procedures = readFileSync(new URL("../components/procedure-explorer.tsx", import.meta.url), "utf8");
  const sector = readFileSync(new URL("../components/atc-sector-detail.tsx", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../lib/investigation-links.ts", import.meta.url), "utf8");

  it("restores bookmark state and browser back/forward on all three surfaces", () => {
    for (const source of [navigation, procedures, sector]) {
      expect(source).toContain('addEventListener("popstate"');
      expect(source).toContain("window.history.pushState");
      expect(source).toContain("window.history.replaceState");
      expect(source).not.toContain("localStorage");
    }
  });

  it("uses the shared fail-closed helper without API or persistence additions", () => {
    expect(navigation).toContain("parseNavigationReferenceInvestigation");
    expect(procedures).toContain("parseProcedureInvestigation");
    expect(sector).toContain("parseSectorDetailInvestigation");
    expect(helper).not.toContain("fetch(");
    expect(helper).not.toContain("prisma");
    expect(helper).not.toContain("localStorage");
  });
});
