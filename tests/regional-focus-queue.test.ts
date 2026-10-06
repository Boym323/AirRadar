import { describe, expect, it } from "vitest";
import { buildRegionalFocusQueue } from "@/lib/operational-twin/regional-focus-queue";
import type { OperationalAttentionSummary } from "@/lib/operational-twin/operational-attention";

function attention(): OperationalAttentionSummary {
  return {
    version: "operational-attention-v1",
    generatedAt: "2026-10-06T09:00:00.000Z",
    total: 3,
    watch: 2,
    attention: 1,
    truncated: false,
    items: [
      {
        id: "watch-late",
        type: "REGIONAL_COPRESENCE",
        level: "WATCH",
        aircraft: ["A", "B"],
        destination: null,
        projectedOffsetMinutes: 25,
        projectedDistanceNm: 8,
        evidence: ["late"],
      },
      {
        id: "attention-now",
        type: "REGIONAL_COPRESENCE",
        level: "ATTENTION",
        aircraft: ["C", "D"],
        destination: "LKPR",
        projectedOffsetMinutes: 6,
        projectedDistanceNm: 4,
        evidence: ["priority"],
      },
      {
        id: "cluster",
        type: "DESTINATION_CLUSTER",
        level: "WATCH",
        aircraft: ["E", "F", "G", "H"],
        destination: "LOWW",
        projectedOffsetMinutes: null,
        projectedDistanceNm: null,
        evidence: ["cluster"],
      },
    ],
    limitations: ["OPERATIONAL_CONTEXT_ONLY", "NOT_COLLISION_WARNING", "NOT_SEPARATION_PRODUCT", "BOUNDED_GRAPH_INPUT"],
  };
}

describe("Regional Focus Queue V1", () => {
  it("prioritizes attention then tighter prospective context and assigns ranks", () => {
    const queue = buildRegionalFocusQueue(attention());
    expect(queue.items.map((item) => [item.rank, item.id])).toEqual([
      [1, "attention-now"],
      [2, "watch-late"],
      [3, "cluster"],
    ]);
    expect(queue.attention).toBe(1);
    expect(queue.watch).toBe(2);
  });

  it("preserves operational-context-only limitations and does not imply separation semantics", () => {
    const queue = buildRegionalFocusQueue(attention());
    expect(queue.limitations).toContain("NOT_COLLISION_WARNING");
    expect(queue.limitations).toContain("NOT_SEPARATION_PRODUCT");
    expect(queue.limitations).toContain("NO_AIRCRAFT_FOCUS_PROVIDER_FANOUT");
  });
});
