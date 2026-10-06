import type {
  AircraftOperationalFocusItem,
  AircraftOperationalFocusSummary,
} from "./types";

export const AIRCRAFT_OPERATIONAL_FOCUS_CHANGE_VERSION = "aircraft-operational-focus-change-v1" as const;

export type AircraftOperationalFocusChangeKind =
  | "NEW"
  | "ESCALATED"
  | "DEESCALATED"
  | "UPDATED"
  | "RESOLVED";

export interface AircraftOperationalFocusChange {
  itemId: string;
  kind: AircraftOperationalFocusChangeKind;
  type: AircraftOperationalFocusItem["type"];
  previousLevel: AircraftOperationalFocusItem["level"] | null;
  level: AircraftOperationalFocusItem["level"] | null;
  label: string;
  confidence: AircraftOperationalFocusItem["confidence"];
  previousOffsetMinutes: number | null;
  offsetMinutes: number | null;
}

export interface AircraftOperationalFocusChangeSummary {
  version: typeof AIRCRAFT_OPERATIONAL_FOCUS_CHANGE_VERSION;
  previousGeneratedAt: string;
  generatedAt: string;
  total: number;
  changes: AircraftOperationalFocusChange[];
}

function changedMeaningfully(
  previous: AircraftOperationalFocusItem,
  current: AircraftOperationalFocusItem,
): boolean {
  return previous.confidence !== current.confidence
    || previous.label !== current.label
    || previous.source !== current.source
    || previous.sourceReference !== current.sourceReference
    || Math.abs(previous.offsetMinutes - current.offsetMinutes) >= 1;
}

export function diffAircraftOperationalFocus(
  previous: AircraftOperationalFocusSummary | null,
  current: AircraftOperationalFocusSummary | null,
): AircraftOperationalFocusChangeSummary | null {
  if (!previous || !current || previous.generatedAt === current.generatedAt) return null;

  const previousById = new Map(previous.items.map((item) => [item.id, item] as const));
  const currentById = new Map(current.items.map((item) => [item.id, item] as const));
  const changes: AircraftOperationalFocusChange[] = [];

  for (const item of current.items) {
    const before = previousById.get(item.id);
    if (!before) {
      changes.push({
        itemId: item.id,
        kind: "NEW",
        type: item.type,
        previousLevel: null,
        level: item.level,
        label: item.label,
        confidence: item.confidence,
        previousOffsetMinutes: null,
        offsetMinutes: item.offsetMinutes,
      });
      continue;
    }
    const kind: AircraftOperationalFocusChangeKind | null =
      before.level === "WATCH" && item.level === "ATTENTION"
        ? "ESCALATED"
        : before.level === "ATTENTION" && item.level === "WATCH"
          ? "DEESCALATED"
          : changedMeaningfully(before, item)
            ? "UPDATED"
            : null;
    if (kind) {
      changes.push({
        itemId: item.id,
        kind,
        type: item.type,
        previousLevel: before.level,
        level: item.level,
        label: item.label,
        confidence: item.confidence,
        previousOffsetMinutes: before.offsetMinutes,
        offsetMinutes: item.offsetMinutes,
      });
    }
  }

  for (const item of previous.items) {
    if (currentById.has(item.id)) continue;
    changes.push({
      itemId: item.id,
      kind: "RESOLVED",
      type: item.type,
      previousLevel: item.level,
      level: null,
      label: item.label,
      confidence: item.confidence,
      previousOffsetMinutes: item.offsetMinutes,
      offsetMinutes: null,
    });
  }

  const rank: Record<AircraftOperationalFocusChangeKind, number> = {
    ESCALATED: 0,
    NEW: 1,
    UPDATED: 2,
    DEESCALATED: 3,
    RESOLVED: 4,
  };
  changes.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.offsetMinutes ?? Number.POSITIVE_INFINITY) - (b.offsetMinutes ?? Number.POSITIVE_INFINITY) || a.itemId.localeCompare(b.itemId));

  return {
    version: AIRCRAFT_OPERATIONAL_FOCUS_CHANGE_VERSION,
    previousGeneratedAt: previous.generatedAt,
    generatedAt: current.generatedAt,
    total: changes.length,
    changes,
  };
}
