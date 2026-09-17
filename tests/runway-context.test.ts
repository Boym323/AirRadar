import { describe, expect, it } from "vitest";
import {
  compareProcedureRunwayApplicability,
  createRunwayContext,
  normalizeRunwayDesignator,
  resolveArrivalRunwayContext,
  resolveDepartureRunwayContext,
  type ProcedureRunwayApplicability,
} from "@/lib/route-intelligence";
import type { AirportRunway } from "@/lib/airports/infrastructure";

const airport = { latitude: 50, longitude: 14 };
const runway24: AirportRunway = {
  id: 1, airportId: 1, sourceAirportIdent: "LKPR", lengthFt: 10_000, widthFt: 150, surface: "ASP", lighted: true, closed: false,
  leIdent: "06", leLatitude: 50.001, leLongitude: 13.99, leElevationFt: 1_200, leHeadingDegT: 60, leDisplacedThresholdFt: null,
  heIdent: "24", heLatitude: 50.001, heLongitude: 14.01, heElevationFt: 1_200, heHeadingDegT: 240, heDisplacedThresholdFt: null,
};
const arrivalPositions = [
  { lat: 50.08, lon: 14.3, track: 240 },
  { lat: 50.03, lon: 14.08, track: 240 },
  { lat: 50.001, lon: 14.01, track: 240 },
];
const departurePositions = [
  { lat: 50.001, lon: 14.01, track: 240 },
  { lat: 49.99, lon: 13.97, track: 240 },
  { lat: 49.97, lon: 13.92, track: 240 },
];

describe("runway context resolver", () => {
  it("resolves a reported-only FlightAware runway", () => {
    const context = resolveDepartureRunwayContext({
      flightPlan: { source: "flightaware-aeroapi", flightAware: { operational: { departureRunway: " rwy 4l " } } },
    });
    expect(context).toMatchObject({
      reportedRunway: "04L", inferredRunway: null, status: "REPORTED", effectiveRunway: "04L", displayRunway: "04L",
      source: "FLIGHTAWARE", confidence: "HIGH", conflict: false,
    });
  });

  it("resolves geometry-only arrival evidence as inferred", () => {
    const context = resolveArrivalRunwayContext({ positions: arrivalPositions, airport, runways: [runway24], inferredConfidence: "MEDIUM" });
    expect(context).toMatchObject({ reportedRunway: null, inferredRunway: "24", status: "INFERRED", effectiveRunway: "24", source: "AIRPORT_GEOMETRY", confidence: "MEDIUM", conflict: false });
  });

  it("keeps matching reported and inferred values without a conflict", () => {
    const context = resolveArrivalRunwayContext({
      reportedRunway: "RWY 24",
      positions: arrivalPositions,
      airport,
      runways: [runway24],
    });
    expect(context).toMatchObject({ reportedRunway: "24", inferredRunway: "24", status: "REPORTED", effectiveRunway: "24", displayRunway: "24", source: "MULTIPLE", confidence: "HIGH", conflict: false });
  });

  it("preserves both values and makes the effective runway unknown on conflict", () => {
    const context = resolveArrivalRunwayContext({
      reportedRunway: "06",
      positions: arrivalPositions,
      airport,
      runways: [runway24],
    });
    expect(context).toMatchObject({ reportedRunway: "06", inferredRunway: "24", status: "REPORTED", effectiveRunway: null, displayRunway: "06 / 24", source: "MULTIPLE", confidence: null, conflict: true });
  });

  it("returns unknown for ambiguous parallel runway geometry", () => {
    const parallel = { ...runway24, id: 2, leIdent: "06L", heIdent: "24L", leLongitude: 13.991, heLongitude: 14.011 };
    const context = resolveArrivalRunwayContext({ positions: arrivalPositions, airport, runways: [runway24, parallel] });
    expect(context).toMatchObject({ inferredRunway: null, status: "UNKNOWN", effectiveRunway: null, conflict: false });
  });

  it("normalizes runway designators and rejects malformed values", () => {
    expect(normalizeRunwayDesignator(" runway 4l ")).toBe("04L");
    expect(normalizeRunwayDesignator("9")).toBe("09");
    expect(normalizeRunwayDesignator("37")).toBeNull();
    expect(createRunwayContext({ reportedRunway: " 024 ", inferredRunway: "24" })).toMatchObject({ reportedRunway: "24", inferredRunway: "24", conflict: false });
  });

  it("returns unknown when runway geometry is absent or scores too low", () => {
    expect(resolveDepartureRunwayContext({ positions: departurePositions, airport, runways: [] })).toMatchObject({ status: "UNKNOWN", inferredRunway: null });
    expect(resolveArrivalRunwayContext({ positions: [{ lat: 51, lon: 15, track: 240 }], airport, runways: [runway24] })).toMatchObject({ status: "UNKNOWN", inferredRunway: null });
  });
});

describe("procedure runway applicability", () => {
  const compare = (kind: ProcedureRunwayApplicability["kind"], runwayDesignators: string[], runwayContext: ReturnType<typeof resolveArrivalRunwayContext>) =>
    compareProcedureRunwayApplicability({ kind, runwayDesignators }, runwayContext);

  it("compares include/exclude applicability and keeps conflicts unknown", () => {
    const inferred = resolveArrivalRunwayContext({ positions: arrivalPositions, airport, runways: [runway24] });
    expect(compare("INCLUDE", ["RWY 24"], inferred)).toBe("COMPATIBLE");
    expect(compare("EXCLUDE", ["06"], inferred)).toBe("COMPATIBLE");
    expect(compare("INCLUDE", ["06"], inferred)).toBe("INCOMPATIBLE");
    expect(compare("ALL", [], inferred)).toBe("COMPATIBLE");
    expect(compare("UNKNOWN", [], inferred)).toBe("UNKNOWN");
    const conflict = resolveArrivalRunwayContext({ reportedRunway: "06", positions: arrivalPositions, airport, runways: [runway24] });
    expect(compare("INCLUDE", ["06"], conflict)).toBe("UNKNOWN");
  });
});
