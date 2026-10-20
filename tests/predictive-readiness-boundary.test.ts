import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEffectivePredictiveGraduationPolicy } from "@/lib/server/predictive-readiness";

const collectorSource = readFileSync(new URL("../lib/server/predictive-readiness.ts", import.meta.url), "utf8");
const systemPageSource = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");
const calibrationSource = readFileSync(new URL("../lib/predictive-intelligence/graduation-calibration.ts", import.meta.url), "utf8");

describe("Predictive Graduation Readiness boundary", () => {
  it("keeps the readiness collector bounded and outside FlightPosition history", () => {
    expect(collectorSource).toContain("PREDICTIVE_READINESS_OBSERVATION_LIMIT = 15_000");
    expect(collectorSource).toContain("PREDICTIVE_READINESS_LANDING_LIMIT = 2_500");
    expect(collectorSource).toContain("PREDICTIVE_READINESS_OUTCOME_EVENT_LIMIT = 2_500");
    expect(collectorSource).toContain("PredictiveObservation");
    expect(collectorSource).toContain("FlightEvent");
    expect(collectorSource).toContain("PREDICTIVE_READINESS_OUTCOME_TYPES");
    expect(collectorSource).toContain("outcomeComplete");
    expect(collectorSource).not.toContain("FlightPosition");
    expect(collectorSource).not.toContain(".create(");
    expect(collectorSource).not.toContain(".update(");
    expect(collectorSource).not.toContain(".delete(");
  });

  it("fails closed when any bounded outcome-event query reaches its limit", () => {
    expect(collectorSource).toContain("outcomeBatches.every((rows) => rows.length < PREDICTIVE_READINESS_OUTCOME_EVENT_LIMIT)");
    expect(collectorSource).toContain("&& rows.outcomeComplete");
  });

  it("does not query readiness while every capability remains SHADOW", async () => {
    await expect(getEffectivePredictiveGraduationPolicy({
      ETA: "SHADOW",
      RUNWAY: "SHADOW",
      RUNWAY_CHANGE: "SHADOW",
      TRAJECTORY: "SHADOW",
    })).resolves.toEqual({
      ETA: "SHADOW",
      RUNWAY: "SHADOW",
      RUNWAY_CHANGE: "SHADOW",
      TRAJECTORY: "SHADOW",
    });
    expect(collectorSource).toContain("if (!configuredPublic(configured)) return configured");
  });

  it("keeps graduation calibration admin-only and advisory", () => {
    expect(calibrationSource).toContain("manualReviewEligible");
    expect(calibrationSource).toContain("buildPredictiveGraduationCalibration");
    expect(existsSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url))).toBe(false);
  });

  it("no longer exposes the removed predictive readiness dashboard or API", () => {
    expect(existsSync(new URL("../app/api/admin/predictive/readiness/route.ts", import.meta.url))).toBe(false);
    expect(systemPageSource).not.toContain("/api/admin/predictive/readiness");
    expect(systemPageSource).not.toContain("PredictiveReadinessPanel");
    expect(systemPageSource).not.toContain("operationalTwinOutcome");
  });
});
