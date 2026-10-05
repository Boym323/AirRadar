import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  buildRegionalSituationGraph,
  REGIONAL_SITUATION_MAX_AIRCRAFT,
  REGIONAL_SITUATION_VERSION,
} from "@/lib/operational-twin/regional-situation";

function aircraft(overrides: Partial<Aircraft> & Pick<Aircraft, "icaoHex" | "lat" | "lon" | "track" | "groundSpeed">): Aircraft {
  return {
    icaoHex: overrides.icaoHex,
    callsign: overrides.callsign ?? null,
    registration: overrides.registration ?? null,
    aircraftType: null,
    aircraftDescription: null,
    lat: overrides.lat,
    lon: overrides.lon,
    altitude: overrides.altitude ?? 30_000,
    baroAltitude: overrides.baroAltitude ?? overrides.altitude ?? 30_000,
    geomAltitude: null,
    groundSpeed: overrides.groundSpeed,
    track: overrides.track,
    verticalRate: overrides.verticalRate ?? 0,
    baroRate: null,
    geomRate: null,
    squawk: null,
    category: null,
    emergency: null,
    rssi: null,
    messages: null,
    seenSeconds: 1,
    seenPosSeconds: 1,
    lastSeen: overrides.lastSeen ?? "2026-10-05T15:00:00.000Z",
    source: overrides.source ?? "readsb",
    sourceType: null,
    onGround: overrides.onGround ?? false,
    distanceKm: overrides.distanceKm ?? 10,
    bearing: null,
    trail: [],
    enrichment: overrides.enrichment,
  };
}

describe("Regional Situation Graph V1", () => {
  it("links aircraft whose bounded kinematic projections converge", () => {
    const graph = buildRegionalSituationGraph([
      aircraft({ icaoHex: "AAA111", lat: 49.0, lon: 16.0, track: 90, groundSpeed: 420, altitude: 30_000 }),
      aircraft({ icaoHex: "BBB222", lat: 49.0, lon: 17.0, track: 270, groundSpeed: 420, altitude: 31_000 }),
    ], new Date("2026-10-05T15:00:00.000Z"));

    expect(graph.version).toBe(REGIONAL_SITUATION_VERSION);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.reasons).toContain("PROJECTED_COPRESENCE");
    expect(graph.edges[0]?.significance).toBe("ELEVATED");
    expect(graph.limitations).toContain("NOT_SEPARATION_PRODUCT");
  });

  it("captures a shared destination without claiming projected proximity", () => {
    const destination = { destination: "LOWW" } as Aircraft["enrichment"]["route"];
    const graph = buildRegionalSituationGraph([
      aircraft({ icaoHex: "AAA111", lat: 49.0, lon: 14.0, track: 90, groundSpeed: 300, enrichment: { route: destination } }),
      aircraft({ icaoHex: "BBB222", lat: 48.0, lon: 18.0, track: 90, groundSpeed: 300, enrichment: { route: destination } }),
    ], new Date("2026-10-05T15:00:00.000Z"));

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      sharedDestination: "LOWW",
      reasons: ["SHARED_DESTINATION"],
      significance: "CONTEXT",
    });
  });

  it("excludes stale, ground and slow targets", () => {
    const graph = buildRegionalSituationGraph([
      aircraft({ icaoHex: "STALE1", lat: 49, lon: 16, track: 90, groundSpeed: 300, lastSeen: "2026-10-05T14:55:00.000Z" }),
      aircraft({ icaoHex: "GROUND", lat: 49, lon: 16, track: 90, groundSpeed: 100, onGround: true }),
      aircraft({ icaoHex: "SLOW01", lat: 49, lon: 16, track: 90, groundSpeed: 40 }),
    ], new Date("2026-10-05T15:00:00.000Z"));

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("bounds the graph to the nearest configured aircraft count", () => {
    const input = Array.from({ length: REGIONAL_SITUATION_MAX_AIRCRAFT + 5 }, (_, index) =>
      aircraft({
        icaoHex: index.toString(16).toUpperCase().padStart(6, "0"),
        lat: 49,
        lon: 16 + index * 0.02,
        track: 90,
        groundSpeed: 300,
        distanceKm: index,
      })
    );
    const graph = buildRegionalSituationGraph(input, new Date("2026-10-05T15:00:00.000Z"));
    expect(graph.nodes).toHaveLength(REGIONAL_SITUATION_MAX_AIRCRAFT);
    expect(graph.truncatedNodes).toBe(true);
  });
});
