import { describe, expect, it } from "vitest";
import { mergePendingAircraftChanges } from "@/lib/radar/live-aircraft-changes";

function aircraft(icaoHex: string) {
  return { icaoHex } as never;
}

describe("live aircraft change coalescing", () => {
  it("keeps only the latest operation for one ICAO", () => {
    let pending = mergePendingAircraftChanges(null, {
      full: false,
      changedAircraft: [aircraft("ABC001")],
      removedHexes: [],
    });
    pending = mergePendingAircraftChanges(pending, {
      full: false,
      changedAircraft: [],
      removedHexes: ["ABC001"],
    });
    expect(pending.changedHexes.has("ABC001")).toBe(false);
    expect(pending.removedHexes.has("ABC001")).toBe(true);

    pending = mergePendingAircraftChanges(pending, {
      full: false,
      changedAircraft: [aircraft("ABC001")],
      removedHexes: [],
    });
    expect(pending.changedHexes.has("ABC001")).toBe(true);
    expect(pending.removedHexes.has("ABC001")).toBe(false);
  });

  it("retains a full-snapshot requirement across later deltas", () => {
    let pending = mergePendingAircraftChanges(null, {
      full: true,
      changedAircraft: [aircraft("ABC001")],
      removedHexes: [],
    });
    pending = mergePendingAircraftChanges(pending, {
      full: false,
      changedAircraft: [aircraft("ABC002")],
      removedHexes: [],
    });
    expect(pending.full).toBe(true);
    expect([...pending.changedHexes].sort()).toEqual(["ABC001", "ABC002"]);
  });
});
