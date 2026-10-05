import { describe, expect, it } from "vitest";
import {
  applyOperationalTwinWindTimingPromotion,
  OPERATIONAL_TWIN_WIND_TIMING_PROMOTION_VERSION,
} from "@/lib/operational-twin/wind-timing-promotion";
import type { OperationalTwinWindTimingGraduationReport } from "@/lib/operational-twin/event-outcome";
import type { OperationalTwinEvent } from "@/lib/operational-twin/types";
import type { OperationalTwinWindTimingShadow } from "@/lib/operational-twin/wind-timing-shadow";

const event: OperationalTwinEvent = {
  id: "waypoint:VLM:2026-10-05T15:10:00.000Z",
  type: "WAYPOINT",
  offsetMinutes: 10,
  at: "2026-10-05T15:10:00.000Z",
  title: "VLM",
  detail: null,
  provenance: "PUBLISHED",
  confidence: "HIGH",
  source: "Route Intelligence V2",
  sourceReference: null,
  lat: 49,
  lon: 16,
  altitudeFt: null,
};

function graduation(decision: "PASS" | "WAIT" | "FAIL"): OperationalTwinWindTimingGraduationReport {
  return {
    decision,
    manualPromotionEligible: decision === "PASS",
  } as OperationalTwinWindTimingGraduationReport;
}

function shadow(status: "AVAILABLE" | "STALE" | "INSUFFICIENT" = "AVAILABLE"): OperationalTwinWindTimingShadow {
  return {
    status,
    waypoints: [{
      id: "VLM",
      name: "VLM",
      distanceNm: 50,
      canonicalOffsetMinutes: 10,
      shadowOffsetMinutes: 9,
      deltaSeconds: -60,
      sourceKind: "PUBLISHED_ATS",
    }],
  } as OperationalTwinWindTimingShadow;
}

describe("Digital Twin Wind Timing Promotion V1", () => {
  it("keeps canonical timing when policy is not manually enabled", () => {
    const result = applyOperationalTwinWindTimingPromotion({
      events: [event],
      windTimingShadow: shadow(),
      graduation: graduation("PASS"),
      configuredPolicy: "CANONICAL",
      generatedAt: new Date("2026-10-05T15:00:00.000Z"),
    });
    expect(result.status.version).toBe(OPERATIONAL_TWIN_WIND_TIMING_PROMOTION_VERSION);
    expect(result.status.effectivePolicy).toBe("CANONICAL");
    expect(result.events[0]?.at).toBe(event.at);
  });

  it("promotes waypoint timing only after explicit policy plus PASS", () => {
    const result = applyOperationalTwinWindTimingPromotion({
      events: [event],
      windTimingShadow: shadow(),
      graduation: graduation("PASS"),
      configuredPolicy: "WIND_GRADUATED",
      generatedAt: new Date("2026-10-05T15:00:00.000Z"),
    });
    expect(result.status).toMatchObject({
      effectivePolicy: "WIND_GRADUATED",
      promotedWaypointEvents: 1,
      failClosed: false,
      canonicalCalibrationRemainsActive: true,
    });
    expect(result.events[0]).toMatchObject({
      at: "2026-10-05T15:09:00.000Z",
      offsetMinutes: 9,
    });
  });

  it("fails closed to canonical immediately when graduation is not PASS", () => {
    const result = applyOperationalTwinWindTimingPromotion({
      events: [event],
      windTimingShadow: shadow(),
      graduation: graduation("WAIT"),
      configuredPolicy: "WIND_GRADUATED",
      generatedAt: new Date("2026-10-05T15:00:00.000Z"),
    });
    expect(result.status).toMatchObject({
      effectivePolicy: "CANONICAL",
      failClosed: true,
      fallbackReason: "graduation_not_pass",
    });
    expect(result.events[0]?.at).toBe(event.at);
  });
});
