import type { RegionalSituationGraph, RegionalSituationNode } from "./regional-situation";

export const OPERATIONAL_ATTENTION_VERSION = "operational-attention-v1";
export const OPERATIONAL_ATTENTION_MAX_ITEMS = 12;

export type OperationalAttentionType = "REGIONAL_COPRESENCE" | "DESTINATION_CLUSTER";
export type OperationalAttentionLevel = "WATCH" | "ATTENTION";

export interface OperationalAttentionItem {
  id: string;
  type: OperationalAttentionType;
  level: OperationalAttentionLevel;
  aircraft: string[];
  destination: string | null;
  projectedOffsetMinutes: number | null;
  projectedDistanceNm: number | null;
  evidence: string[];
}

export interface OperationalAttentionSummary {
  version: typeof OPERATIONAL_ATTENTION_VERSION;
  generatedAt: string;
  total: number;
  watch: number;
  attention: number;
  truncated: boolean;
  items: OperationalAttentionItem[];
  limitations: Array<
    "OPERATIONAL_CONTEXT_ONLY"
    | "NOT_COLLISION_WARNING"
    | "NOT_SEPARATION_PRODUCT"
    | "BOUNDED_GRAPH_INPUT"
  >;
}

function destinationClusters(nodes: readonly RegionalSituationNode[]): OperationalAttentionItem[] {
  const grouped = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.destination) continue;
    const group = grouped.get(node.destination) ?? [];
    group.push(node.icaoHex);
    grouped.set(node.destination, group);
  }

  return [...grouped.entries()]
    .filter(([, aircraft]) => aircraft.length >= 3)
    .map(([destination, aircraft]) => ({
      id: `destination:${destination}`,
      type: "DESTINATION_CLUSTER" as const,
      level: aircraft.length >= 5 ? "ATTENTION" as const : "WATCH" as const,
      aircraft: aircraft.sort(),
      destination,
      projectedOffsetMinutes: null,
      projectedDistanceNm: null,
      evidence: [`${aircraft.length} live aircraft share resolved destination ${destination}`],
    }));
}

function projectedCopresence(graph: RegionalSituationGraph): OperationalAttentionItem[] {
  return graph.edges
    .filter((edge) =>
      edge.significance === "ELEVATED"
      && edge.reasons.includes("PROJECTED_COPRESENCE")
    )
    .map((edge) => ({
      id: `copresence:${edge.id}`,
      type: "REGIONAL_COPRESENCE" as const,
      level: edge.sharedDestination ? "ATTENTION" as const : "WATCH" as const,
      aircraft: [edge.source, edge.target],
      destination: edge.sharedDestination,
      projectedOffsetMinutes: edge.closestProjectedOffsetMinutes,
      projectedDistanceNm: edge.closestProjectedDistanceNm,
      evidence: [
        "bounded kinematic projections enter the same broad contextual volume",
        ...(edge.sharedDestination ? [`shared resolved destination ${edge.sharedDestination}`] : []),
      ],
    }));
}

export function buildOperationalAttention(graph: RegionalSituationGraph): OperationalAttentionSummary {
  const candidates = [
    ...projectedCopresence(graph),
    ...destinationClusters(graph.nodes),
  ].sort((a, b) =>
    (a.level === b.level ? 0 : a.level === "ATTENTION" ? -1 : 1)
    || (a.projectedDistanceNm ?? Number.POSITIVE_INFINITY) - (b.projectedDistanceNm ?? Number.POSITIVE_INFINITY)
    || a.id.localeCompare(b.id)
  );

  const items = candidates.slice(0, OPERATIONAL_ATTENTION_MAX_ITEMS);
  return {
    version: OPERATIONAL_ATTENTION_VERSION,
    generatedAt: graph.generatedAt,
    total: items.length,
    watch: items.filter((item) => item.level === "WATCH").length,
    attention: items.filter((item) => item.level === "ATTENTION").length,
    truncated: candidates.length > items.length,
    items,
    limitations: [
      "OPERATIONAL_CONTEXT_ONLY",
      "NOT_COLLISION_WARNING",
      "NOT_SEPARATION_PRODUCT",
      "BOUNDED_GRAPH_INPUT",
    ],
  };
}
