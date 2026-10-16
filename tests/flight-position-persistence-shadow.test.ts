import { describe, expect, it } from "vitest";
import { FlightPositionPersistenceShadow } from "@/lib/server/flight-position-persistence-shadow";

const candidate = (at: number) => ({ recordedAtMs: at, lat: 50, lon: 14, altitudeFt: 30_000, trackDeg: 90, groundSpeedKt: 430, verticalRateFpm: 0, onGround: false, source: "ADS-B", airportProximity: false, phase: "cruise" as const });

describe("FlightPositionPersistenceShadow", () => {
  it("records the live/shadow matrix without changing the live decision", () => {
    const shadow = new FlightPositionPersistenceShadow(true);
    shadow.observe({ aircraftHex: "ABC", candidate: candidate(0), currentPersist: true, nowMs: 0 });
    shadow.observe({ aircraftHex: "ABC", candidate: candidate(20_000), currentPersist: true, nowMs: 20_000 });
    const diagnostics = shadow.diagnostics();
    expect(diagnostics.currentPersist).toBe(2);
    expect(diagnostics.currentSkipShadowPersist).toBe(0);
    expect(diagnostics.currentPersistShadowSkip).toBe(1);
    expect(diagnostics.shadowPersist).toBe(1);
  });

  it("exposes the inactive guard without changing shadow evaluation", () => {
    const off = new FlightPositionPersistenceShadow(false);
    expect(off.isEnabled).toBe(false);
    off.observe({ aircraftHex: "ABC", candidate: candidate(0), currentPersist: true, nowMs: 0 });
    expect(off.diagnostics().positionsSeen).toBe(0);
    expect(new FlightPositionPersistenceShadow(true).isEnabled).toBe(true);
  });

  it("evicts the oldest record at the maximum bound without sorting the state", () => {
    const shadow = new FlightPositionPersistenceShadow(true);
    for (let i = 0; i <= 10_000; i++) {
      shadow.observe({ aircraftHex: `X${i}`, candidate: candidate(i), currentPersist: true, nowMs: i });
    }
    const state = (shadow as unknown as { states: Map<string, unknown> }).states;
    expect(state.size).toBe(10_000);
    expect(state.has("X0")).toBe(false);
    expect(state.has("X1")).toBe(true);
    expect(state.has("X10000")).toBe(true);
  });

  it("cleans inactive state after the bounded expiry window", () => {
    const shadow = new FlightPositionPersistenceShadow(true);
    shadow.observe({ aircraftHex: "ABC", candidate: candidate(0), currentPersist: true, nowMs: 0 });
    expect(shadow.diagnostics().stateEntries).toBe(1);
    shadow.cleanup([], 60 * 60_000 + 1);
    expect(shadow.diagnostics().stateEntries).toBe(0);
  });
});
