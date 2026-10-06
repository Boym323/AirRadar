import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const twinServer = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const aircraftState = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const validator = readFileSync(new URL("../lib/operational-twin/trajectory-quality-outcome-v2.ts", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../lib/server/operational-twin-calibration-persistence.ts", import.meta.url), "utf8");
const calibrationRoute = readFileSync(new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url), "utf8");
const calibrationCenter = readFileSync(new URL("../components/digital-twin-calibration-center.tsx", import.meta.url), "utf8");
const graduation = readFileSync(new URL("../lib/operational-twin/trajectory-quality-graduation.ts", import.meta.url), "utf8");

describe("Trajectory Quality Outcome Validation V2 boundaries", () => {
  it("uses the existing Digital Twin request lane and existing LOCAL refresh truth", () => {
    expect(twinServer).toContain("captureOperationalTwinTrajectoryQualityOutcomeV2(situation)");
    expect(aircraftState).toContain("operationalTwinTrajectoryQualityOutcomeV2.observeTruth(this.localAircraft, now)");
    expect(validator).not.toContain("fetch(");
    expect(validator).not.toContain("setInterval(");
    expect(validator).not.toContain("setTimeout(");
  });

  it("keeps V1 and V2 evidence isolated by persistence version while reusing the aggregate lane", () => {
    expect(validator).toContain("operational-digital-twin-trajectory-quality-outcome-v2");
    expect(persistence).toContain("OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION");
    expect(persistence).toContain("OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_VERSION");
    expect(persistence).toContain("trajectoryQualityOutcomeV2.exportCalibrationBuckets");
    expect(persistence).toContain("trajectoryQualityOutcomeV2.hydrateCalibrationBuckets");
    expect(persistence).toContain('LANE_TRAJECTORY_QUALITY_OUTCOME = "TRAJECTORY_QUALITY_OUTCOME"');
  });

  it("does not change the current V2 graduation or promotion contract", () => {
    expect(graduation).toContain("OperationalTwinTrajectoryQualityOutcomeReport");
    expect(graduation).not.toContain("OperationalTwinTrajectoryQualityOutcomeV2Report");
    expect(validator).toContain("changesPromotionPolicy: false");
    expect(validator).toContain('"NO_AUTO_GRADUATION"');
    expect(validator).toContain('"NO_PROMOTION_CHANGE"');
  });

  it("exposes triple comparison only in the admin Calibration Center", () => {
    expect(calibrationRoute).toContain("getOperationalTwinTrajectoryQualityOutcomeV2Report()");
    expect(calibrationRoute).toContain("trajectoryQualityComparison");
    expect(calibrationCenter).toContain('data-testid="calibration-trajectory-quality-outcome-v2"');
    expect(calibrationCenter).toContain("v3WinRateVsV2");
    expect(calibrationCenter).toContain("performanceClasses");
    expect(calibrationCenter).toContain("v3Profiles");
  });
});
