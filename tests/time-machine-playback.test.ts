import { describe, expect, it } from "vitest";
import { playbackClock, sampleHistoricalAircraft, type HistoricalAircraftTrack } from "@/lib/time-machine/playback";
import { TIME_MACHINE_MAX_WINDOW_MS, validateTimeMachineWindow } from "@/lib/server/time-machine";

const track: HistoricalAircraftTrack = {
  id: "ABC123", hex: "ABC123", callsign: "TEST", registration: "OK-TEST", type: "A320", flightId: 7, origin: "LKPR", destination: "LOWW",
  positions: [
    { timestamp: "2026-09-18T10:00:00.000Z", lat: 50, lon: 14, altitude: 10_000, speed: 200, track: 355 },
    { timestamp: "2026-09-18T10:00:10.000Z", lat: 50.1, lon: 14.1, altitude: 11_000, speed: 220, track: 5 },
  ],
};

describe("time machine playback", () => {
  it("returns an exact observation and interpolates short gaps", () => {
    expect(sampleHistoricalAircraft(track, Date.parse(track.positions[0].timestamp))?.lat).toBe(50);
    const sample = sampleHistoricalAircraft(track, Date.parse("2026-09-18T10:00:05.000Z"));
    expect(sample?.lat).toBeCloseTo(50.05);
    expect(sample?.track).toBeCloseTo(0);
  });

  it("hides aircraft before first observation and across large gaps", () => {
    expect(sampleHistoricalAircraft(track, Date.parse("2026-09-18T09:59:59.000Z"))).toBeNull();
    const gapped = { ...track, positions: [track.positions[0], { ...track.positions[1], timestamp: "2026-09-18T10:01:00.000Z" }] };
    expect(sampleHistoricalAircraft(gapped, Date.parse("2026-09-18T10:00:30.000Z"))).toBeNull();
  });

  it("honours deterministic playback speed and end bound", () => {
    expect(playbackClock(1000, 100, 5, 2000)).toBe(1500);
    expect(playbackClock(1900, 100, 30, 2000)).toBe(2000);
  });

  it("validates bounded UTC windows", () => {
    expect(() => validateTimeMachineWindow("2026-09-18T10:00:00.000Z", "2026-09-18T10:05:00.000Z")).not.toThrow();
    expect(TIME_MACHINE_MAX_WINDOW_MS).toBe(300_000);
    expect(() => validateTimeMachineWindow("2026-09-18T10:05:00.000Z", "2026-09-18T10:00:00.000Z")).toThrow();
    expect(() => validateTimeMachineWindow("2026-09-18T10:00:00.000Z", "2026-09-18T10:06:00.000Z")).toThrow();
  });
});
