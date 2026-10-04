import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rolloutSource = readFileSync(new URL("../lib/predictive-intelligence/runway-rollout.ts", import.meta.url), "utf8");
const sharedRolloutSource = readFileSync(new URL("../lib/predictive-intelligence/public-rollout.ts", import.meta.url), "utf8");
const advisorySource = readFileSync(new URL("../lib/predictive-intelligence/runway-advisory.ts", import.meta.url), "utf8");
const readinessSource = readFileSync(new URL("../lib/server/predictive-readiness.ts", import.meta.url), "utf8");

const publicSurfaces = [
  readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../app/api/operations/predictive/route.ts", import.meta.url), "utf8"),
].join("\n");

describe("Runway Public Rollout V1 boundary", () => {
  it("remains a pure decision layer without persistence or environment mutation", () => {
    expect(rolloutSource).toContain("buildRunwayPublicRolloutDecision");
    expect(rolloutSource).not.toContain("getPrisma");
    expect(rolloutSource).not.toContain("process.env");
    expect(rolloutSource).not.toContain("fetch(");
    expect(rolloutSource).not.toContain("EventSource");
    expect(rolloutSource).not.toContain("ReadableStream");
  });

  it("retains the existing two-key runway public guard", () => {
    expect(advisorySource).toContain('effectivePolicy.RUNWAY !== "PUBLIC" || readiness?.decision !== "PASS"');
    expect(readinessSource).toContain('evaluation.capabilities[capability].decision !== "PASS"');
    expect(readinessSource).toContain('effective[capability] = "SHADOW"');
    expect(publicSurfaces).not.toContain("buildRunwayPublicRolloutDecision");
  });

  it("requires explicit config after manual review and exposes fail-closed fallback", () => {
    expect(rolloutSource).toContain("buildPredictivePublicRolloutDecision");
    expect(rolloutSource).toContain('RUNWAY_PUBLIC_ROLLOUT_VERSION = "runway-public-rollout-v1"');
    expect(sharedRolloutSource).toContain('state: ready ? "READY_FOR_PUBLIC_CONFIG" : "SHADOW_COLLECTING"');
    expect(sharedRolloutSource).toContain("requiresExplicitConfigChange: ready");
    expect(sharedRolloutSource).toContain('state: publicActive ? "PUBLIC_ACTIVE" : "PUBLIC_FAIL_CLOSED"');
  });
});
