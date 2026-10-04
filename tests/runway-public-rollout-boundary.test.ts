import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rolloutSource = readFileSync(new URL("../lib/predictive-intelligence/runway-rollout.ts", import.meta.url), "utf8");
const advisorySource = readFileSync(new URL("../lib/predictive-intelligence/runway-advisory.ts", import.meta.url), "utf8");

const publicSurfaces = [
  readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../app/api/operations/predictive/route.ts", import.meta.url), "utf8"),
].join("\n");

describe("Runway Public Rollout V1 boundary", () => {
  it("remains a pure decision layer without persistence or environment mutation", () => {
    expect(rolloutSource).toContain("buildRunwayPublicRolloutDecision");
    expect(rolloutSource).not.toContain("prisma");
    expect(rolloutSource).not.toContain("process.env");
    expect(rolloutSource).not.toContain("fetch(");
    expect(rolloutSource).not.toContain("EventSource");
  });

  it("does not replace the existing Runway advisory public guard", () => {
    expect(advisorySource).toContain('input.policy.RUNWAY !== "PUBLIC"');
    expect(advisorySource).toContain('input.readiness.decision !== "PASS"');
    expect(publicSurfaces).not.toContain("buildRunwayPublicRolloutDecision");
  });

  it("requires an explicit configuration change after manual readiness review", () => {
    expect(rolloutSource).toContain('state: ready ? "READY_FOR_PUBLIC_CONFIG" : "SHADOW_COLLECTING"');
    expect(rolloutSource).toContain("requiresExplicitConfigChange: ready");
    expect(rolloutSource).toContain('state: publicActive ? "PUBLIC_ACTIVE" : "PUBLIC_FAIL_CLOSED"');
  });
});
