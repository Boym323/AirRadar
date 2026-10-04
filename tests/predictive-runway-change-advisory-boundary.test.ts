import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const advisorySource = readFileSync(new URL("../components/predictive-aircraft-advisories.tsx", import.meta.url), "utf8");
const operationsRouteSource = readFileSync(new URL("../app/api/operations/predictive/route.ts", import.meta.url), "utf8");
const graduationSource = readFileSync(new URL("../lib/predictive-intelligence/graduation.ts", import.meta.url), "utf8");

describe("Predictive Runway Change Advisory V1 boundary", () => {
  it("keeps admin preview behind the existing authenticated session", () => {
    expect(routeSource).toContain("admin && runwayChangeReadiness");
    expect(routeSource).toContain("buildAdminRunwayChangeAdvisoryPreview");
    expect(routeSource).toContain("...(runwayChangeAdminPreview ? { runwayChangeAdminPreview } : {})");
  });

  it("serializes public runway changes only through readiness-aware builders", () => {
    expect(routeSource).toContain("buildPublicRunwayChangeAdvisory(predictionState, effectivePolicy, runwayChangeReadiness)");
    expect(routeSource).toContain("enforcePredictiveReadiness");
    expect(operationsRouteSource).toContain("configuredPolicy.RUNWAY_CHANGE === \"PUBLIC\"");
    expect(operationsRouteSource).toContain("buildPublicRunwayChangeAdvisory");
  });

  it("shares the existing aircraft prediction request without a new stream or poller", () => {
    expect(advisorySource.match(/fetch\(/g)).toHaveLength(1);
    expect(advisorySource).toContain("/prediction");
    expect(advisorySource).not.toContain("new EventSource");
    expect(advisorySource).not.toContain("setInterval");
  });

  it("auto-expires the public runway change by snapshot or event age", () => {
    expect(advisorySource).toContain("RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS");
    expect(advisorySource).toContain("RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS");
    expect(advisorySource).toContain("runwayChangeAdvisory: null");
    expect(advisorySource).toContain('data-testid="predictive-runway-change-advisory"');
  });

  it("keeps legacy public serialization on real change provenance", () => {
    expect(graduationSource).toContain("prediction.runway.changedFrom");
    expect(graduationSource).toContain("prediction.runway.changedAt");
    expect(graduationSource).not.toContain("changedFrom: available ? prediction.runway.alternative");
  });
});
