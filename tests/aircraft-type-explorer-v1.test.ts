import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aircraftTypeShare } from "@/components/aircraft-type-explorer-metrics";

const page = readFileSync(new URL("../app/aircraft-types/page.tsx", import.meta.url), "utf8");
const explorer = readFileSync(new URL("../components/aircraft-type-explorer.tsx", import.meta.url), "utf8");
const trafficServer = readFileSync(new URL("../lib/server/statistics-traffic.ts", import.meta.url), "utf8");

describe("Aircraft Type Explorer V1", () => {
  it("calculates shares only against a known observedFlights total", () => {
    expect(aircraftTypeShare(28, 100)).toBeCloseTo(28);
    expect(aircraftTypeShare(2, null)).toBeNull();
    expect(aircraftTypeShare(2, 0)).toBeNull();
  });

  it("supports bounded range switching, empty states and canonical type query links", () => {
    expect(explorer).toContain('const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"]');
    expect(explorer).toContain("data.topAircraftTypes.length");
    expect(explorer).toContain("/aircraft-types?type=");
    expect(explorer).toContain("copy.empty");
    expect(page).toContain("<AircraftTypeExplorer />");
  });

  it("reuses the Flight-only traffic API without adding an analytics scan", () => {
    expect(explorer).toContain('fetch("/api/statistics/traffic?range=" + range');
    expect(explorer).not.toContain("/api/aircraft-types");
    expect(explorer).not.toContain("getPrisma");
    expect(trafficServer).toContain("schema.Flight");
    expect(trafficServer).not.toContain("schema.FlightPosition");
  });
});
