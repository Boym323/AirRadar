import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/traffic/geography/page.tsx", import.meta.url), "utf8");
const geography = readFileSync(new URL("../components/traffic-geography.tsx", import.meta.url), "utf8");
const trafficServer = readFileSync(new URL("../lib/server/statistics-traffic.ts", import.meta.url), "utf8");

describe("Traffic Geography V1 boundary", () => {
  it("renders registration country, origin and destination as separate semantics", () => {
    expect(page).toContain("<TrafficGeography />");
    expect(geography).toContain("data.registrationCountries");
    expect(geography).toContain("data.topOrigins");
    expect(geography).toContain("data.topDestinations");
    expect(geography).toContain("registrationCountries means aircraft registration country");
  });

  it("uses the existing bounded traffic response without airport request fan-out", () => {
    expect(geography).toContain('const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"]');
    expect(geography.match(/fetch\(/g)).toHaveLength(1);
    expect(geography).toContain('fetch("/api/statistics/traffic?range=" + range');
    expect(geography).not.toContain("/api/airports/");
    expect(geography).not.toContain("/api/traffic/geography");
  });

  it("keeps geography Flight-only and avoids heuristic semantic mixing", () => {
    expect(trafficServer).toContain("schema.Flight");
    expect(trafficServer).not.toContain("schema.FlightPosition");
    expect(geography).not.toContain("domesticCount");
    expect(geography).not.toContain("internationalCount");
    expect(geography).not.toContain("originCountry");
  });
});
