import { describe, expect, it } from "vitest";
import { cameraElevationFromOrientation, projectAircraftToCamera, resolveCameraObserverAltitude } from "@/lib/spotter-camera-ar-projection";
describe("V6-C opt-in spotter camera geometry", () => {
  it("projects a forward level aircraft at the frame center", () => {
    const point = projectAircraftToCamera(90, 10, 90, 10);
    expect(point?.xPercent).toBeCloseTo(50);
    expect(point?.yPercent).toBeCloseTo(50);
  });
  it("rejects off-camera and malformed positions", () => {
    expect(projectAircraftToCamera(200, 10, 90, 10)).toBeNull();
    expect(projectAircraftToCamera(90, 80, 90, 0)).toBeNull();
    expect(projectAircraftToCamera(Number.NaN, 0, 0, 0)).toBeNull();
  });
  it("requires actual observer altitude, GPS or explicitly entered", () => {
    expect(resolveCameraObserverAltitude(null, "")).toBeNull();
    expect(resolveCameraObserverAltitude(null, "250")).toBe(250);
    expect(resolveCameraObserverAltitude(260, "250")).toBe(260);
    expect(resolveCameraObserverAltitude(null, "abc")).toBeNull();
    expect(resolveCameraObserverAltitude(null, "999999")).toBeNull();
  });
  it("fails closed on unavailable or rotated tilt", () => {
    expect(cameraElevationFromOrientation({ beta: 90, gamma: 0 })).toBeCloseTo(0);
    expect(cameraElevationFromOrientation({ beta: null, gamma: 0 })).toBeNull();
    expect(cameraElevationFromOrientation({ beta: 90, gamma: 70 })).toBeNull();
  });
});
