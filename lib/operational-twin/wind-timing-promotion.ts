import type { OperationalTwinWindTimingGraduationReport } from "./event-outcome";
import type { OperationalTwinEvent } from "./types";
import type { OperationalTwinWindTimingShadow } from "./wind-timing-shadow";

export const OPERATIONAL_TWIN_WIND_TIMING_PROMOTION_VERSION =
  "operational-digital-twin-wind-timing-promotion-v1" as const;

export type OperationalTwinWindTimingPolicy = "CANONICAL" | "WIND_GRADUATED";
export type OperationalTwinWindTimingEffectivePolicy = "CANONICAL" | "WIND_GRADUATED";
export type OperationalTwinWindTimingFallbackReason =
  | "configured_canonical"
  | "graduation_not_pass"
  | "wind_shadow_unavailable"
  | "no_matching_waypoints"
  | null;

export interface OperationalTwinWindTimingPromotionStatus {
  version: typeof OPERATIONAL_TWIN_WIND_TIMING_PROMOTION_VERSION;
  configuredPolicy: OperationalTwinWindTimingPolicy;
  effectivePolicy: OperationalTwinWindTimingEffectivePolicy;
  graduationDecision: OperationalTwinWindTimingGraduationReport["decision"];
  manualPromotionEligible: boolean;
  promotedWaypointEvents: number;
  failClosed: boolean;
  fallbackReason: OperationalTwinWindTimingFallbackReason;
  canonicalCalibrationRemainsActive: true;
}

function promotedWaypoint(
  event: OperationalTwinEvent,
  shadow: OperationalTwinWindTimingShadow,
  generatedAtMs: number,
): OperationalTwinEvent | null {
  if (event.type !== "WAYPOINT") return null;
  const match = shadow.waypoints.find((waypoint) =>
    waypoint.name === event.title
    && Math.abs(waypoint.canonicalOffsetMinutes - event.offsetMinutes) <= 0.2
  );
  if (!match) return null;
  const atMs = generatedAtMs + match.shadowOffsetMinutes * 60_000;
  if (!Number.isFinite(atMs)) return null;
  return {
    ...event,
    offsetMinutes: Number(match.shadowOffsetMinutes.toFixed(1)),
    at: new Date(atMs).toISOString(),
  };
}

export function applyOperationalTwinWindTimingPromotion(input: {
  events: readonly OperationalTwinEvent[];
  windTimingShadow: OperationalTwinWindTimingShadow;
  graduation: OperationalTwinWindTimingGraduationReport;
  configuredPolicy: OperationalTwinWindTimingPolicy;
  generatedAt: Date;
}): {
  events: OperationalTwinEvent[];
  status: OperationalTwinWindTimingPromotionStatus;
} {
  const canonical = input.events.map((event) => ({ ...event }));
  const baseStatus = {
    version: OPERATIONAL_TWIN_WIND_TIMING_PROMOTION_VERSION,
    configuredPolicy: input.configuredPolicy,
    graduationDecision: input.graduation.decision,
    manualPromotionEligible: input.graduation.manualPromotionEligible,
    canonicalCalibrationRemainsActive: true as const,
  };

  if (input.configuredPolicy === "CANONICAL") {
    return {
      events: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedWaypointEvents: 0,
        failClosed: false,
        fallbackReason: "configured_canonical",
      },
    };
  }
  if (input.graduation.decision !== "PASS" || !input.graduation.manualPromotionEligible) {
    return {
      events: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedWaypointEvents: 0,
        failClosed: true,
        fallbackReason: "graduation_not_pass",
      },
    };
  }
  if (input.windTimingShadow.status !== "AVAILABLE") {
    return {
      events: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedWaypointEvents: 0,
        failClosed: true,
        fallbackReason: "wind_shadow_unavailable",
      },
    };
  }

  let promotedWaypointEvents = 0;
  const events = input.events.map((event) => {
    const promoted = promotedWaypoint(event, input.windTimingShadow, input.generatedAt.getTime());
    if (!promoted) return { ...event };
    promotedWaypointEvents += 1;
    return promoted;
  });

  if (promotedWaypointEvents === 0) {
    return {
      events: canonical,
      status: {
        ...baseStatus,
        effectivePolicy: "CANONICAL",
        promotedWaypointEvents: 0,
        failClosed: true,
        fallbackReason: "no_matching_waypoints",
      },
    };
  }

  return {
    events,
    status: {
      ...baseStatus,
      effectivePolicy: "WIND_GRADUATED",
      promotedWaypointEvents,
      failClosed: false,
      fallbackReason: null,
    },
  };
}
