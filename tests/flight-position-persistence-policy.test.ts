import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT,
  makeFlightPositionPolicySample,
  shouldPersistFlightPosition,
  type FlightPositionCandidate,
} from "@/lib/server/flight-position-persistence-policy";

const base: FlightPositionCandidate = {
  recordedAtMs: 0, lat: 50, lon: 14, altitudeFt: 30_000, trackDeg: 90,
  groundSpeedKt: 430, verticalRateFpm: 0, onGround: false, source: "ADS-B",
  airportProximity: false, phase: "cruise",
};

const decide = (overrides: Partial<FlightPositionCandidate>, previous = base) => shouldPersistFlightPosition(
  previous,
  { ...base, recordedAtMs: 20_000, ...overrides },
  DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT,
);

describe("FlightPosition adaptive persistence policy", () => {
  it("persists the first observation and heartbeat", () => {
    expect(shouldPersistFlightPosition(null, base).persist).toBe(true);
    expect(decide({ recordedAtMs: 120_000 })).toMatchObject({ persist: true, reason: "heartbeat-not-due" });
  });

  it("skips stable cruise and preserves movement/heading/altitude transitions", () => {
    expect(decide({})).toMatchObject({ persist: false, reason: "stable-cruise" });
    expect(decide({ lat: 50.01 })).toMatchObject({ persist: true, reason: "movement-below-threshold" });
    expect(decide({ trackDeg: 110 })).toMatchObject({ persist: true, reason: "heading-change" });
    expect(decide({ altitudeFt: 30_500 })).toMatchObject({ persist: true, reason: "altitude-change" });
    expect(decide({ verticalRateFpm: 800 })).toMatchObject({ persist: true, reason: "vertical-state-change" });
  });

  it("increases fidelity for airport, source, ground and gap transitions", () => {
    expect(decide({ airportProximity: true })).toMatchObject({ persist: true, reason: "airport-fidelity" });
    expect(decide({ source: "MLAT" })).toMatchObject({ persist: true, reason: "source-transition" });
    expect(decide({ onGround: true })).toMatchObject({ persist: true, reason: "air-ground-transition" });
    expect(decide({ recordedAtMs: 90_000 })).toMatchObject({ persist: true, reason: "observation-gap" });
  });

  it("keeps the persisted sample shape explicit", () => {
    expect(makeFlightPositionPolicySample({ ...base, airportProximity: true, phase: "airport" })).toEqual({
      recordedAtMs: 0, lat: 50, lon: 14, altitudeFt: 30_000, trackDeg: 90,
      groundSpeedKt: 430, verticalRateFpm: 0, onGround: false, source: "ADS-B",
    });
  });
});
