import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const advisorySource = readFileSync(new URL("../components/predictive-aircraft-advisories.tsx", import.meta.url), "utf8");
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

  it("shares the existing single prediction request with ETA", () => {
    expect(advisorySource.match(/fetch\(/g)).toHaveLength(1);
    expect(advisorySource).toContain("/prediction");
    expect(advisorySource).not.toContain("new EventSource");
    expect(advisorySource).not.toContain("setInterval");
  });

  it("auto-expires a rendered runway with a local one-shot timer", () => {
    expect(advisorySource).toContain('from "@/lib/predictive-intelligence/runway-advisory"');
    expect(advisorySource).toContain("RUNWAY_ADVISORY_STALE_AFTER_MS");
    expect(advisorySource).toContain("runwayAdvisory: null");
    expect(advisorySource).toContain('data-testid="predictive-runway-advisory"');
  });

  it("mounts the shared predictive panel only on aircraft detail", () => {
    expect(detailSource).toContain("PredictiveAircraftAdvisories");
    expect(detailSource).toContain("enabled={Boolean(liveAircraft");
  });

  it("keeps the legacy public predictive state freshness guard as a second boundary", () => {
    expect(graduationSource).toContain('policy.RUNWAY === "PUBLIC" && fresh');
  });
});
