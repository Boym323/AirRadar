import { describe, expect, it } from "vitest";
import { classifyAircraftLogbook, isNewAircraft } from "@/lib/server/logbook";

describe("first-observation logbook semantics", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("marks the first persisted observation NEW on the Prague local day", () => {
    expect(isNewAircraft("2026-09-08T00:01:00Z", now, "Europe/Prague")).toBe(true);
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-09-08T00:01:00Z" }, now, "Europe/Prague")).toMatchObject({ isNew: true, labels: ["new"] });
  });

  it("uses local-day boundaries and does not treat a restart as a new observation", () => {
    expect(isNewAircraft("2026-09-07T20:00:00Z", now, "Europe/Prague")).toBe(false);
    expect(isNewAircraft(null, now, "Europe/Prague")).toBe(false);
    expect(classifyAircraftLogbook({ firstObservedAt: "2026-09-07T20:00:00Z" }, now, "Europe/Prague").labels).toEqual([]);
  });
});
