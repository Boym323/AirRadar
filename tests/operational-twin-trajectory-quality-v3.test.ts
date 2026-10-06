import { describe, expect, it } from "vitest";
import {
  buildOperationalTwinCorridor,
  buildOperationalTwinTrajectoryQualityV2,
  buildOperationalTwinTrajectoryQualityV3,
  classifyOperationalTwinPerformance,
  type OperationalTwinAircraftState,
} from "@/lib/operational-twin";

const now = new Date("2026-10-06T14:00:00.000Z");

function aircraft(overrides: Partial<OperationalTwinAircraftState> = {}): OperationalTwinAircraftState {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: "OK-TEST",
    observedAt: now.toISOString(),
    lat: 49,
    lon: 16,
    altitudeFt: 10_000,
    groundSpeedKt: 300,
    trackDeg: 90,
    verticalRateFpm: 1_000,
    onGround: false,
    aircraftType: "A320",
    aircraftDescription: "L2J",
    category: "A3",
    selectedAltitudeFt: null,
    selectedAltitudeSource: null,
    ...overrides,
  };
}

function quality(state: OperationalTwinAircraftState) {
  const corridor = buildOperationalTwinCorridor(state, null, now)!;
  const v2 = buildOperationalTwinTrajectoryQualityV2({ aircraft: state, corridor });
  const v3 = buildOperationalTwinTrajectoryQualityV3({
    aircraft: state,
    corridor,
    trajectoryQualityV2: v2,
  });
  return { corridor, v2, v3 };
}

describe("Operational Digital Twin Trajectory Quality V3", () => {
  it("classifies conservative propulsion envelopes from ICAO description metadata", () => {
    expect(classifyOperationalTwinPerformance({ aircraftDescription: "L2J", category: "A3" })).toMatchObject({
      performanceClass: "JET",
      size: "LARGE",
      maxVerticalRateFpm: 3_200,
      source: "ICAO_DESCRIPTION",
    });
    expect(classifyOperationalTwinPerformance({ aircraftDescription: "L2T", category: "A2" }).performanceClass).toBe("TURBOPROP");
    expect(classifyOperationalTwinPerformance({ aircraftDescription: "L1P", category: "A1" }).performanceClass).toBe("PISTON");
    expect(classifyOperationalTwinPerformance({ aircraftDescription: null, category: "A7" }).performanceClass).toBe("ROTORCRAFT");
  });

  it("uses an aligned selected-altitude signal as a bounded level-off target", () => {
    const { v3 } = quality(aircraft({
      altitudeFt: 10_000,
      verticalRateFpm: 1_000,
      selectedAltitudeFt: 12_000,
      selectedAltitudeSource: "MCP/FCU",
    }));

    expect(v3.status).toBe("AVAILABLE");
    expect(v3.verticalProfile).toBe("SELECTED_ALTITUDE_CAPTURE");
    expect(v3.selectedAltitude).toMatchObject({
      altitudeFt: 12_000,
      source: "MCP/FCU",
      accepted: true,
      estimatedCaptureMinutes: 2,
      rejectionReason: null,
    });
    expect(v3.points.find((point) => point.offsetMinutes === 2)?.altitudeFt).toBe(12_000);
    expect(v3.points.find((point) => point.offsetMinutes === 30)?.altitudeFt).toBe(12_000);
  });

  it("rejects selected altitude that conflicts with the observed vertical direction", () => {
    const { v3 } = quality(aircraft({
      altitudeFt: 10_000,
      verticalRateFpm: 1_200,
      selectedAltitudeFt: 8_000,
      selectedAltitudeSource: "MCP/FCU",
    }));

    expect(v3.selectedAltitude.accepted).toBe(false);
    expect(v3.selectedAltitude.rejectionReason).toBe("direction_mismatch");
    expect(v3.verticalProfile).toBe("PERFORMANCE_TAPERED");
  });

  it("caps extreme vertical rate through the performance envelope", () => {
    const { v3 } = quality(aircraft({
      aircraftDescription: "L2T",
      category: "A2",
      altitudeFt: 10_000,
      verticalRateFpm: 5_000,
    }));

    expect(v3.performance.maxVerticalRateFpm).toBe(2_400);
    expect(v3.verticalProfile).toBe("PERFORMANCE_TAPERED");
    expect(v3.points.find((point) => point.offsetMinutes === 2)?.altitudeFt).toBe(14_800);
  });

  it("falls back exactly to V2 when no performance class or selected-altitude signal is available", () => {
    const { v2, v3 } = quality(aircraft({
      aircraftDescription: null,
      category: null,
      selectedAltitudeFt: null,
      selectedAltitudeSource: null,
    }));

    expect(v3.verticalProfile).toBe("V2_FALLBACK");
    expect(v3.points).toEqual(v2.points);
  });

  it("holds level/cruise altitude instead of treating small rate noise as intent", () => {
    const { v3 } = quality(aircraft({
      altitudeFt: 32_000,
      verticalRateFpm: 150,
      selectedAltitudeFt: 35_000,
      selectedAltitudeSource: "FMS",
    }));

    expect(v3.phase).toBe("CRUISE");
    expect(v3.verticalProfile).toBe("ALTITUDE_HOLD");
    expect(v3.selectedAltitude.accepted).toBe(false);
    expect(v3.selectedAltitude.rejectionReason).toBe("phase_not_vertical");
    expect(v3.points.every((point) => point.altitudeFt === 32_000)).toBe(true);
  });

  it("preserves every canonical horizontal and timing field", () => {
    const { corridor, v3 } = quality(aircraft({
      selectedAltitudeFt: 14_000,
      selectedAltitudeSource: "MCP/FCU",
    }));

    expect(v3.points.map(({ offsetMinutes, at, lat, lon, trackDeg, uncertaintyNm, mode }) => ({
      offsetMinutes,
      at,
      lat,
      lon,
      trackDeg,
      uncertaintyNm,
      mode,
    }))).toEqual(corridor.points.map(({ offsetMinutes, at, lat, lon, trackDeg, uncertaintyNm, mode }) => ({
      offsetMinutes,
      at,
      lat,
      lon,
      trackDeg,
      uncertaintyNm,
      mode,
    })));
    expect(v3.canonicalRemainsActive).toBe(true);
    expect(v3.v2RemainsPromotionCandidate).toBe(true);
    expect(v3.autoPromotion).toBe(false);
  });

  it("fails closed when altitude is unavailable", () => {
    const { v3 } = quality(aircraft({ altitudeFt: null }));

    expect(v3.status).toBe("INSUFFICIENT");
    expect(v3.verticalProfile).toBe("UNAVAILABLE");
    expect(v3.points).toEqual([]);
    expect(v3.autoPromotion).toBe(false);
    expect(v3.limitations).toContain("SHADOW_ONLY");
    expect(v3.limitations).toContain("SELECTED_ALTITUDE_IS_NOT_CLEARANCE");
  });
});
