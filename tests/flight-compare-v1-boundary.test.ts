import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/compare/flights/page.tsx", import.meta.url), "utf8");
const compare = readFileSync(new URL("../components/flight-compare.tsx", import.meta.url), "utf8");

describe("Flight Compare V1 boundary", () => {
  it("owns /compare/flights as a history-only comparison surface", () => {
    expect(page).toContain("<FlightCompare />");
    expect(compare).toContain("/api/history/flights?range=7d&limit=100");
    expect(compare).toContain("/api/history/flights/");
    expect(compare).not.toContain("getPrisma");
    expect(compare).not.toContain("/api/compare");
  });

  it("derives comparison metrics from bounded flight details", () => {
    expect(compare).toContain("haversineKm");
    expect(compare).toContain("trackDistanceNm");
    expect(compare).toContain("groundSpeed");
    expect(compare).toContain("detail.flight.maxAltitude");
    expect(compare).toContain("detail.truncated");
  });

  it("keeps sampled-distance semantics explicit", () => {
    expect(compare).toContain("sampled histories may understate");
    expect(compare).toContain("SAMPLED");
  });
});
