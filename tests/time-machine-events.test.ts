import { describe, expect, it } from "vitest";
import { clusterTimeMachineEvents, orderTimeMachineEvents } from "@/lib/time-machine/events";
import type { TimeMachineEvent } from "@/lib/server/time-machine";

function event(id: string, occurredAt: string): TimeMachineEvent {
  return { id, type: "GO_AROUND", icaoHex: "ABC123", flightId: 1, occurredAt, callsign: "TEST", registration: null, airportIcao: null, sectorId: null, latitude: 50, longitude: 14 };
}

describe("time machine event timeline", () => {
  it("orders events deterministically and clusters only markers", () => {
    const input = [event("b", "2026-09-27T12:00:10Z"), event("a", "2026-09-27T12:00:00Z"), event("c", "2026-09-27T12:00:15Z")];
    expect(orderTimeMachineEvents(input).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(clusterTimeMachineEvents(input, 20_000)).toHaveLength(1);
    expect(input).toHaveLength(3);
  });
});
