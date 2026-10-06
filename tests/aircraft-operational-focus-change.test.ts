import { describe, expect, it } from "vitest";
import { diffAircraftOperationalFocus } from "@/lib/operational-twin/operational-focus-change";
import type { AircraftOperationalFocusSummary } from "@/lib/operational-twin/types";

function focus(generatedAt: string, items: AircraftOperationalFocusSummary["items"]): AircraftOperationalFocusSummary {
  return {
    version: "aircraft-operational-focus-v1",
    generatedAt,
    level: items.some((item) => item.level === "ATTENTION") ? "ATTENTION" : items.length ? "WATCH" : "NORMAL",
    total: items.length,
    watch: items.filter((item) => item.level === "WATCH").length,
    attention: items.filter((item) => item.level === "ATTENTION").length,
    truncated: false,
    items,
    limitations: ["OPERATIONAL_CONTEXT_ONLY", "NOT_SAFETY_ALERT", "NO_ATC_CLEARANCE_INFERENCE", "SOURCE_SEMANTICS_PRESERVED", "NO_ALL_CLEAR_INFERENCE"],
  };
}

const base = {
  type: "WEATHER" as const,
  offsetMinutes: 12,
  at: "2026-10-06T09:12:00.000Z",
  confidence: "HIGH" as const,
  label: "CONVECTION",
  source: "SIGMET",
  sourceReference: "SIG-1",
  reasonCodes: ["WEATHER_HIGH_SEVERITY"],
};

describe("Aircraft Operational Focus Change Intelligence V1", () => {
  it("detects new, escalation, update and resolved changes in priority order", () => {
    const previous = focus("2026-10-06T09:00:00.000Z", [
      { ...base, id: "weather:a", level: "WATCH" },
      { ...base, id: "weather:b", level: "WATCH", label: "OLD" },
      { ...base, id: "weather:gone", level: "ATTENTION" },
    ]);
    const current = focus("2026-10-06T09:01:00.000Z", [
      { ...base, id: "weather:a", level: "ATTENTION" },
      { ...base, id: "weather:b", level: "WATCH", label: "UPDATED" },
      { ...base, id: "weather:new", level: "WATCH" },
    ]);

    expect(diffAircraftOperationalFocus(previous, current)?.changes.map((change) => [change.itemId, change.kind])).toEqual([
      ["weather:a", "ESCALATED"],
      ["weather:new", "NEW"],
      ["weather:b", "UPDATED"],
      ["weather:gone", "RESOLVED"],
    ]);
  });

  it("does not emit a change set for the same generated snapshot", () => {
    const snapshot = focus("2026-10-06T09:00:00.000Z", [{ ...base, id: "weather:a", level: "WATCH" }]);
    expect(diffAircraftOperationalFocus(snapshot, snapshot)).toBeNull();
  });

  it("treats sub-minute timing movement as noise", () => {
    const previous = focus("2026-10-06T09:00:00.000Z", [{ ...base, id: "weather:a", level: "WATCH" }]);
    const current = focus("2026-10-06T09:01:00.000Z", [{ ...base, id: "weather:a", level: "WATCH", offsetMinutes: 11.4 }]);
    expect(diffAircraftOperationalFocus(previous, current)?.changes).toEqual([]);
  });
});
