import { describe, expect, it } from "vitest";
import { compareAircraftOperationalFocus } from "@/lib/operational-twin/aircraft-operational-focus-change";
import type { AircraftOperationalFocusItem, AircraftOperationalFocusSummary } from "@/lib/operational-twin/types";

function item(overrides: Partial<AircraftOperationalFocusItem> & Pick<AircraftOperationalFocusItem, "id">): AircraftOperationalFocusItem {
  return {
    id: overrides.id,
    type: overrides.type ?? "WEATHER",
    level: overrides.level ?? "WATCH",
    offsetMinutes: overrides.offsetMinutes ?? 10,
    at: overrides.at ?? "2026-10-06T10:10:00.000Z",
    confidence: overrides.confidence ?? "MEDIUM",
    label: overrides.label ?? "TEST",
    source: overrides.source ?? "TEST",
    sourceReference: overrides.sourceReference ?? null,
    reasonCodes: overrides.reasonCodes ?? ["TEST"],
  };
}

function summary(generatedAt: string, items: AircraftOperationalFocusItem[]): AircraftOperationalFocusSummary {
  return {
    version: "aircraft-operational-focus-v1",
    generatedAt,
    level: items.some((value) => value.level === "ATTENTION") ? "ATTENTION" : items.length ? "WATCH" : "NORMAL",
    total: items.length,
    watch: items.filter((value) => value.level === "WATCH").length,
    attention: items.filter((value) => value.level === "ATTENTION").length,
    truncated: false,
    items,
    limitations: [
      "OPERATIONAL_CONTEXT_ONLY",
      "NOT_SAFETY_ALERT",
      "NO_ATC_CLEARANCE_INFERENCE",
      "SOURCE_SEMANTICS_PRESERVED",
      "NO_ALL_CLEAR_INFERENCE",
    ],
  };
}

describe("Aircraft Operational Focus Change Intelligence V1", () => {
  it("classifies new, escalated, deescalated and resolved items", () => {
    const previous = summary("2026-10-06T10:00:00.000Z", [
      item({ id: "escalate", level: "WATCH" }),
      item({ id: "deescalate", level: "ATTENTION" }),
      item({ id: "resolved", level: "WATCH" }),
    ]);
    const current = summary("2026-10-06T10:01:00.000Z", [
      item({ id: "escalate", level: "ATTENTION" }),
      item({ id: "deescalate", level: "WATCH" }),
      item({ id: "new", level: "ATTENTION" }),
    ]);

    const result = compareAircraftOperationalFocus(previous, current);

    expect(result?.changes.map((change) => [change.kind, change.itemId])).toEqual([
      ["ESCALATED", "escalate"],
      ["NEW", "new"],
      ["DEESCALATED", "deescalate"],
      ["RESOLVED", "resolved"],
    ]);
    expect(result?.counts).toEqual({
      NEW: 1,
      ESCALATED: 1,
      DEESCALATED: 1,
      UPDATED: 0,
      RESOLVED: 1,
    });
  });

  it("does not treat natural offset decay as an update", () => {
    const previous = summary("2026-10-06T10:00:00.000Z", [
      item({ id: "stable", offsetMinutes: 10, at: "2026-10-06T10:10:00.000Z" }),
    ]);
    const current = summary("2026-10-06T10:01:00.000Z", [
      item({ id: "stable", offsetMinutes: 9, at: "2026-10-06T10:10:00.000Z" }),
    ]);

    expect(compareAircraftOperationalFocus(previous, current)?.changes).toEqual([]);
  });

  it("marks material absolute timing, confidence and semantic changes as updated", () => {
    const previous = summary("2026-10-06T10:00:00.000Z", [
      item({ id: "timing", at: "2026-10-06T10:10:00.000Z" }),
      item({ id: "confidence", confidence: "LOW" }),
      item({ id: "label", label: "OLD" }),
    ]);
    const current = summary("2026-10-06T10:01:00.000Z", [
      item({ id: "timing", at: "2026-10-06T10:11:00.000Z" }),
      item({ id: "confidence", confidence: "HIGH" }),
      item({ id: "label", label: "NEW" }),
    ]);

    const result = compareAircraftOperationalFocus(previous, current);
    expect(result?.changes.map((change) => change.kind)).toEqual(["UPDATED", "UPDATED", "UPDATED"]);
    expect(result?.changes.find((change) => change.itemId === "timing")?.timingShiftSeconds).toBe(60);
  });

  it("returns no change summary until two valid focus snapshots exist", () => {
    const current = summary("2026-10-06T10:01:00.000Z", [item({ id: "one" })]);
    expect(compareAircraftOperationalFocus(null, current)).toBeNull();
    expect(compareAircraftOperationalFocus(current, null)).toBeNull();
  });
});
