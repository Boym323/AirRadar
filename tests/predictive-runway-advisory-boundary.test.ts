import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/aircraft-detail-v3.tsx", import.meta.url), "utf8");
const graduationSource = readFileSync(new URL("../lib/predictive-intelligence/graduation.ts", import.meta.url), "utf8");

describe("Predictive Runway Advisory V1 boundary", () => {
  it("keeps runway admin preview behind the existing authenticated session", () => {
    expect(routeSource).toContain("admin && runwayReadiness");
    expect(routeSource).toContain("buildAdminRunwayAdvisoryPreview");
    expect(routeSource).toContain("...(runwayAdminPreview ? { runwayAdminPreview } : {})");
  });

  it("serializes public runway only through readiness-aware advisory boundary", () => {
    expect(routeSource).toContain("buildPublicRunwayAdvisory(predictionState, effectivePolicy, runwayReadiness)");
    expect(routeSource).toContain("enforcePredictiveReadiness");
  });

  it("keeps the retained aircraft detail free of rejected predictive advisories", () => {
    expect(detailSource).not.toContain("PredictiveAircraftAdvisories");
    expect(detailSource).not.toContain("AircraftOperationalTwin");
    expect(detailSource).toContain("<AircraftAltitudeChart");
  });

  it("keeps the legacy public predictive state freshness guard as a second boundary", () => {
    expect(graduationSource).toContain('policy.RUNWAY === "PUBLIC" && fresh');
  });
});
