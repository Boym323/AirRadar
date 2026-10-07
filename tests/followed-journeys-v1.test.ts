import { describe, expect, it } from "vitest";
import {
  addFollowedJourney,
  parseFollowedJourneys,
  resolveFollowedJourney,
  serializeFollowedJourneys,
  updateJourneyFromEvents,
} from "@/lib/followed-journeys";

describe("Follow Flight / Journey V1", () => {
  it("prefers durable Flight Intelligence identity when available", () => {
    const journey = resolveFollowedJourney({
      icaoHex: "8964A1", callsign: "UAE139", origin: "DXB", destination: "PRG",
      followedAt: "2026-10-07T15:00:00Z",
      events: [{ flightId: 42, lifecycleKey: "life-42", occurredAt: "2026-10-07T14:59:00Z", type: "APPROACH" }],
    });
    expect(journey).toMatchObject({ key: "flight:42", identity: "DURABLE", flightId: 42, lifecycleKey: "life-42" });
  });

  it("keeps an explicit provisional journey when durable identity is not ready", () => {
    const journey = resolveFollowedJourney({
      icaoHex: "8964A1", callsign: "UAE139", origin: "DXB", destination: "PRG",
      followedAt: "2026-10-07T15:00:00Z", events: [],
    });
    expect(journey.identity).toBe("PROVISIONAL");
    expect(journey.key).toContain("provisional:8964A1:UAE139:DXB:PRG:2026-10-07");
  });

  it("promotes provisional identity and closes the journey on LANDING", () => {
    const provisional = resolveFollowedJourney({
      icaoHex: "8964A1", callsign: "UAE139", origin: "DXB", destination: "PRG",
      followedAt: "2026-10-07T15:00:00Z", events: [],
    });
    const updated = updateJourneyFromEvents(provisional, [
      { flightId: 42, lifecycleKey: "life-42", occurredAt: "2026-10-07T15:05:00Z", type: "APPROACH" },
      { flightId: 42, lifecycleKey: "life-42", occurredAt: "2026-10-07T15:12:00Z", type: "LANDING" },
    ]);
    expect(updated).toMatchObject({ key: "flight:42", identity: "DURABLE", status: "COMPLETED", completedAt: "2026-10-07T15:12:00.000Z" });
  });

  it("round-trips bounded browser-local state", () => {
    const journey = resolveFollowedJourney({ icaoHex: "ABC123", followedAt: "2026-10-07T15:00:00Z", events: [] });
    const state = addFollowedJourney({ version: 1, journeys: [] }, journey);
    expect(parseFollowedJourneys(serializeFollowedJourneys(state))).toEqual(state);
  });
});
