import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
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
    expect(existsSync(new URL("../app/api/operations/predictive/route.ts", import.meta.url))).toBe(false);
  });

  it("keeps the legacy serializer fail-closed for LOW and UNKNOWN trajectory output", () => {
    expect(graduationSource).toContain('prediction.trajectory.state !== "UNKNOWN"');
    expect(graduationSource).toContain('prediction.trajectory.confidence === "MEDIUM"');
    expect(graduationSource).toContain('prediction.trajectory.confidence === "HIGH"');
  });
});
