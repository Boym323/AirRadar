import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/routes/[origin]/[destination]/page.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../components/route-network-detail.tsx", import.meta.url), "utf8");

describe("Route Network Detail V2 boundary", () => {
  it("owns the dynamic route page and validates both airport codes", () => {
    expect(page).toContain("<RouteNetworkDetail origin={origin} destination={destination} />");
    expect(page).toContain("normalizeAirportIcao");
    expect(page).toContain("origin === destination");
  });

  it("reuses existing bounded traffic and history APIs only", () => {
    expect(detail).toContain("/api/statistics/traffic?range=30d");
    expect(detail).toContain("/api/history/flights?origin=");
    expect(detail).toContain("&range=7d&limit=100");
    expect(detail).not.toContain("/api/routes/");
    expect(detail).not.toContain("getPrisma");
  });

  it("does not claim an exact 30-day count outside the bounded top-routes aggregate", () => {
    expect(detail).toContain("routeAggregate?.count ?? null");
    expect(detail).toContain("OUTSIDE TOP 8");
    expect(detail).toContain("capped at 100");
  });
});
