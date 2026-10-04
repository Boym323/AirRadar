import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sharedSource = readFileSync(new URL("../lib/predictive-intelligence/public-rollout.ts", import.meta.url), "utf8");
const etaSource = readFileSync(new URL("../lib/predictive-intelligence/eta-rollout.ts", import.meta.url), "utf8");
const runwaySource = readFileSync(new URL("../lib/predictive-intelligence/runway-rollout.ts", import.meta.url), "utf8");
const runwayChangeSource = readFileSync(new URL("../lib/predictive-intelligence/runway-change-rollout.ts", import.meta.url), "utf8");
const trajectorySource = readFileSync(new URL("../lib/predictive-intelligence/trajectory-rollout.ts", import.meta.url), "utf8");
const readinessSource = readFileSync(new URL("../lib/server/predictive-readiness.ts", import.meta.url), "utf8");

describe("Predictive Public Rollout V1 boundary", () => {
  it("keeps the shared rollout decision pure and side-effect free", () => {
    expect(sharedSource).toContain("buildPredictivePublicRolloutDecision");
    expect(sharedSource).not.toContain("process.env");
    expect(sharedSource).not.toContain("getPrisma");
    expect(sharedSource).not.toContain("fetch(");
    expect(sharedSource).not.toContain(".create(");
    expect(sharedSource).not.toContain(".update(");
    expect(sharedSource).not.toContain(".delete(");
  });

  it("keeps all capability wrappers on the shared decision engine", () => {
    for (const source of [etaSource, runwaySource, runwayChangeSource, trajectorySource]) {
      expect(source).toContain("buildPredictivePublicRolloutDecision");
    }
  });

  it("keeps rollout advisory-only with explicit PUBLIC configuration", () => {
    expect(sharedSource).toContain('configuredMode === "PUBLIC"');
    expect(sharedSource).toContain('effectiveMode === "PUBLIC" && readiness.decision === "PASS"');
    expect(sharedSource).toContain("requiresExplicitConfigChange: ready");
    expect(sharedSource).not.toContain("AIRRADAR_PREDICTIVE_");
  });

  it("reports rollout state for every predictive capability in the admin readiness report", () => {
    expect(readinessSource).toContain("PredictivePublicRolloutReport");
    expect(readinessSource).toContain("buildEtaPublicRolloutDecision");
    expect(readinessSource).toContain("buildRunwayPublicRolloutDecision");
    expect(readinessSource).toContain("buildRunwayChangePublicRolloutDecision");
    expect(readinessSource).toContain("buildTrajectoryPublicRolloutDecision");
  });
});
