import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const graduation = readFileSync(new URL("../lib/operational-twin/trajectory-quality-v3-graduation.ts", import.meta.url), "utf8");
const v2Graduation = readFileSync(new URL("../lib/operational-twin/trajectory-quality-graduation.ts", import.meta.url), "utf8");
const promotion = readFileSync(new URL("../lib/operational-twin/trajectory-quality-promotion.ts", import.meta.url), "utf8");
const aircraftState = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const calibrationRoute = readFileSync(new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url), "utf8");
const calibrationCenter = readFileSync(new URL("../components/digital-twin-calibration-center.tsx", import.meta.url), "utf8");

describe("Trajectory Quality V3 Graduation boundaries", () => {
  it("derives only from Outcome Validation V2 and adds no capture or persistence path", () => {
    expect(graduation).toContain("OperationalTwinTrajectoryQualityOutcomeV2Report");
    expect(graduation).not.toContain("fetch(");
    expect(graduation).not.toContain("setInterval(");
    expect(graduation).not.toContain("setTimeout(");
    expect(graduation).not.toContain("exportCalibrationBuckets");
    expect(graduation).not.toContain("hydrateCalibrationBuckets");
  });

  it("keeps the existing V2 graduation and promotion contracts independent", () => {
    expect(v2Graduation).toContain("OperationalTwinTrajectoryQualityOutcomeReport");
    expect(v2Graduation).not.toContain("OperationalTwinTrajectoryQualityOutcomeV2Report");
    expect(promotion).toContain('"TRAJECTORY_QUALITY_V2"');
    expect(promotion).not.toContain('"TRAJECTORY_QUALITY_V3"');
    expect(graduation).toContain("v3PromotionImplemented: false");
    expect(graduation).toContain("v2PromotionRemainsIndependent: true");
    expect(graduation).toContain("autoPromotion: false");
  });

  it("guards V3 against V2 across horizon, phase, performance class and profile", () => {
    expect(graduation).toContain("maximumHorizonRegressionFractionVsV2");
    expect(graduation).toContain("maximumPhaseRegressionFractionVsV2");
    expect(graduation).toContain("maximumPerformanceClassRegressionFractionVsV2");
    expect(graduation).toContain("maximumV3ProfileRegressionFractionVsV2");
    expect(graduation).toContain("outcome.performanceClasses");
    expect(graduation).toContain("outcome.v3Profiles");
  });

  it("exposes the V3 graduation report in diagnostics and the admin Calibration Center only", () => {
    expect(aircraftState).toContain("getOperationalTwinTrajectoryQualityV3GraduationReport");
    expect(calibrationRoute).toContain("trajectoryQualityV3Graduation");
    expect(calibrationCenter).toContain('data-testid="calibration-trajectory-quality-v3-graduation"');
    expect(calibrationCenter).toContain("performanceClassRegressions");
    expect(calibrationCenter).toContain("v3ProfileRegressions");
  });
});
