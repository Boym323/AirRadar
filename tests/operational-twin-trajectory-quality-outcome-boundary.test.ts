import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const twinServer = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const aircraftState = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const calibrationRoute = readFileSync(new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url), "utf8");
const calibrationCenter = readFileSync(new URL("../components/digital-twin-calibration-center.tsx", import.meta.url), "utf8");
const validator = readFileSync(new URL("../lib/operational-twin/trajectory-quality-outcome.ts", import.meta.url), "utf8");

describe("Trajectory Quality Outcome Validation V1 boundaries", () => {
  it("captures from the existing Digital Twin request and samples truth from the existing LOCAL refresh", () => {
    expect(twinServer).toContain("captureOperationalTwinTrajectoryQualityOutcome(situation)");
    expect(aircraftState).toContain("operationalTwinTrajectoryQualityOutcome.observeTruth(this.localAircraft, now)");
    expect(aircraftState).toContain("scheduleOperationalTwinCalibrationSample(now)");
    expect(validator).not.toContain("fetch(");
    expect(validator).not.toContain("setInterval(");
    expect(validator).not.toContain("setTimeout(");
  });

  it("keeps the validation lane process-local and non-promoting", () => {
    expect(validator).toContain('"PROCESS_LOCAL_V1"');
    expect(validator).toContain("canonicalRemainsActive: true");
    expect(validator).toContain("autoPromotion: false");
    expect(validator).toContain('"OUTCOME_MEASUREMENT_ONLY"');
  });

  it("exposes the report only through the existing admin Calibration Center endpoint", () => {
    expect(calibrationRoute).toContain("getOperationalTwinTrajectoryQualityOutcomeReport()");
    expect(calibrationRoute).toContain("trajectoryQuality");
    expect(calibrationCenter).toContain('data-testid="calibration-trajectory-quality-outcome"');
  });
});
