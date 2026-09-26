import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../lib/radar/aircraft-motion-runtime.ts", import.meta.url), "utf8");

describe("aircraft motion runtime boundary", () => {
  it("keeps animation lifecycle outside AirRadarApp", () => {
    expect(appSource).toContain("createAircraftMotionRuntime");
    expect(appSource).toContain("aircraftMotionRuntimeRef");
    expect(appSource).not.toContain("AircraftAnimationJob");
    expect(appSource).not.toContain("animationFrameRef");
    expect(appSource).not.toContain("animationSchedulerRef");
    expect(appSource).not.toContain("motionAt(");
    expect(appSource).not.toContain("confirmedInterpolationDurationMs");
  });

  it("owns interpolation, RAF scheduling and visibility cleanup in the runtime", () => {
    expect(runtimeSource).toContain("class AircraftMotionRuntime");
    expect(runtimeSource).toContain("requestAnimationFrame");
    expect(runtimeSource).toContain("visibilitychange");
    expect(runtimeSource).toContain("motionObservationAdvances");
    expect(runtimeSource).toContain("confirmedInterpolationDurationMs");
    expect(runtimeSource).toContain("recordAnimationFrame");
    expect(runtimeSource).toContain('getSource("selected-trail-live-tail")');
  });
});
