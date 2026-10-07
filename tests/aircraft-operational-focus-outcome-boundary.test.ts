import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aircraftStateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const twinSource = readFileSync(new URL("../lib/server/operational-twin.ts", import.meta.url), "utf8");
const calibrationRouteSource = readFileSync(new URL("../app/api/admin/operational-twin/calibration/route.ts", import.meta.url), "utf8");
const calibrationComponentSource = readFileSync(new URL("../components/digital-twin-calibration-center.tsx", import.meta.url), "utf8");
const validatorSource = readFileSync(new URL("../lib/operational-twin/aircraft-operational-focus-outcome.ts", import.meta.url), "utf8");

describe("Aircraft Operational Focus Outcome Validation V1 boundary", () => {
  it("captures only after the final Operational Focus is built", () => {
    expect(twinSource.indexOf("buildAircraftOperationalFocus")).toBeLessThan(
      twinSource.indexOf("captureOperationalFocusOutcome(finalSituation, sigmets)"),
    );
  });

  it("samples truth only from the existing LOCAL receiver refresh path", () => {
    expect(aircraftStateSource).toContain("operationalFocusOutcome.observe(this.localAircraft");
    expect(aircraftStateSource).not.toContain("operationalFocusOutcome.observe(this.networkAircraft");
    expect(validatorSource).not.toContain("setInterval");
    expect(validatorSource).not.toContain("fetch(");
  });

  it("keeps non-independent focus domains explicitly unscored", () => {
    expect(validatorSource).toContain('"PIREP_WEATHER_UNSCORED"');
    expect(validatorSource).toContain('"NAVIGATION_INTEGRITY_UNSCORED"');
    expect(validatorSource).toContain('"PLANNED_AIRSPACE_UNSCORED"');
    expect(validatorSource).toContain('"TRAJECTORY_UNSCORED"');
  });

  it("surfaces the read-only report in the existing Calibration Center", () => {
    expect(calibrationRouteSource).toContain("getOperationalFocusOutcomeReport()");
    expect(calibrationComponentSource).toContain('data-testid="calibration-focus-outcome"');
    expect(calibrationComponentSource).not.toContain("setInterval");
  });
});
