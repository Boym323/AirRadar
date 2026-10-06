import type { OperationalAttentionItem, OperationalAttentionSummary } from "./operational-attention";

export const REGIONAL_FOCUS_QUEUE_VERSION = "regional-focus-queue-v1" as const;
export const REGIONAL_FOCUS_QUEUE_MAX_ITEMS = 12;

export interface RegionalFocusQueueItem {
  rank: number;
  id: string;
  type: OperationalAttentionItem["type"];
  level: OperationalAttentionItem["level"];
  aircraft: string[];
  destination: string | null;
  projectedOffsetMinutes: number | null;
  projectedDistanceNm: number | null;
  evidence: string[];
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
    | "NOT_COLLISION_WARNING"
    | "NOT_SEPARATION_PRODUCT"
    | "NO_AIRCRAFT_FOCUS_PROVIDER_FANOUT"
  >;
}

function queueScore(item: OperationalAttentionItem): number {
  const level = item.level === "ATTENTION" ? 10_000 : 5_000;
  const lead = item.projectedOffsetMinutes === null ? 0 : Math.max(0, 30 - item.projectedOffsetMinutes) * 50;
  const distance = item.projectedDistanceNm === null ? 0 : Math.max(0, 20 - item.projectedDistanceNm) * 20;
  const cluster = Math.min(item.aircraft.length, 10) * 10;
  return level + lead + distance + cluster;
}

export function buildRegionalFocusQueue(attention: OperationalAttentionSummary): RegionalFocusQueue {
  const candidates = attention.items
    .map((item) => ({ item, score: queueScore(item) }))
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  const bounded = candidates.slice(0, REGIONAL_FOCUS_QUEUE_MAX_ITEMS);
  const items = bounded.map(({ item }, index) => ({
    rank: index + 1,
    id: item.id,
    type: item.type,
    level: item.level,
    aircraft: [...item.aircraft],
    destination: item.destination,
    projectedOffsetMinutes: item.projectedOffsetMinutes,
    projectedDistanceNm: item.projectedDistanceNm,
    evidence: [...item.evidence],
  }));

  return {
    version: REGIONAL_FOCUS_QUEUE_VERSION,
    generatedAt: attention.generatedAt,
    total: items.length,
    watch: items.filter((item) => item.level === "WATCH").length,
    attention: items.filter((item) => item.level === "ATTENTION").length,
    truncated: attention.truncated || candidates.length > items.length,
    items,
    limitations: [
      "OPERATIONAL_CONTEXT_ONLY",
      "NOT_COLLISION_WARNING",
      "NOT_SEPARATION_PRODUCT",
      "NO_AIRCRAFT_FOCUS_PROVIDER_FANOUT",
    ],
  };
}
