import { describe, expect, it } from "vitest";
import { buildOperationalAttention } from "@/lib/operational-twin/operational-attention";
import { buildRegionalFocusQueue, REGIONAL_FOCUS_QUEUE_VERSION } from "@/lib/operational-twin/regional-focus-queue";
import type { RegionalSituationGraph, RegionalSituationNode } from "@/lib/operational-twin/regional-situation";

function node(icaoHex: string, label: string, destination: string | null): RegionalSituationNode {
  return {
    icaoHex,
    label,
    callsign: label,
    registration: null,
    observedAt: "2026-10-06T10:00:00.000Z",
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
    generatedAt: "2026-10-06T10:00:00.000Z",
    horizonMinutes: 30,
    nodeLimit: 80,
    edgeLimit: 160,
    truncatedNodes: false,
    truncatedEdges: false,
    nodes: [
      node("AAA111", "AAA1", "LOWW"),
      node("BBB222", "BBB2", "LOWW"),
      node("CCC333", "CCC3", "LOWW"),
    ],
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

describe("Regional Focus Queue V1", () => {
  it("aggregates attention by aircraft and prioritizes ATTENTION with earliest lead time", () => {
    const input = graph();
    const attention = buildOperationalAttention(input);
    const queue = buildRegionalFocusQueue(input, attention);

    expect(queue.version).toBe(REGIONAL_FOCUS_QUEUE_VERSION);
    expect(queue.items[0]).toMatchObject({
      icaoHex: "AAA111",
      label: "AAA1",
      level: "ATTENTION",
      attentionCount: 1,
      earliestProjectedOffsetMinutes: 15,
    });
    expect(queue.items[0]?.types).toEqual(["REGIONAL_COPRESENCE", "DESTINATION_CLUSTER"]);
    expect(queue.items[1]?.icaoHex).toBe("BBB222");
    expect(queue.items[2]).toMatchObject({
      icaoHex: "CCC333",
      level: "WATCH",
      types: ["DESTINATION_CLUSTER"],
    });
  });

  it("preserves explicit non-safety and no-fanout limitations", () => {
    const input = graph();
    const queue = buildRegionalFocusQueue(input, buildOperationalAttention(input));
    expect(queue.limitations).toContain("NOT_SEPARATION_PRODUCT");
    expect(queue.limitations).toContain("NO_PER_AIRCRAFT_DIGITAL_TWIN_FANOUT");
  });
});
