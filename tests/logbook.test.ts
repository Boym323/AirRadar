import { describe, expect, it } from "vitest";
import { classifyAircraftLogbook, isNewAircraft } from "@/lib/server/logbook";

describe("first-observation logbook semantics", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("marks the first persisted observation NEW on the Prague local day", () => {
    expect(isNewAircraft("2026-09-08T00:01:00Z", now, "Europe/Prague")).toBe(true);
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-09-08T00:01:00Z", flightCount: 1, returningGapDays: null }, now, "Europe/Prague")).toMatchObject({ isNew: true, isRare: false, labels: ["new"] });
  });

  it("uses local-day boundaries and does not treat a restart as a new observation", () => {
    expect(isNewAircraft("2026-09-07T20:00:00Z", now, "Europe/Prague")).toBe(false);
    expect(isNewAircraft(null, now, "Europe/Prague")).toBe(false);
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-09-07T20:00:00Z", flightCount: 0, returningGapDays: null }, now, "Europe/Prague").labels).toEqual([]);
  });

  it("marks repeat aircraft with up to three flights as rare", () => {
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-09-07T20:00:00Z", flightCount: 1, returningGapDays: null }, now, "Europe/Prague").isRare).toBe(true);
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-09-07T20:00:00Z", flightCount: 3, returningGapDays: null }, now, "Europe/Prague").labels).toEqual(["rare"]);
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-09-07T20:00:00Z", flightCount: 4, returningGapDays: null }, now, "Europe/Prague").isRare).toBe(false);
  });

  it("marks a return at the explicit thirty-day boundary and preserves overlapping labels", () => {
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-01-01T00:00:00Z", flightCount: 2, returningGapDays: 29 }, now, "Europe/Prague").isReturning).toBe(false);
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-01-01T00:00:00Z", flightCount: 2, returningGapDays: 30 }, now, "Europe/Prague")).toMatchObject({ isReturning: true, isRare: true, labels: ["rare", "returning"] });
  });
});
