import { describe, expect, it } from "vitest";
import { buildOperationalAttention, OPERATIONAL_ATTENTION_VERSION } from "@/lib/operational-twin/operational-attention";
import type { RegionalSituationGraph, RegionalSituationNode } from "@/lib/operational-twin/regional-situation";

function node(icaoHex: string, destination: string | null): RegionalSituationNode {
  return {
    icaoHex,
    label: icaoHex,
    callsign: null,
    registration: null,
    observedAt: "2026-10-05T15:00:00.000Z",
    destination,
    lat: 49,
    lon: 16,
    altitudeFt: 30_000,
    groundSpeedKt: 400,
    trackDeg: 90,
  };
}

function graph(): RegionalSituationGraph {
  return {
    version: "regional-situation-v1",
    generatedAt: "2026-10-05T15:00:00.000Z",
    horizonMinutes: 30,
    nodeLimit: 80,
    edgeLimit: 160,
    truncatedNodes: false,
    truncatedEdges: false,
    nodes: [node("AAA111", "LOWW"), node("BBB222", "LOWW"), node("CCC333", "LOWW")],
    edges: [{
      id: "AAA111:BBB222",
      source: "AAA111",
      target: "BBB222",
      reasons: ["PROJECTED_COPRESENCE", "SHARED_DESTINATION"],
      significance: "ELEVATED",
      sharedDestination: "LOWW",
      closestProjectedDistanceNm: 7,
      closestProjectedVerticalFt: 1_000,
      closestProjectedOffsetMinutes: 15,
    }],
    limitations: [
      "BOUNDED_LIVE_SNAPSHOT",
      "KINEMATIC_PROJECTION_ONLY",
      "NOT_SEPARATION_PRODUCT",
      "NO_ATC_CLEARANCE_INFERENCE",
    ],
  };
}

describe("Operational Attention V1", () => {
  it("summarizes elevated projected co-presence without safety semantics", () => {
    const result = buildOperationalAttention(graph());
    expect(result.version).toBe(OPERATIONAL_ATTENTION_VERSION);
    expect(result.items[0]).toMatchObject({
      type: "REGIONAL_COPRESENCE",
      level: "ATTENTION",
      aircraft: ["AAA111", "BBB222"],
      destination: "LOWW",
      projectedOffsetMinutes: 15,
    });
    expect(result.limitations).toContain("NOT_COLLISION_WARNING");
    expect(result.limitations).toContain("NOT_SEPARATION_PRODUCT");
  });

  it("creates a destination cluster only from three or more live nodes", () => {
    const result = buildOperationalAttention(graph());
    expect(result.items.some((item) =>
      item.type === "DESTINATION_CLUSTER"
      && item.destination === "LOWW"
      && item.aircraft.length === 3
    )).toBe(true);
  });

  it("does not create attention from ordinary contextual edges", () => {
    const input = graph();
    input.nodes = [node("AAA111", null), node("BBB222", null)];
    input.edges = [{
      ...input.edges[0]!,
      reasons: ["PROJECTED_COPRESENCE"],
      significance: "CONTEXT",
      sharedDestination: null,
    }];
    expect(buildOperationalAttention(input).items).toEqual([]);
  });
});
