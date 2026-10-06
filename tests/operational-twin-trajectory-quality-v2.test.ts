import { describe, expect, it } from "vitest";
import { buildOperationalTwinCorridor, type OperationalTwinAircraftState } from "@/lib/operational-twin";
import {
  buildOperationalTwinTrajectoryQualityV2,
  classifyOperationalTwinTrajectoryPhase,
} from "@/lib/operational-twin/trajectory-quality-v2";

const now = new Date("2026-10-06T10:00:00.000Z");

function aircraft(overrides: Partial<OperationalTwinAircraftState> = {}): OperationalTwinAircraftState {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: null,
    observedAt: now.toISOString(),
    lat: 49,
    lon: 16,
    altitudeFt: 10_000,
    groundSpeedKt: 300,
    trackDeg: 90,
    verticalRateFpm: 1_000,
    onGround: false,
    ...overrides,
  };
}

describe("Operational Digital Twin Trajectory Quality V2", () => {
  it("classifies the current vertical phase conservatively", () => {
    expect(classifyOperationalTwinTrajectoryPhase(10_000, 900)).toBe("CLIMB");
    expect(classifyOperationalTwinTrajectoryPhase(30_000, -800)).toBe("DESCENT");
    expect(classifyOperationalTwinTrajectoryPhase(30_000, 100)).toBe("CRUISE");
    expect(classifyOperationalTwinTrajectoryPhase(8_000, 100)).toBe("LEVEL");
    expect(classifyOperationalTwinTrajectoryPhase(null, 900)).toBe("UNKNOWN");
  });

  it("tapers climb rate instead of holding the current rate for ten minutes", () => {
    const state = aircraft({ altitudeFt: 10_000, verticalRateFpm: 1_000 });
    const corridor = buildOperationalTwinCorridor(state, null, now)!;
    const quality = buildOperationalTwinTrajectoryQualityV2({ aircraft: state, corridor });

    expect(quality.status).toBe("AVAILABLE");
    expect(quality.phase).toBe("CLIMB");
    expect(quality.verticalProfile).toBe("RATE_TAPERED");
    expect(quality.checkpoints.find((item) => item.offsetMinutes === 15)).toMatchObject({
      canonicalAltitudeFt: 20_000,
      qualityAltitudeFt: 17_500,
      altitudeDeltaFt: -2_500,
    });
  });

  it("tapers descent symmetrically and preserves the canonical horizontal path", () => {
    const state = aircraft({ altitudeFt: 30_000, verticalRateFpm: -1_000 });
    const corridor = buildOperationalTwinCorridor(state, null, now)!;
    const quality = buildOperationalTwinTrajectoryQualityV2({ aircraft: state, corridor });

    expect(quality.checkpoints.find((item) => item.offsetMinutes === 15)).toMatchObject({
      canonicalAltitudeFt: 20_000,
      qualityAltitudeFt: 22_500,
      altitudeDeltaFt: 2_500,
    });
    expect(quality.points.map(({ lat, lon, trackDeg, uncertaintyNm }) => ({ lat, lon, trackDeg, uncertaintyNm })))
      .toEqual(corridor.points.map(({ lat, lon, trackDeg, uncertaintyNm }) => ({ lat, lon, trackDeg, uncertaintyNm })));
  });

  it("holds cruise/level altitude rather than amplifying small vertical-rate noise", () => {
    const state = aircraft({ altitudeFt: 32_000, verticalRateFpm: 180 });
    const corridor = buildOperationalTwinCorridor(state, null, now)!;
    const quality = buildOperationalTwinTrajectoryQualityV2({ aircraft: state, corridor });

    expect(quality.phase).toBe("CRUISE");
    expect(quality.verticalProfile).toBe("ALTITUDE_HOLD");
    expect(quality.points.every((point) => point.altitudeFt === 32_000)).toBe(true);
  });

  it("fails closed when altitude is unavailable and never promotes itself", () => {
    const state = aircraft({ altitudeFt: null, verticalRateFpm: 1_000 });
    const corridor = buildOperationalTwinCorridor(state, null, now)!;
    const quality = buildOperationalTwinTrajectoryQualityV2({ aircraft: state, corridor });

    expect(quality.status).toBe("INSUFFICIENT");
    expect(quality.points).toEqual([]);
    expect(quality.canonicalRemainsActive).toBe(true);
    expect(quality.autoPromotion).toBe(false);
    expect(quality.limitations).toContain("SHADOW_ONLY");
    expect(quality.limitations).toContain("NOT_FMS_INTENT");
  });
});
