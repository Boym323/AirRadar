import { describe, expect, it } from "vitest";
import { aircraftDurableValues, changedAircraftValues, planFlightUpdate } from "@/lib/server/flight-update-policy";

const base = {
  callsign: "ABC123", registration: "OK-ABC", aircraftType: "A320", airline: "ABC",
  origin: "LKPR", destination: "EDDF", maxAltitude: 30_000, minDistanceKm: 12,
  lastSeenAt: new Date("2026-09-28T19:00:00.000Z"),
};

describe("Flight update planning", () => {
  it("does not write unchanged fields", () => {
    const plan = planFlightUpdate(base, { ...base, altitude: 29_000, distanceKm: 20, lastSeenAt: base.lastSeenAt });
    expect(plan.data).toEqual({});
  });

  it("persists missing identity and route metadata", () => {
    const current = { ...base, registration: null, origin: null, destination: null };
    const plan = planFlightUpdate(current, { ...base, registration: "OK-NEW", origin: "EDDF", destination: "KJFK", altitude: 30_000, distanceKm: 12, lastSeenAt: base.lastSeenAt });
    expect(plan.data).toMatchObject({ registration: "OK-NEW", origin: "EDDF", destination: "KJFK" });
  });

  it("persists aggregate improvements but skips non-improvements", () => {
    expect(planFlightUpdate(base, { ...base, altitude: 31_000, distanceKm: 10, lastSeenAt: base.lastSeenAt }).data).toMatchObject({ maxAltitude: 31_000, minDistanceKm: 10 });
    expect(planFlightUpdate(base, { ...base, altitude: 30_000, distanceKm: 12, lastSeenAt: base.lastSeenAt }).data).toEqual({});
  });

  it("persists a due durable freshness heartbeat", () => {
    const plan = planFlightUpdate(base, { ...base, altitude: 30_000, distanceKm: 12, lastSeenAt: new Date("2026-09-28T19:00:01.000Z") });
    expect(plan.data).toEqual({ lastSeenAt: new Date("2026-09-28T19:00:01.000Z") });
  });
});

describe("Aircraft update planning", () => {
  const item = { icaoHex: "ABCDEF", registration: "OK-ABC", aircraftType: "A320", enrichment: { metadata: { registration: "OK-ABC", registrationCountry: "CZ", registrationCountryCode: "CZE", icaoTypeCode: "A320", manufacturer: "Airbus", aircraftDescription: "A320", operator: "ABC" } } } as never;
  it("skips identical catalog values", () => {
    const values = aircraftDurableValues(item);
    expect(changedAircraftValues(values, values)).toEqual({});
  });
});
