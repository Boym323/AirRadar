import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rolloutSource = readFileSync(new URL("../lib/predictive-intelligence/eta-rollout.ts", import.meta.url), "utf8");
const sharedRolloutSource = readFileSync(new URL("../lib/predictive-intelligence/public-rollout.ts", import.meta.url), "utf8");
const advisorySource = readFileSync(new URL("../lib/predictive-intelligence/eta-advisory.ts", import.meta.url), "utf8");
const readinessSource = readFileSync(new URL("../lib/server/predictive-readiness.ts", import.meta.url), "utf8");

describe("ETA Public Rollout boundary", () => {
  it("keeps rollout advisory-only with no environment mutation", () => {
    expect(rolloutSource).not.toContain("process.env");
    expect(rolloutSource).not.toContain("getPrisma");
    expect(rolloutSource).not.toContain("fetch(");
    expect(rolloutSource).toContain("buildPredictivePublicRolloutDecision");
    expect(rolloutSource).toContain('ETA_PUBLIC_ROLLOUT_VERSION = "eta-public-rollout-v1"');
    expect(sharedRolloutSource).toContain("READY_FOR_PUBLIC_CONFIG");
    expect(sharedRolloutSource).toContain("PUBLIC_FAIL_CLOSED");
    expect(sharedRolloutSource).toContain('effectiveMode === "PUBLIC" && readiness.decision === "PASS"');
  });

  it("retains the existing two-key public ETA guard", () => {
    expect(advisorySource).toContain('effectivePolicy.ETA !== "PUBLIC" || readiness?.decision !== "PASS"');
    expect(readinessSource).toContain('evaluation.capabilities[capability].decision !== "PASS"');
    expect(readinessSource).toContain('effective[capability] = "SHADOW"');
  });

  it("does not add persistence or streaming to the rollout model", () => {
    expect(rolloutSource).not.toContain("PredictiveObservation");
    expect(rolloutSource).not.toContain("EventSource");
    expect(rolloutSource).not.toContain("ReadableStream");
  });
});
