import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/intelligence/analytics/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/intelligence/analytics/route.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../lib/server/flight-intelligence-analytics.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/flight-intelligence-analytics.tsx", import.meta.url), "utf8");

describe("Flight Intelligence Analytics V1 boundary", () => {
  it("owns one bounded aggregate endpoint and dedicated page", () => {
    expect(page).toContain("<FlightIntelligenceAnalytics />");
    expect(route).toContain("getFlightIntelligenceAnalytics");
    expect(route).toContain('checkPublicRateLimit("intelligence"');
    expect(ui).toContain("/api/intelligence/analytics?range=");
  });

  it("aggregates persisted FlightEvent data without returning raw event rows", () => {
    expect(server).toContain("schema.FlightEvent");
    expect(server).toContain('groupBy("type")');
    expect(server).toContain('groupBy("icaoHex")');
    expect(server).toContain("database.sql.public.flightEvent");
    expect(server).not.toContain("schema.FlightPosition");
    expect(server).not.toContain("sql.public.flightPosition");
    expect(ui).not.toContain("/api/intelligence/events");
  });

  it("keeps ranges and rankings bounded", () => {
    expect(route).toContain('"today" || value === "7d" || value === "30d"');
    expect(server).toContain("RANKING_LIMIT = 10");
    expect(ui).toContain('RANGES: IntelligenceAnalyticsRange[] = ["today", "7d", "30d"]');
  });
});
