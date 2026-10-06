import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_OPERATIONAL_FOCUS_MAX_ITEMS,
  buildAircraftOperationalFocus,
  type OperationalTwinEvent,
} from "@/lib/operational-twin";
import type { NavigationIntegrityCorridorIntelligence } from "@/lib/operational-twin/navigation-integrity-corridor";
import type { WeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";

const now = new Date("2026-10-06T06:00:00.000Z");

function weather(
  events: WeatherCorridorIntelligence["events"] = [],
): WeatherCorridorIntelligence {
  return {
    version: "weather-corridor-intelligence-v1",
    status: "AVAILABLE",
    horizonMinutes: 30,
    corridorMode: "ROUTE_AWARE",
    routePrecision: "PRECISE",
    events,
    wind: {
      status: "UNAVAILABLE",
      model: null,
      trend: "UNAVAILABLE",
      deltaAlongTrackKt: null,
      samples: [],
    },
    sources: [],
  };
}

function weatherEvent(
  overrides: Partial<WeatherCorridorIntelligence["events"][number]> = {},
): WeatherCorridorIntelligence["events"][number] {
  return {
    id: "WX1",
    type: "SIGMET_ENTRY",
    risk: "CONVECTION",
    offsetMinutes: 12,
    at: "2026-10-06T06:12:00.000Z",
    distanceAlongCorridorNm: 45,
    lat: 50,
    lon: 15,
    altitudeFt: 28_000,
    severity: "HIGH",
    confidence: "HIGH",
    source: "SIGMET",
    sourceReference: "SIG-1",
    evidence: ["test"],
    ...overrides,
  };
}

function navigationIntegrity(
  overrides: Partial<NavigationIntegrityCorridorIntelligence["events"][number]> = {},
): NavigationIntegrityCorridorIntelligence {
  return {
    version: "navigation-integrity-corridor-v1",
    status: "AVAILABLE",
    generatedAt: now.toISOString(),
    sourceGeneratedAt: now.toISOString(),
    sourceWindow: "15m",
    activeAnomalies: 1,
    intersections: 1,
    events: [{
      id: "NAV1",
      anomalyId: "A1",
      entryOffsetMinutes: 8,
      exitOffsetMinutes: 12,
      entryAt: "2026-10-06T06:08:00.000Z",
      exitAt: "2026-10-06T06:12:00.000Z",
      lat: 50,
      lon: 15,
      altitudeFt: 28_000,
      altitudeBand: 5,
      cellKey: "test",
      sampledPoints: 3,
      severity: "DEGRADED",
      confidence: "MEDIUM",
      affectedAircraftCount: 4,
      localAircraftCount: 3,
      networkAircraftCount: 1,
      baselineMaturity: "READY",
      auditCategories: [],
      source: "AIRRADAR_NAVIGATION_INTEGRITY",
      provenance: "INFERRED",
      ...overrides,
    }],
    limitations: ["SAMPLED_CENTERLINE", "REGIONAL_HEURISTIC", "CAUSE_UNKNOWN"],
  };
}

function twinEvent(
  type: OperationalTwinEvent["type"],
  offsetMinutes: number,
  title = type,
): OperationalTwinEvent {
  return {
    id: `${type}:${offsetMinutes}:${title}`,
    type,
    offsetMinutes,
    at: new Date(now.getTime() + offsetMinutes * 60_000).toISOString(),
    title,
    detail: null,
    provenance: type === "PLANNED_AIRSPACE" ? "PLANNED" : "PREDICTED",
    confidence: "HIGH",
    source: "test",
    sourceReference: null,
    lat: 50,
    lon: 15,
    altitudeFt: 28_000,
  };
}

describe("Aircraft Operational Focus V1", () => {
  it("promotes high-confidence high-severity weather into ATTENTION", () => {
    const result = buildAircraftOperationalFocus({
      generatedAt: now,
      events: [],
      weatherCorridor: weather([weatherEvent()]),
      navigationIntegrityCorridor: undefined,
    });

    expect(result).toMatchObject({
      version: "aircraft-operational-focus-v1",
      level: "ATTENTION",
      total: 1,
      attention: 1,
      watch: 0,
    });
    expect(result.items[0]).toMatchObject({
      type: "WEATHER",
      level: "ATTENTION",
      label: "CONVECTION",
      offsetMinutes: 12,
    });
  });

  it("treats degraded regional navigation-integrity evidence as attention only with usable confidence", () => {
    const attention = buildAircraftOperationalFocus({
      generatedAt: now,
      events: [],
      weatherCorridor: weather(),
      navigationIntegrityCorridor: navigationIntegrity(),
    });
    expect(attention.items[0]).toMatchObject({
      type: "NAVIGATION_INTEGRITY",
      level: "ATTENTION",
      label: "DEGRADED",
    });

    const watch = buildAircraftOperationalFocus({
      generatedAt: now,
      events: [],
      weatherCorridor: weather(),
      navigationIntegrityCorridor: navigationIntegrity({ confidence: "LOW" }),
    });
    expect(watch.level).toBe("WATCH");
    expect(watch.items[0]?.level).toBe("WATCH");
  });

  it("keeps planned airspace and non-normal trajectory state at WATCH", () => {
    const result = buildAircraftOperationalFocus({
      generatedAt: now,
      events: [
        twinEvent("PLANNED_AIRSPACE", 5, "LKTRA1"),
        twinEvent("TRAJECTORY_STATE", 0, "DEVIATING"),
      ],
      weatherCorridor: weather(),
      navigationIntegrityCorridor: undefined,
    });

    expect(result.level).toBe("WATCH");
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.level === "WATCH")).toBe(true);
    expect(result.items.find((item) => item.type === "PLANNED_AIRSPACE")?.reasonCodes)
      .toContain("PLAN_ONLY_NOT_ACTIVATION");
  });

  it("does not turn routine events, SIGMET exits, or low weather into focus items", () => {
    const result = buildAircraftOperationalFocus({
      generatedAt: now,
      events: [
        twinEvent("WAYPOINT", 5),
        twinEvent("ATC_SECTOR_ENTRY", 10),
        twinEvent("ARRIVAL_ETA", 25),
        twinEvent("RUNWAY_EXPECTATION", 25),
      ],
      weatherCorridor: weather([
        weatherEvent({ id: "exit", type: "SIGMET_EXIT" }),
        weatherEvent({ id: "low", type: "TURBULENCE", severity: "LOW" }),
      ]),
      navigationIntegrityCorridor: undefined,
    });

    expect(result).toMatchObject({ level: "NORMAL", total: 0, watch: 0, attention: 0 });
    expect(result.limitations).toContain("NO_ALL_CLEAR_INFERENCE");
  });

  it("orders attention before watch, then by lead time", () => {
    const result = buildAircraftOperationalFocus({
      generatedAt: now,
      events: [twinEvent("PLANNED_AIRSPACE", 1, "LKTRA1")],
      weatherCorridor: weather([
        weatherEvent({ id: "later", offsetMinutes: 20, at: "2026-10-06T06:20:00.000Z" }),
        weatherEvent({ id: "earlier", offsetMinutes: 10, at: "2026-10-06T06:10:00.000Z" }),
      ]),
      navigationIntegrityCorridor: undefined,
    });

    expect(result.items.map((item) => [item.level, item.offsetMinutes])).toEqual([
      ["ATTENTION", 10],
      ["ATTENTION", 20],
      ["WATCH", 1],
    ]);
  });

  it("keeps the result bounded and reports truncation", () => {
    const events = Array.from(
      { length: AIRCRAFT_OPERATIONAL_FOCUS_MAX_ITEMS + 3 },
      (_, index) => twinEvent("PLANNED_AIRSPACE", index, `AREA-${index}`),
    );
    const result = buildAircraftOperationalFocus({
      generatedAt: now,
      events,
      weatherCorridor: weather(),
      navigationIntegrityCorridor: undefined,
    });

    expect(result.items).toHaveLength(AIRCRAFT_OPERATIONAL_FOCUS_MAX_ITEMS);
    expect(result.total).toBe(AIRCRAFT_OPERATIONAL_FOCUS_MAX_ITEMS);
    expect(result.truncated).toBe(true);
  });
});
