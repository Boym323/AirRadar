import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAirspaceInvestigation,
  buildAirportCompareInvestigation,
  buildFlightCompareInvestigation,
  buildNavigationIntegrityInvestigation,
  parseAirspaceInvestigation,
  parseAirportCompareInvestigation,
  parseFlightCompareInvestigation,
  parseNavigationIntegrityInvestigation,
} from "@/lib/investigation-links";

describe("Investigation Links V1 query contract", () => {
  it("round-trips Navigation Integrity state", () => {
    const state = parseNavigationIntegrityInvestigation("?window=30m&source=LOCAL&minAltitude=10000&maxAltitude=29999&severity=DEGRADED&confidence=HIGH&type=SOURCE_ARTIFACT&history=7d");
    expect(state).toMatchObject({
      window: "30m",
      source: "LOCAL",
      minAltitude: "10000",
      maxAltitude: "29999",
      severity: "DEGRADED",
      confidence: "HIGH",
      category: "SOURCE_ARTIFACT",
      history: "7d",
    });
    expect(parseNavigationIntegrityInvestigation("?" + buildNavigationIntegrityInvestigation(state))).toEqual(state);
  });

  it("round-trips Airspace and Compare state", () => {
    const airspace = parseAirspaceInvestigation("?sector=LKAA_WEST&window=15m");
    expect(airspace).toEqual({ sector: "LKAA_WEST", windowMinutes: 15 });
    expect(parseAirspaceInvestigation("?" + buildAirspaceInvestigation(airspace))).toEqual(airspace);

    const flights = parseFlightCompareInvestigation("?a=12&b=42");
    expect(flights).toEqual({ a: 12, b: 42 });
    expect(parseFlightCompareInvestigation("?" + buildFlightCompareInvestigation(flights))).toEqual(flights);

    const airports = parseAirportCompareInvestigation("?a=lkpr&b=loww&period=7d");
    expect(airports).toEqual({ a: "LKPR", b: "LOWW", period: "7d" });
    expect(parseAirportCompareInvestigation("?" + buildAirportCompareInvestigation(airports))).toEqual(airports);
  });

  it("fails closed to safe defaults for invalid values", () => {
    expect(parseNavigationIntegrityInvestigation("?window=forever&source=OTHER&minAltitude=-1&maxAltitude=999999&severity=CRITICAL&type=BOGUS")).toEqual({
      window: "15m",
      source: "ALL",
      minAltitude: "",
      maxAltitude: "",
      severity: "ALL",
      confidence: "ALL",
      category: "ALL",
      history: "24h",
    });
    expect(parseAirspaceInvestigation("?sector=%2Fetc%2Fpasswd&window=60m")).toEqual({ sector: null, windowMinutes: 5 });
    expect(parseFlightCompareInvestigation("?a=-1&b=1e9")).toEqual({ a: null, b: null });
    expect(parseAirportCompareInvestigation("?a=PRAGUE&b=%%%&period=365d")).toEqual({ a: null, b: null, period: "24h" });
  });

  it("rejects inverted altitude bounds instead of silently changing meaning", () => {
    expect(parseNavigationIntegrityInvestigation("?minAltitude=30000&maxAltitude=10000")).toMatchObject({
      minAltitude: "",
      maxAltitude: "",
    });
  });
});

describe("Investigation Links V1 browser boundary", () => {
  const airspace = readFileSync(new URL("../components/atc-airspace-explorer.tsx", import.meta.url), "utf8");
  const integrity = readFileSync(new URL("../components/navigation-integrity-center.tsx", import.meta.url), "utf8");
  const flights = readFileSync(new URL("../components/flight-compare.tsx", import.meta.url), "utf8");
  const airports = readFileSync(new URL("../components/airport-compare.tsx", import.meta.url), "utf8");
  const timeMachine = readFileSync(new URL("../components/time-machine.tsx", import.meta.url), "utf8");

  it("restores state on browser back/forward and writes canonical history", () => {
    for (const source of [airspace, integrity, flights, airports]) {
      expect(source).toContain('addEventListener("popstate"');
      expect(source).toContain("window.history.pushState");
      expect(source).toContain("window.history.replaceState");
      expect(source).not.toContain("localStorage");
    }
  });

  it("preserves the existing Time Machine replay deep-link contract without overlapping its open V3 PR", () => {
    expect(timeMachine).toContain('params.get("at")');
    expect(timeMachine).toContain('params.get("hex")');
    expect(timeMachine).toContain('params.get("flightId")');
    expect(timeMachine).toContain('params.get("replay")');
    expect(timeMachine).toContain('window.history.replaceState(null, "", `/time-machine?');
  });

  it("adds no server persistence or new API endpoint", () => {
    const helper = readFileSync(new URL("../lib/investigation-links.ts", import.meta.url), "utf8");
    expect(helper).not.toContain("fetch(");
    expect(helper).not.toContain("localStorage");
    expect(helper).not.toContain("prisma");
  });
});
