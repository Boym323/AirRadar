import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const twinServer = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const aircraftState = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const calibrationRoute = readFileSync(new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url), "utf8");
const calibrationCenter = readFileSync(new URL("../components/digital-twin-calibration-center.tsx", import.meta.url), "utf8");
const validator = readFileSync(new URL("../lib/operational-twin/trajectory-quality-outcome.ts", import.meta.url), "utf8");
const calibrationPersistence = readFileSync(new URL("../lib/server/operational-twin-calibration-persistence.ts", import.meta.url), "utf8");
const graduation = readFileSync(new URL("../lib/operational-twin/trajectory-quality-graduation.ts", import.meta.url), "utf8");

describe("Trajectory Quality Outcome Validation V1 boundaries", () => {
  it("captures from the existing Digital Twin request and samples truth from the existing LOCAL refresh", () => {
    expect(twinServer).toContain("captureOperationalTwinTrajectoryQualityOutcome(situation)");
    expect(aircraftState).toContain("operationalTwinTrajectoryQualityOutcome.observeTruth(this.localAircraft, now)");
    expect(aircraftState).toContain("scheduleOperationalTwinCalibrationSample(now)");
    expect(validator).not.toContain("fetch(");
    expect(validator).not.toContain("setInterval(");
    expect(validator).not.toContain("setTimeout(");
  });

  it("persists only anonymous aggregates and remains non-promoting", () => {
    expect(validator).toContain('"RESTART_STABLE_AGGREGATES"');
    expect(validator).toContain("exportCalibrationBuckets");
    expect(validator).toContain("hydrateCalibrationBuckets");
    expect(validator).toContain("canonicalRemainsActive: true");
    expect(validator).toContain("autoPromotion: false");
    expect(validator).toContain('"OUTCOME_MEASUREMENT_ONLY"');
    expect(calibrationPersistence).toContain('"TRAJECTORY_QUALITY_OUTCOME"');
    expect(calibrationPersistence).toContain("hydratedTrajectoryQualityOutcomeBuckets");
  });

  it("exposes outcome and graduation only through the existing admin Calibration Center endpoint", () => {
    expect(calibrationRoute).toContain("getOperationalTwinTrajectoryQualityOutcomeReport()");
    expect(calibrationRoute).toContain("getOperationalTwinTrajectoryQualityGraduationReport()");
    expect(calibrationRoute).toContain("trajectoryQuality");
    expect(calibrationRoute).toContain("trajectoryQualityGraduation");
    expect(calibrationCenter).toContain('data-testid="calibration-trajectory-quality-outcome"');
    expect(calibrationCenter).toContain('data-testid="calibration-trajectory-quality-graduation"');
  });

  it("keeps graduation manual and fail-closed without changing the canonical trajectory", () => {
    expect(graduation).toContain("manualPromotionEligible: decision === \"PASS\"");
    expect(graduation).toContain("autoPromotion: false");
    expect(graduation).toContain("canonicalTrajectoryRemainsActive: true");
    expect(graduation).toContain('"horizon_regression"');
    expect(graduation).toContain('"phase_regression"');
    expect(graduation).not.toContain("applyOperationalTwin");
  });
});
