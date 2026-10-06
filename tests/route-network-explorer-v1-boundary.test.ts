import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../components/route-network-explorer.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/routes/page.tsx", import.meta.url), "utf8");
const trafficApi = readFileSync(new URL("../app/api/statistics/traffic/route.ts", import.meta.url), "utf8");
const trafficServer = readFileSync(new URL("../lib/server/statistics-traffic.ts", import.meta.url), "utf8");

describe("Route Network Explorer V1 boundary", () => {
  it("owns /routes as a thin client over existing traffic aggregates", () => {
    expect(route).toContain("<RouteNetworkExplorer />");
    expect(page).toContain('fetch("/api/statistics/traffic?range="');
    expect(page).not.toContain("/api/routes");
    expect(page).not.toContain("getPrisma");
  });

  it("keeps persisted traffic aggregation Flight-only", () => {
    expect(trafficApi).toContain("getStatisticsTraffic");
    expect(trafficServer).toContain("schema.Flight");
    expect(trafficServer).not.toContain("FlightPosition");
  });

  it("supports bounded today/7d/30d route exploration", () => {
    expect(page).toContain('const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"]');
    expect(page).toContain("data?.topRoutes");
    expect(page).toContain("data?.topOrigins");
    expect(page).toContain("data?.topDestinations");
  });
});
