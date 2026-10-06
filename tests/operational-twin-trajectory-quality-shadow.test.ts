import { describe, expect, it } from "vitest";
import { buildOperationalTwinTrajectoryQualityShadow } from "@/lib/operational-twin/trajectory-quality-shadow";
import type { OperationalTwinAircraftState } from "@/lib/operational-twin/corridor";
import type { OperationalTwinCorridor } from "@/lib/operational-twin/types";

const aircraft: OperationalTwinAircraftState = {
  icaoHex: "ABC123",
  callsign: "TEST123",
  registration: null,
  observedAt: "2026-10-06T09:00:00.000Z",
  lat: 50,
  lon: 14,
  altitudeFt: 12000,
  groundSpeedKt: 300,
  trackDeg: 90,
  verticalRateFpm: -1200,
  onGround: false,
};

const corridor: OperationalTwinCorridor = {
  horizonMinutes: 30,
  stepMinutes: 2,
  mode: "ROUTE_AWARE",
  routeAdherence: "ON_ROUTE",
  routePrecision: "PRECISE",
  maxUncertaintyNm: 6,
  points: Array.from({ length: 16 }, (_, index) => {
    const offsetMinutes = index * 2;
    return {
      offsetMinutes,
      at: new Date(Date.parse("2026-10-06T09:00:00.000Z") + offsetMinutes * 60_000).toISOString(),
      lat: 50,
      lon: 14 + index * 0.1,
      altitudeFt: Math.max(0, 12000 - 1200 * Math.min(offsetMinutes, 10)),
      trackDeg: 90,
      uncertaintyNm: Number((0.8 + 0.18 * offsetMinutes).toFixed(2)),
      mode: "ROUTE_AWARE" as const,
    };
  }),
  waypoints: [],
};

describe("Operational Digital Twin trajectory quality shadow V1", () => {
  it("classifies descent and damps vertical-rate continuation after five minutes", () => {
    const shadow = buildOperationalTwinTrajectoryQualityShadow(aircraft, corridor);
    expect(shadow.status).toBe("AVAILABLE");
    expect(shadow.phase).toBe("DESCENT");
    const fifteen = shadow.checkpoints.find((item) => item.offsetMinutes === 15);
    expect(fifteen?.candidateAltitudeFt).toBe(0);
    expect(shadow.canonicalRemainsActive).toBe(true);
  });

  it("keeps the candidate shadow-only and reports bounded checkpoints", () => {
    const shadow = buildOperationalTwinTrajectoryQualityShadow({ ...aircraft, verticalRateFpm: 0, altitudeFt: 32000 }, corridor);
    expect(shadow.phase).toBe("CRUISE");
    expect(shadow.checkpoints.map((item) => item.offsetMinutes)).toEqual([5, 15, 30]);
    expect(shadow.limitations).toContain("SHADOW_ONLY");
    expect(shadow.limitations).toContain("SAME_HORIZONTAL_GEOMETRY_V1");
  });
});
