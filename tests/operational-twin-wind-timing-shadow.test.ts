import { describe, expect, it } from "vitest";
import {
  buildOperationalTwinWindTimingShadow,
  OPERATIONAL_TWIN_WIND_TIMING_CHECKPOINTS_MINUTES,
} from "@/lib/operational-twin/wind-timing-shadow";
import type { OperationalTwinCorridor } from "@/lib/operational-twin/types";
import type { WeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";

function corridor(): OperationalTwinCorridor {
  return {
    horizonMinutes: 30,
    stepMinutes: 10,
    mode: "ROUTE_AWARE",
    routeAdherence: "ON_ROUTE",
    routePrecision: "PRECISE",
    maxUncertaintyNm: 4,
    points: [
      { offsetMinutes: 0, at: "2026-10-05T10:00:00.000Z", lat: 0, lon: 0, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
      { offsetMinutes: 10, at: "2026-10-05T10:10:00.000Z", lat: 0, lon: 1.11, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" },
      { offsetMinutes: 20, at: "2026-10-05T10:20:00.000Z", lat: 0, lon: 2.22, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 3, mode: "ROUTE_AWARE" },
      { offsetMinutes: 30, at: "2026-10-05T10:30:00.000Z", lat: 0, lon: 3.33, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 4, mode: "ROUTE_AWARE" },
    ],
    waypoints: [
      { id: "WP1", name: "WP1", lat: 0, lon: 1.665, offsetMinutes: 15, at: "2026-10-05T10:15:00.000Z", distanceNm: 100, sourceKind: "FIX" },
    ],
  };
}

function weather(headwinds: readonly number[], status: "AVAILABLE" | "STALE" | "UNAVAILABLE" = "AVAILABLE"): WeatherCorridorIntelligence {
  const offsets = [0, 10, 20, 30];
  const distances = [0, 66.6, 133.2, 199.8];
  return {
    version: "weather-corridor-intelligence-v1",
    status: status === "UNAVAILABLE" ? "PARTIAL" : "AVAILABLE",
    horizonMinutes: 30,
    corridorMode: "ROUTE_AWARE",
    routePrecision: "PRECISE",
    events: [],
    wind: {
      status,
      model: status === "UNAVAILABLE" ? null : "ICON-EU",
      trend: "STABLE",
      deltaAlongTrackKt: null,
      samples: status === "UNAVAILABLE" ? [] : offsets.map((offsetMinutes, index) => ({
        offsetMinutes,
        at: new Date(Date.parse("2026-10-05T10:00:00.000Z") + offsetMinutes * 60_000).toISOString(),
        distanceAlongCorridorNm: distances[index]!,
        altitudeFt: 30000,
        levelHpa: 300,
        windSpeedKt: Math.abs(headwinds[index] ?? 0),
        windFromDeg: 90,
        headwindKt: headwinds[index] ?? 0,
        tailwindKt: 0,
        crosswindKt: 0,
        sourceDistanceKm: 10,
      })),
    },
    sources: [],
  };
}

describe("Operational Digital Twin Wind-adjusted Timing Shadow V1", () => {
  it("delays future timing when headwind increases along the corridor", () => {
    const result = buildOperationalTwinWindTimingShadow({
      corridor: corridor(),
      weatherCorridor: weather([0, 20, 40, 60]),
      observedGroundSpeedKt: 400,
    });

    expect(result.status).toBe("AVAILABLE");
    expect(result.mode).toBe("SHADOW");
    expect(result.inferredStillAirSpeedKt).toBe(400);
    expect(result.checkpoints.map((item) => item.horizonMinutes)).toEqual(
      OPERATIONAL_TWIN_WIND_TIMING_CHECKPOINTS_MINUTES,
    );
    expect(result.checkpoints.find((item) => item.horizonMinutes === 30)?.deltaSeconds).toBeGreaterThan(0);
    expect(result.waypoints[0]?.deltaSeconds).toBeGreaterThan(0);
  });

  it("advances future timing when tailwind strengthens", () => {
    const input = weather([0, -20, -40, -60]);
    input.wind.samples = input.wind.samples.map((sample) => ({
      ...sample,
      headwindKt: 0,
      tailwindKt: Math.abs(sample.headwindKt),
    }));
    const result = buildOperationalTwinWindTimingShadow({
      corridor: corridor(),
      weatherCorridor: input,
      observedGroundSpeedKt: 400,
    });

    expect(result.status).toBe("AVAILABLE");
    expect(result.checkpoints.find((item) => item.horizonMinutes === 30)?.deltaSeconds).toBeLessThan(0);
  });

  it("preserves a stale shadow result but marks its source status", () => {
    const result = buildOperationalTwinWindTimingShadow({
      corridor: corridor(),
      weatherCorridor: weather([10, 10, 10, 10], "STALE"),
      observedGroundSpeedKt: 400,
    });
    expect(result.status).toBe("STALE");
    expect(result.windStatus).toBe("STALE");
    expect(result.checkpoints).toHaveLength(3);
  });

  it("fails closed when wind evidence is unavailable", () => {
    const result = buildOperationalTwinWindTimingShadow({
      corridor: corridor(),
      weatherCorridor: weather([], "UNAVAILABLE"),
      observedGroundSpeedKt: 400,
    });
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.reasons).toContain("wind_unavailable");
    expect(result.checkpoints).toEqual([]);
    expect(result.waypoints).toEqual([]);
  });

  it("does not reinterpret observed ground speed when the current wind sample is missing", () => {
    const input = weather([20, 20, 20, 20]);
    input.wind.samples = input.wind.samples.slice(1);
    const result = buildOperationalTwinWindTimingShadow({
      corridor: corridor(),
      weatherCorridor: input,
      observedGroundSpeedKt: 400,
    });
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.reasons).toContain("current_wind_missing");
  });
});
