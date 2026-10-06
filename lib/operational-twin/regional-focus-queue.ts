import type { OperationalAttentionSummary, OperationalAttentionType } from "./operational-attention";
import type { RegionalSituationGraph } from "./regional-situation";

export const REGIONAL_FOCUS_QUEUE_VERSION = "regional-focus-queue-v1";
export const REGIONAL_FOCUS_QUEUE_MAX_ITEMS = 20;

export interface RegionalFocusQueueItem {
  icaoHex: string;
  label: string;
  level: "WATCH" | "ATTENTION";
  attentionCount: number;
  watchCount: number;
  totalSignals: number;
  earliestProjectedOffsetMinutes: number | null;
  types: OperationalAttentionType[];
  attentionItemIds: string[];
}

export interface RegionalFocusQueue {
  version: typeof REGIONAL_FOCUS_QUEUE_VERSION;
  generatedAt: string;
  total: number;
  watch: number;
  attention: number;
  truncated: boolean;
  items: RegionalFocusQueueItem[];
  limitations: Array<
    "OPERATIONAL_CONTEXT_ONLY"
    | "REGIONAL_ATTENTION_INPUT_ONLY"
    | "NOT_SEPARATION_PRODUCT"
    | "NO_PER_AIRCRAFT_DIGITAL_TWIN_FANOUT"
  >;
}

export function buildRegionalFocusQueue(
  graph: RegionalSituationGraph,
  attention: OperationalAttentionSummary,
): RegionalFocusQueue {
  const labels = new Map(graph.nodes.map((node) => [node.icaoHex, node.label] as const));
  const aggregate = new Map<string, RegionalFocusQueueItem>();

  for (const signal of attention.items) {
    for (const hex of signal.aircraft) {
      const current = aggregate.get(hex) ?? {
        icaoHex: hex,
        label: labels.get(hex) ?? hex,
        level: "WATCH" as const,
        attentionCount: 0,
        watchCount: 0,
        totalSignals: 0,
        earliestProjectedOffsetMinutes: null,
        types: [],
        attentionItemIds: [],
      };

      if (signal.level === "ATTENTION") {
        current.level = "ATTENTION";
        current.attentionCount += 1;
      } else {
        current.watchCount += 1;
      }
      current.totalSignals += 1;
      if (!current.types.includes(signal.type)) current.types.push(signal.type);
      current.attentionItemIds.push(signal.id);

      if (signal.projectedOffsetMinutes !== null) {
        current.earliestProjectedOffsetMinutes = current.earliestProjectedOffsetMinutes === null
          ? signal.projectedOffsetMinutes
          : Math.min(current.earliestProjectedOffsetMinutes, signal.projectedOffsetMinutes);
      }

      aggregate.set(hex, current);
    }
  }

  const candidates = [...aggregate.values()].sort((left, right) =>
    (left.level === right.level ? 0 : left.level === "ATTENTION" ? -1 : 1)
    || (left.earliestProjectedOffsetMinutes ?? Number.POSITIVE_INFINITY) - (right.earliestProjectedOffsetMinutes ?? Number.POSITIVE_INFINITY)
    || right.totalSignals - left.totalSignals
    || left.icaoHex.localeCompare(right.icaoHex)
  );
  const items = candidates.slice(0, REGIONAL_FOCUS_QUEUE_MAX_ITEMS);

  return {
    version: REGIONAL_FOCUS_QUEUE_VERSION,
    generatedAt: graph.generatedAt,
    total: items.length,
    watch: items.filter((item) => item.level === "WATCH").length,
    attention: items.filter((item) => item.level === "ATTENTION").length,
    truncated: candidates.length > items.length,
    items,
    limitations: [
      "OPERATIONAL_CONTEXT_ONLY",
      "REGIONAL_ATTENTION_INPUT_ONLY",
      "NOT_SEPARATION_PRODUCT",
      "NO_PER_AIRCRAFT_DIGITAL_TWIN_FANOUT",
    ],
  };
}
