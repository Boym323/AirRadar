import type { OperationalTwinCorridor, OperationalTwinTrajectoryPoint } from "./types";
import type { OperationalTwinTrajectoryQualityGraduationReport } from "./trajectory-quality-graduation";
import type { OperationalTwinTrajectoryQualityV2 } from "./trajectory-quality-v2";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_PROMOTION_VERSION =
  "operational-digital-twin-trajectory-quality-promotion-v1" as const;

export type OperationalTwinTrajectoryQualityPolicy =
  | "CANONICAL"
  | "TRAJECTORY_QUALITY_V2";

export type OperationalTwinTrajectoryQualityEffectivePolicy =
  | "CANONICAL"
  | "TRAJECTORY_QUALITY_V2";

export type OperationalTwinTrajectoryQualityFallbackReason =
  | "configured_canonical"
  | "graduation_not_pass"
  | "trajectory_quality_unavailable"
  | "geometry_mismatch"
  | null;

export interface OperationalTwinTrajectoryQualityPromotionStatus {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_PROMOTION_VERSION;
  configuredPolicy: OperationalTwinTrajectoryQualityPolicy;
  effectivePolicy: OperationalTwinTrajectoryQualityEffectivePolicy;
  graduationDecision: OperationalTwinTrajectoryQualityGraduationReport["decision"];
  manualPromotionEligible: boolean;
  promotedPoints: number;
  failClosed: boolean;
  fallbackReason: OperationalTwinTrajectoryQualityFallbackReason;
  scope: "CORRIDOR_ALTITUDE_PRESENTATION_ONLY";
  canonicalCalibrationRemainsActive: true;
  downstreamSemanticsRemainCanonical: true;
  horizontalGeometryUnchanged: true;
}

function cloneCanonical(corridor: OperationalTwinCorridor): OperationalTwinCorridor {
  return {
    ...corridor,
    points: corridor.points.map((point) => ({ ...point })),
    waypoints: corridor.waypoints.map((waypoint) => ({ ...waypoint })),
  };
}

function sameHorizontalGeometry(
  canonical: OperationalTwinTrajectoryPoint,
  quality: OperationalTwinTrajectoryPoint,
): boolean {
  return canonical.offsetMinutes === quality.offsetMinutes
    && canonical.at === quality.at
    && canonical.lat === quality.lat
    && canonical.lon === quality.lon
    && canonical.trackDeg === quality.trackDeg
    && canonical.uncertaintyNm === quality.uncertaintyNm
    && canonical.mode === quality.mode;
}

export function applyOperationalTwinTrajectoryQualityPromotion(input: {
  corridor: OperationalTwinCorridor;
  trajectoryQualityV2: OperationalTwinTrajectoryQualityV2;
  graduation: OperationalTwinTrajectoryQualityGraduationReport;
  configuredPolicy: OperationalTwinTrajectoryQualityPolicy;
}): {
  corridor: OperationalTwinCorridor;
  status: OperationalTwinTrajectoryQualityPromotionStatus;
} {
  const canonical = cloneCanonical(input.corridor);
  const baseStatus = {
    version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_PROMOTION_VERSION,
    configuredPolicy: input.configuredPolicy,
    graduationDecision: input.graduation.decision,
    manualPromotionEligible: input.graduation.manualPromotionEligible,
    scope: "CORRIDOR_ALTITUDE_PRESENTATION_ONLY" as const,
    canonicalCalibrationRemainsActive: true as const,
    downstreamSemanticsRemainCanonical: true as const,
    horizontalGeometryUnchanged: true as const,
  };

  if (input.configuredPolicy === "CANONICAL") {
    return {
      corridor: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedPoints: 0,
        failClosed: false,
        fallbackReason: "configured_canonical",
      },
    };
  }

  if (
    input.graduation.decision !== "PASS"
    || !input.graduation.manualPromotionEligible
  ) {
    return {
      corridor: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedPoints: 0,
        failClosed: true,
        fallbackReason: "graduation_not_pass",
      },
    };
  }

  if (
    input.trajectoryQualityV2.status !== "AVAILABLE"
    || input.trajectoryQualityV2.points.length !== canonical.points.length
  ) {
    return {
      corridor: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedPoints: 0,
        failClosed: true,
        fallbackReason: "trajectory_quality_unavailable",
      },
    };
  }

  if (canonical.points.some((point, index) =>
    !sameHorizontalGeometry(point, input.trajectoryQualityV2.points[index]!)
  )) {
    return {
      corridor: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedPoints: 0,
        failClosed: true,
        fallbackReason: "geometry_mismatch",
      },
    };
  }

  const points = canonical.points.map((point, index) => ({
    ...point,
    altitudeFt: input.trajectoryQualityV2.points[index]!.altitudeFt,
  }));

  return {
    corridor: {
      ...canonical,
      points,
    },
    status: {
      ...baseStatus,
      effectivePolicy: "TRAJECTORY_QUALITY_V2",
      promotedPoints: points.length,
      failClosed: false,
      fallbackReason: null,
    },
  };
}
