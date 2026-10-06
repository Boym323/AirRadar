import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("../components/airport-detail.tsx", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../components/airport-movement-analytics.tsx", import.meta.url), "utf8");

describe("Airport Movement Analytics V2 boundary", () => {
  it("extends the existing airport detail without adding a route", () => {
    expect(detail).toContain("<AirportMovementAnalytics airport={airport} />");
    expect(analytics).toContain("/api/airports/");
    expect(analytics).toContain("/movements?period=");
    expect(analytics).not.toContain("getPrisma");
    expect(analytics).not.toContain("/api/airports/analytics");
  });

  it("uses only bounded movement periods already accepted by the API", () => {
    for (const period of ["today", "24h", "7d"]) {
      expect(analytics).toContain('"' + period + '"');
    }
  });

  it("derives hourly traffic and runway utilization from returned movements", () => {
    expect(analytics).toContain("getUTCHours");
    expect(analytics).toContain("probableRunways");
    expect(analytics).toContain("runwayRelevantMovements");
    expect(analytics).toContain("truncated");
    expect(analytics).toContain("complete");
  });
});
