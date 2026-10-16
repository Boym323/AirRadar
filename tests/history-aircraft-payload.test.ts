import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { historyAircraftForSnapshot } from "@/lib/server/history-aircraft-payload";

const sample = (changes: Partial<Aircraft> = {}): Aircraft => ({
  icaoHex: "ABC123", callsign: "TEST1", registration: "OK-ABC", aircraftType: "A320",
  aircraftDescription: "Airbus", ...changes,
} as Aircraft);

describe("history aircraft payload: allocation and identity", () => {
  it("reuses immutable already-complete snapshots", () => {
    const item = Object.freeze(sample());
    const current = sample();
    expect(historyAircraftForSnapshot(item, current)).toBe(item);
    expect(historyAircraftForSnapshot(item, undefined)).toBe(item);
  });
  it("hydrates missing durable metadata on a new object, without mutation", () => {
    const item = Object.freeze(sample({
      registration: null, aircraftType: null, aircraftDescription: null,
    }));
    const current = sample();
    const result = historyAircraftForSnapshot(item, current);
    expect(result).not.toBe(item);
    expect(result).toMatchObject({ registration: "OK-ABC", aircraftType: "A320", aircraftDescription: "Airbus" });
    expect(item.registration).toBeNull();
  });
  it("preserves same-callsign route and never resurrects stale route", () => {
    const previousRoute = { origin: "LKPR", destination: "EGLL" } as NonNullable<Aircraft["enrichment"]>["route"];
    const metadata = { registration: "OK-ABC" } as NonNullable<Aircraft["enrichment"]>["metadata"];
    const current = sample({ enrichment: { route: previousRoute, metadata } });
    const item = sample({ enrichment: { metadata } });
    expect(historyAircraftForSnapshot(item, current)).toMatchObject({ enrichment: { route: previousRoute } });
    const changed = sample({ callsign: "NEW2", enrichment: { metadata } });
    const after = historyAircraftForSnapshot(changed, current);
    expect(after).toBe(changed);
    expect(after.enrichment?.route).toBeUndefined();
  });
});
