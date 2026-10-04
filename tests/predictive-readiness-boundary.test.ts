import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEffectivePredictiveGraduationPolicy } from "@/lib/server/predictive-readiness";

const collectorSource = readFileSync(new URL("../lib/server/predictive-readiness.ts", import.meta.url), "utf8");
const publicRouteSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");
const adminRouteSource = readFileSync(new URL("../app/api/admin/predictive/readiness/route.ts", import.meta.url), "utf8");
const systemPageSource = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");

describe("Predictive Graduation Readiness boundary", () => {
  it("keeps the readiness collector bounded and outside FlightPosition history", () => {
    expect(collectorSource).toContain("PREDICTIVE_READINESS_OBSERVATION_LIMIT = 15_000");
    expect(collectorSource).toContain("PREDICTIVE_READINESS_LANDING_LIMIT = 2_500");
    expect(collectorSource).toContain("PredictiveObservation");
    expect(collectorSource).toContain("FlightEvent");
    expect(collectorSource).not.toContain("FlightPosition");
    expect(collectorSource).not.toContain(".create(");
    expect(collectorSource).not.toContain(".update(");
    expect(collectorSource).not.toContain(".delete(");
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

  it("guards public prediction exposure with one shared readiness report", () => {
    expect(publicRouteSource).toContain("readPredictiveReadinessReport");
    expect(publicRouteSource).toContain("enforcePredictiveReadiness");
    expect(publicRouteSource).toContain("toPublicPredictiveState(predictionState, effectivePolicy)");
    expect(publicRouteSource).toContain("buildPublicEtaAdvisory(predictionState, effectivePolicy, etaReadiness)");
    expect(publicRouteSource).toContain("buildPublicTrajectoryAdvisory(predictionState, effectivePolicy, trajectoryReadiness)");
  });

  it("keeps the readiness report admin-only and no-store", () => {
    expect(adminRouteSource).toContain("isWatchlistSessionValid(request)");
    expect(adminRouteSource).toContain('status: 401');
    expect(adminRouteSource).toContain('"Cache-Control": "no-store"');
    expect(adminRouteSource).toContain("readPredictiveReadinessReport()");
  });

  it("loads and renders readiness only for the admin system view", () => {
    expect(systemPageSource).toContain('fetch("/api/admin/predictive/readiness"');
    expect(systemPageSource).toContain('data?.detailLevel !== "admin"');
    expect(systemPageSource).toContain('data-testid="predictive-readiness"');
  });
});
