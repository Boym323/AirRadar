import { describe, expect, it } from "vitest";
import {
  applyOperationalTwinTrajectoryQualityPromotion,
  OPERATIONAL_TWIN_TRAJECTORY_QUALITY_PROMOTION_VERSION,
} from "@/lib/operational-twin/trajectory-quality-promotion";
import type { OperationalTwinTrajectoryQualityGraduationReport } from "@/lib/operational-twin/trajectory-quality-graduation";
import type { OperationalTwinTrajectoryQualityV2 } from "@/lib/operational-twin/trajectory-quality-v2";
import type { OperationalTwinCorridor } from "@/lib/operational-twin/types";

const corridor: OperationalTwinCorridor = {
  horizonMinutes: 30,
  stepMinutes: 10,
  mode: "ROUTE_AWARE",
  routeAdherence: "ON_ROUTE",
  routePrecision: "PRECISE",
  maxUncertaintyNm: 6,
  points: [
    { offsetMinutes: 0, at: "2026-10-06T12:00:00.000Z", lat: 49, lon: 17, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
    { offsetMinutes: 10, at: "2026-10-06T12:10:00.000Z", lat: 49, lon: 17.5, altitudeFt: 22000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" },
    { offsetMinutes: 20, at: "2026-10-06T12:20:00.000Z", lat: 49, lon: 18, altitudeFt: 16000, trackDeg: 90, uncertaintyNm: 4, mode: "ROUTE_AWARE" },
    { offsetMinutes: 30, at: "2026-10-06T12:30:00.000Z", lat: 49, lon: 18.5, altitudeFt: 10000, trackDeg: 90, uncertaintyNm: 6, mode: "ROUTE_AWARE" },
  ],
  waypoints: [],
};

function graduation(decision: "PASS" | "WAIT" | "FAIL"): OperationalTwinTrajectoryQualityGraduationReport {
  return {
    decision,
    manualPromotionEligible: decision === "PASS",
  } as OperationalTwinTrajectoryQualityGraduationReport;
}

function quality(status: "AVAILABLE" | "INSUFFICIENT" = "AVAILABLE"): OperationalTwinTrajectoryQualityV2 {
  return {
    version: "operational-digital-twin-trajectory-quality-v2",
    status,
    phase: "DESCENT",
    verticalProfile: status === "AVAILABLE" ? "RATE_TAPERED" : "UNAVAILABLE",
    points: status === "AVAILABLE"
      ? corridor.points.map((point, index) => ({
          ...point,
          altitudeFt: [30000, 25000, 21000, 18000][index]!,
        }))
      : [],
    checkpoints: [],
    canonicalRemainsActive: true,
    autoPromotion: false,
    limitations: [
      "SHADOW_ONLY",
      "NO_AIRCRAFT_PERFORMANCE_MODEL",
      "NO_ATC_CLEARANCE_INFERENCE",
      "HORIZONTAL_PATH_UNCHANGED",
      "NOT_FMS_INTENT",
    ],
  };
}

describe("Digital Twin Trajectory Quality Promotion V1", () => {
  it("keeps canonical corridor when policy is not manually enabled", () => {
    const result = applyOperationalTwinTrajectoryQualityPromotion({
      corridor,
      trajectoryQualityV2: quality(),
      graduation: graduation("PASS"),
      configuredPolicy: "CANONICAL",
    });

    expect(result.status.version).toBe(OPERATIONAL_TWIN_TRAJECTORY_QUALITY_PROMOTION_VERSION);
    expect(result.status.effectivePolicy).toBe("CANONICAL");
    expect(result.status.failClosed).toBe(false);
    expect(result.corridor.points.map((point) => point.altitudeFt))
      .toEqual(corridor.points.map((point) => point.altitudeFt));
  });

  it("promotes only corridor altitude after explicit policy plus graduation PASS", () => {
    const result = applyOperationalTwinTrajectoryQualityPromotion({
      corridor,
      trajectoryQualityV2: quality(),
      graduation: graduation("PASS"),
      configuredPolicy: "TRAJECTORY_QUALITY_V2",
    });

    expect(result.status).toMatchObject({
      effectivePolicy: "TRAJECTORY_QUALITY_V2",
      promotedPoints: 4,
      failClosed: false,
      fallbackReason: null,
      scope: "CORRIDOR_ALTITUDE_PRESENTATION_ONLY",
      canonicalCalibrationRemainsActive: true,
      downstreamSemanticsRemainCanonical: true,
      horizontalGeometryUnchanged: true,
    });
    expect(result.corridor.points.map((point) => point.altitudeFt))
      .toEqual([30000, 25000, 21000, 18000]);
    expect(result.corridor.points.map(({ altitudeFt: _altitudeFt, ...point }) => point))
      .toEqual(corridor.points.map(({ altitudeFt: _altitudeFt, ...point }) => point));
  });

  it("fails closed to canonical when graduation is not PASS", () => {
    const result = applyOperationalTwinTrajectoryQualityPromotion({
      corridor,
      trajectoryQualityV2: quality(),
      graduation: graduation("WAIT"),
      configuredPolicy: "TRAJECTORY_QUALITY_V2",
    });

    expect(result.status).toMatchObject({
      effectivePolicy: "CANONICAL",
      failClosed: true,
      fallbackReason: "graduation_not_pass",
    });
    expect(result.corridor.points).toEqual(corridor.points);
  });

  it("fails closed when the current quality shadow is unavailable", () => {
    const result = applyOperationalTwinTrajectoryQualityPromotion({
      corridor,
      trajectoryQualityV2: quality("INSUFFICIENT"),
      graduation: graduation("PASS"),
      configuredPolicy: "TRAJECTORY_QUALITY_V2",
    });

    expect(result.status).toMatchObject({
      effectivePolicy: "CANONICAL",
      failClosed: true,
      fallbackReason: "trajectory_quality_unavailable",
    });
  });

  it("rejects any horizontal geometry drift before promotion", () => {
    const drifted = quality();
    drifted.points = drifted.points.map((point, index) =>
      index === 2 ? { ...point, lon: point.lon + 0.01 } : point
    );

    const result = applyOperationalTwinTrajectoryQualityPromotion({
      corridor,
      trajectoryQualityV2: drifted,
      graduation: graduation("PASS"),
      configuredPolicy: "TRAJECTORY_QUALITY_V2",
    });

    expect(result.status).toMatchObject({
      effectivePolicy: "CANONICAL",
      failClosed: true,
      fallbackReason: "geometry_mismatch",
    });
    expect(result.corridor.points).toEqual(corridor.points);
  });
});
