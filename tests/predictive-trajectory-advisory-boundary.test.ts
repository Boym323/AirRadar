import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const advisorySource = readFileSync(new URL("../components/predictive-aircraft-advisories.tsx", import.meta.url), "utf8");
const operationsRouteSource = readFileSync(new URL("../app/api/operations/predictive/route.ts", import.meta.url), "utf8");
const graduationSource = readFileSync(new URL("../lib/predictive-intelligence/graduation.ts", import.meta.url), "utf8");

describe("Predictive Trajectory Advisory V1 boundary", () => {
  it("keeps admin preview behind the existing authenticated session", () => {
    expect(routeSource).toContain("admin && trajectoryReadiness");
    expect(routeSource).toContain("buildAdminTrajectoryAdvisoryPreview");
    expect(routeSource).toContain("...(trajectoryAdminPreview ? { trajectoryAdminPreview } : {})");
  });

  it("serializes public trajectory only through readiness-aware builders", () => {
    expect(routeSource).toContain("buildPublicTrajectoryAdvisory(predictionState, effectivePolicy, trajectoryReadiness)");
    expect(routeSource).toContain("enforcePredictiveReadiness");
    expect(operationsRouteSource).toContain('configuredPolicy.TRAJECTORY === "PUBLIC"');
    expect(operationsRouteSource).toContain("buildPublicTrajectoryAdvisory");
  });

  it("shares the existing aircraft prediction request without a new stream or poller", () => {
    expect(advisorySource.match(/fetch\(/g)).toHaveLength(1);
    expect(advisorySource).toContain("/prediction");
    expect(advisorySource).not.toContain("new EventSource");
    expect(advisorySource).not.toContain("setInterval");
  });

  it("auto-expires rendered trajectory state at the standard freshness boundary", () => {
    expect(advisorySource).toContain("TRAJECTORY_ADVISORY_STALE_AFTER_MS");
    expect(advisorySource).toContain("trajectoryAdvisory: null");
    expect(advisorySource).toContain('data-testid="predictive-trajectory-advisory"');
  });

  it("keeps the legacy serializer fail-closed for LOW and UNKNOWN trajectory output", () => {
    expect(graduationSource).toContain('prediction.trajectory.state !== "UNKNOWN"');
    expect(graduationSource).toContain('prediction.trajectory.confidence === "MEDIUM"');
    expect(graduationSource).toContain('prediction.trajectory.confidence === "HIGH"');
  });
});
