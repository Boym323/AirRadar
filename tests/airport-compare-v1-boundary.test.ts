import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/compare/airports/page.tsx", import.meta.url), "utf8");
const compare = readFileSync(new URL("../components/airport-compare.tsx", import.meta.url), "utf8");

describe("Airport Compare V1 boundary", () => {
  it("owns /compare/airports as a client comparison over existing APIs", () => {
    expect(page).toContain("<AirportCompare />");
    expect(compare).toContain("/api/airports");
    expect(compare).toContain("/movements?period=");
    expect(compare).toContain("/api/weather/airport/");
    expect(compare).not.toContain("getPrisma");
    expect(compare).not.toContain("/api/compare");
  });

  it("keeps the comparison bounded to 24h and 7d movement products", () => {
    expect(compare).toContain('"24h"');
    expect(compare).toContain('"7d"');
    expect(compare).not.toContain('"30d"');
  });

  it("derives peak hour and runway share client-side", () => {
    expect(compare).toContain("getUTCHours");
    expect(compare).toContain("probableRunways");
    expect(compare).toContain("runwayRelevantMovements");
  });
});
