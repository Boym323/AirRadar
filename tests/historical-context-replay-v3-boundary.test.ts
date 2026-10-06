import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const timeMachine = readFileSync(new URL("../components/time-machine.tsx", import.meta.url), "utf8");
const rangeRoute = readFileSync(new URL("../app/api/map-context/range/route.ts", import.meta.url), "utf8");

describe("Historical Context Replay V3 boundary", () => {
  it("uses the existing map-context archive range instead of adding replay persistence", () => {
    expect(timeMachine).toContain("/api/map-context/range");
    expect(rangeRoute).toContain("defaultMapContextArchive.range()");
    expect(timeMachine).not.toContain("/api/time-machine/context-range");
    expect(timeMachine).not.toContain("getPrisma");
  });

  it("surfaces availability for every already-supported historical context layer", () => {
    for (const layer of ["traffic", "radar", "metar", "wind", "aup"]) {
      expect(timeMachine).toContain("archiveRange?." + layer);
    }
    expect(timeMachine).toContain("archiveAvailability");
    expect(timeMachine).toContain("retentionFloor");
  });

  it("adds event-centric navigation over the already-loaded bounded event list", () => {
    expect(timeMachine).toContain("previousEvent");
    expect(timeMachine).toContain("nextEvent");
    expect(timeMachine).toContain("selectEvent(previousEvent)");
    expect(timeMachine).toContain("selectEvent(nextEvent)");
    expect(timeMachine).not.toContain("/api/intelligence/events");
  });
});
