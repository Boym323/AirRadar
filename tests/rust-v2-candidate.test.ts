import { describe, expect, it } from "vitest";
import { rustV2ToV1Candidate } from "@/lib/server/rust-v2-candidate";

const now = new Date("2026-10-21T00:00:00.000Z");
const receiver = { name: "Local", lat: 49.2, lon: 17.7 };
const craft = {
  id: "icao:abc123", lastMessageAt: 1792540800,
  lastPositionAt: 1792540799, position: { lat: 49.9, lon: 15.3 },
  positionOrigin: "adsb", stale: false, callsign: "TEST123", squawk: "7600",
  emitterCategory: "A3", telemetry: { altitudeBaroFt: 10000, groundSpeedKt: 260, trackDegrees: 175, verticalRateFpm: -200, onGround: false },
};
const frame = (aircraft: unknown[] = [craft]) => ({
  status: "live",
  data: { kind: "snapshot", epoch: "test-epoch", seq: 5, generatedAt: now.toISOString(), aircraft },
});
describe("AirRadar V2 Rust candidate adapter (not wired into V1 runtime)", () => {
  it("maps reliable Rust data into the existing V1 aircraft shape", () => {
    const result = rustV2ToV1Candidate(frame(), receiver, now);
    expect(result.provider).toBe("rust-v2-candidate");
    expect(result.messagesPerSecond).toBeNull();
    expect(result.aircraft).toHaveLength(1);
    expect(result.aircraft[0]).toMatchObject({
      icaoHex: "ABC123", lat: 49.9, lon: 15.3, altitude: 10000,
      baroAltitude: 10000, geomAltitude: null, groundSpeed: 260,
      track: 175, squawk: "7600", callsign: "TEST123",
      source: "ADS-B", origin: "local", registration: null,
    });
  });
  it("preserves non-ICAO identity and MLAT provenance", () => {
    const result = rustV2ToV1Candidate(frame([{ ...craft, id: "nonicao:012abc", positionOrigin: "mlat" }]), receiver, now);
    expect(result.aircraft[0]).toMatchObject({ icaoHex: "~012ABC", source: "MLAT" });
  });
  it("does not reuse stale/uncertain positions", () => {
    const result = rustV2ToV1Candidate(frame([
      { ...craft, id: "icao:000001", lastPositionAt: 1792540770 },
      { ...craft, id: "icao:000002", positionOrigin: "estimated" },
    ]), receiver, now);
    expect(result.aircraft.map(x => [x.lat, x.lon, x.trail.length])).toEqual([[null, null, 0], [null, null, 0]]);
  });
  it("refuses non-live, old, duplicate, malformed and oversized state", () => {
    expect(() => rustV2ToV1Candidate({ ...frame(), status: "waiting_for_observations" }, receiver, now)).toThrow();
    expect(() => rustV2ToV1Candidate(frame(), receiver, new Date(now.getTime() + 31_000))).toThrow();
    expect(() => rustV2ToV1Candidate(frame([craft, craft]), receiver, now)).toThrow();
    expect(() => rustV2ToV1Candidate(frame([{ ...craft, position: { lat: 999, lon: 15 } }]), receiver, now)).toThrow();
    expect(() => rustV2ToV1Candidate(frame(Array.from({ length: 5001 }, (_, i) => ({ ...craft, id: `icao:${i.toString(16).padStart(6, "0")}` }))), receiver, now)).toThrow();
    expect(() => rustV2ToV1Candidate(frame([{ ...craft, telemetry: { groundSpeedKt: 1e10 } }]), receiver, now)).toThrow();
    expect(() => rustV2ToV1Candidate(frame([{ ...craft, lastMessageAt: 1792540809 }]), receiver, now)).toThrow();
  });
  it("does not convert a waiting snapshot with zero aircraft into a healthy V1 state", () => {
    expect(() => rustV2ToV1Candidate({ ...frame([]), status: "waiting_for_observations" }, receiver, now)).toThrow();
  });
});
