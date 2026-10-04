import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const truthSource = readFileSync(new URL("../lib/predictive-intelligence/outcome-truth.ts", import.meta.url), "utf8");
const readinessSource = readFileSync(new URL("../lib/server/predictive-readiness.ts", import.meta.url), "utf8");
const predictionRouteSource = readFileSync(new URL("../app/api/aircraft/[hex]/prediction/route.ts", import.meta.url), "utf8");

describe("Predictive Outcome Truth V1 boundary", () => {
  it("keeps truth scoring independent from the predictive engine and server state", () => {
    expect(truthSource).not.toMatch(/predictive-intelligence\/(engine|state|config|calibration)/);
    expect(truthSource).not.toMatch(/@\/lib\/server\//);
    expect(truthSource).not.toContain("getPrisma");
    expect(truthSource).not.toContain("FlightPosition");
  });

  it("uses outcome truth only through the bounded readiness collector", () => {
    expect(readinessSource).toContain('from "@/lib/predictive-intelligence/outcome-truth"');
    expect(readinessSource).toContain("scoreRunwayChangeOutcome");
    expect(readinessSource).toContain("scoreTrajectoryOutcome");
    expect(readinessSource).toContain("PREDICTIVE_READINESS_OUTCOME_EVENT_LIMIT = 2_500");
    expect(readinessSource).toContain("PREDICTIVE_READINESS_OUTCOME_TYPES");
  });

  it("keeps public prediction serialization isolated from raw outcome events", () => {
    expect(predictionRouteSource).not.toContain("outcome-truth");
    expect(predictionRouteSource).not.toContain("FlightEvent");
    expect(predictionRouteSource).toContain("readPredictiveReadinessReport");
    expect(predictionRouteSource).toContain("enforcePredictiveReadiness");
  });

  it("does not add a write or historical FlightPosition lane to readiness", () => {
    expect(readinessSource).not.toContain("FlightPosition");
    expect(readinessSource).not.toContain(".create(");
    expect(readinessSource).not.toContain(".update(");
    expect(readinessSource).not.toContain(".delete(");
  });

  it("versions outcome semantics separately from readiness thresholds", () => {
    expect(truthSource).toContain('PREDICTIVE_OUTCOME_TRUTH_VERSION = "predictive-outcome-truth-v1"');
    expect(readinessSource).toContain("outcomeTruthVersion: PREDICTIVE_OUTCOME_TRUTH_VERSION");
    expect(readinessSource).toContain("PREDICTIVE_READINESS_THRESHOLDS");
  });
});
