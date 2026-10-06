import type {
  AircraftOperationalFocusItem,
  AircraftOperationalFocusSummary,
} from "./types";

export type AircraftOperationalFocusChangeKind =
  | "NEW"
  | "ESCALATED"
  | "DEESCALATED"
  | "UPDATED"
  | "RESOLVED";

export interface AircraftOperationalFocusChange {
  kind: AircraftOperationalFocusChangeKind;
  itemId: string;
  currentItem: AircraftOperationalFocusItem | null;
  previousItem: AircraftOperationalFocusItem | null;
  timingShiftSeconds: number | null;
}

export interface AircraftOperationalFocusChangeSummary {
  version: "aircraft-operational-focus-change-v1";
  comparedFrom: string;
  generatedAt: string;
  changes: AircraftOperationalFocusChange[];
  counts: Record<AircraftOperationalFocusChangeKind, number>;
}

const CHANGE_ORDER: AircraftOperationalFocusChangeKind[] = [
  "ESCALATED",
  "NEW",
  "UPDATED",
  "DEESCALATED",
  "RESOLVED",
];

function parsedMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timingShiftSeconds(
  previous: AircraftOperationalFocusItem,
  current: AircraftOperationalFocusItem,
): number | null {
  const previousMs = parsedMs(previous.at);
  const currentMs = parsedMs(current.at);
  if (previousMs === null || currentMs === null) return null;
  return Math.round((currentMs - previousMs) / 1000);
}

function itemUpdated(
  previous: AircraftOperationalFocusItem,
  current: AircraftOperationalFocusItem,
  shiftSeconds: number | null,
): boolean {
  return previous.confidence !== current.confidence
    || previous.label !== current.label
    || previous.source !== current.source
    || previous.sourceReference !== current.sourceReference
    || (shiftSeconds !== null && Math.abs(shiftSeconds) >= 60);
}

function emptyCounts(): Record<AircraftOperationalFocusChangeKind, number> {
  return {
    NEW: 0,
    ESCALATED: 0,
    DEESCALATED: 0,
    UPDATED: 0,
    RESOLVED: 0,
  };
}

export function compareAircraftOperationalFocus(
  previous: AircraftOperationalFocusSummary | null,
  current: AircraftOperationalFocusSummary | null,
): AircraftOperationalFocusChangeSummary | null {
  if (!previous || !current) return null;

  const previousById = new Map(previous.items.map((item) => [item.id, item] as const));
  const currentById = new Map(current.items.map((item) => [item.id, item] as const));
  const changes: AircraftOperationalFocusChange[] = [];

  for (const currentItem of current.items) {
    const previousItem = previousById.get(currentItem.id) ?? null;
    if (!previousItem) {
      changes.push({
        kind: "NEW",
        itemId: currentItem.id,
        currentItem,
        previousItem: null,
        timingShiftSeconds: null,
      });
      continue;
    }

    const shiftSeconds = timingShiftSeconds(previousItem, currentItem);
    if (previousItem.level === "WATCH" && currentItem.level === "ATTENTION") {
      changes.push({
        kind: "ESCALATED",
        itemId: currentItem.id,
        currentItem,
        previousItem,
        timingShiftSeconds: shiftSeconds,
      });
      continue;
    }

    if (previousItem.level === "ATTENTION" && currentItem.level === "WATCH") {
      changes.push({
        kind: "DEESCALATED",
        itemId: currentItem.id,
        currentItem,
        previousItem,
        timingShiftSeconds: shiftSeconds,
      });
      continue;
    }

    if (itemUpdated(previousItem, currentItem, shiftSeconds)) {
      changes.push({
        kind: "UPDATED",
        itemId: currentItem.id,
        currentItem,
        previousItem,
        timingShiftSeconds: shiftSeconds,
      });
    }
  }

  for (const previousItem of previous.items) {
    if (currentById.has(previousItem.id)) continue;
    changes.push({
      kind: "RESOLVED",
      itemId: previousItem.id,
      currentItem: null,
      previousItem,
      timingShiftSeconds: null,
    });
  }

  const orderIndex = new Map(CHANGE_ORDER.map((kind, index) => [kind, index] as const));
  changes.sort((left, right) => {
    const kindDelta = (orderIndex.get(left.kind) ?? 99) - (orderIndex.get(right.kind) ?? 99);
    if (kindDelta !== 0) return kindDelta;
    const leftOffset = left.currentItem?.offsetMinutes ?? left.previousItem?.offsetMinutes ?? Number.POSITIVE_INFINITY;
    const rightOffset = right.currentItem?.offsetMinutes ?? right.previousItem?.offsetMinutes ?? Number.POSITIVE_INFINITY;
    return leftOffset - rightOffset || left.itemId.localeCompare(right.itemId);
  });

  const counts = emptyCounts();
  for (const change of changes) counts[change.kind] += 1;

  return {
    version: "aircraft-operational-focus-change-v1",
    comparedFrom: previous.generatedAt,
    generatedAt: current.generatedAt,
    changes,
    counts,
  };
}

export function aircraftOperationalFocusChangeByItem(
  summary: AircraftOperationalFocusChangeSummary | null,
): Map<string, AircraftOperationalFocusChange> {
  return new Map(
    (summary?.changes ?? [])
      .filter((change) => change.currentItem !== null)
      .map((change) => [change.itemId, change] as const),
  );
}
