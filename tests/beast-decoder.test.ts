import { describe, expect, it } from "vitest";
import { BeastDecoder, decodeAltitudeCode } from "@/lib/server/beast-decoder";
import type { BeastFrame } from "@/lib/server/beast-parser";

const receiver = { lat: 50, lon: 14, name: "test" };
function frame(hex: string): BeastFrame {
  return { type: 0x33, timestamp: Buffer.alloc(6), signal: 200, payload: Buffer.from(hex, "hex") };
}

describe("BeastDecoder", () => {
  it("decodes ICAO and callsign from a deterministic DF17 identification frame", () => {
    const aircraft = new BeastDecoder(receiver).decode(frame("8d4840d6202cc371c32ce0576098"), Date.parse("2026-01-01T00:00:00Z"));
    expect(aircraft).toMatchObject({ icaoHex: "4840D6", callsign: "KLM1023", source: "ADS-B" });
  });
  it("decodes the full DF17 Q-bit altitude without turning 37,000 ft into -625 ft", () => {
    // Type code 11, altitude code 0xbf0 = 37,000 ft. The previous decoder
    // masked away the upper altitude bits and returned -625 ft.
    const aircraft = new BeastDecoder(receiver).decode(
      frame("8d4bb87a580bf000000000f15f2e"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft).toMatchObject({ icaoHex: "4BB87A", altitude: 37000, baroAltitude: 37000, sourceType: "df17" });
  });
  it("decodes valid Gillham/Q=0 altitude codes", () => {
    expect(decodeAltitudeCode(0x06a2)).toBe(10000);
    expect(decodeAltitudeCode(0x0bf0)).toBe(37000);
  });
  it("merges multiple messages into one bounded aircraft state", () => {
    const decoder = new BeastDecoder(receiver, 1, 30_000);
    decoder.decode(frame("8d4840d6202cc371c32ce0576098"));
    decoder.decode(frame("8d4840d6202cc371c32ce0576098"));
    expect(decoder.snapshot()).toHaveLength(1);
    expect(decoder.snapshot()[0].messages).toBe(2);
  });
  it("performs global airborne CPR independently of the receiver position", () => {
    const decoder = new BeastDecoder({ lat: 49.22, lon: 17.67, name: "Zlin" }, 10, 30_000, { origin: "adsblol" });
    decoder.decode(frame("8d40621d58c382d690c8ac2863a7"), 1_000);
    const aircraft = decoder.decode(frame("8d40621d58c386435cc412692ad6"), 2_000);
    expect(aircraft).toMatchObject({ origin: "adsblol", provenance: { seenLocal: false, seenNetwork: true } });
    expect(aircraft?.lat).toBeCloseTo(52.2658, 3);
    expect(aircraft?.lon).toBeCloseTo(3.9389, 3);
    expect(aircraft?.distanceKm).toBeGreaterThan(700);
  });
  it("decodes a TC19 ground-speed frame without an impossible vertical rate", () => {
    const aircraft = new BeastDecoder(receiver).decode(
      frame("8d485020994409940838175b284f"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft).toMatchObject({ groundSpeed: 159, verticalRate: -832, baroRate: null, geomRate: -832 });
    expect(aircraft?.track).toBeCloseTo(182.9, 1);
  });
  it("keeps GNSS altitude separate from barometric altitude", () => {
    // TC20, Q-bit altitude code 0xbf0 = 37,000 ft GNSS altitude.
    const aircraft = new BeastDecoder(receiver).decode(
      frame("8d4bb87aa00bf00000000085b843"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft).toMatchObject({ altitude: 37000, geomAltitude: 37000 });
    expect(aircraft?.baroAltitude).toBeUndefined();
  });
  it("rejects a corrupted extended-squitter frame before decoding it", () => {
    const corrupted = "8d485020994409940838175b284e";
    expect(new BeastDecoder(receiver).decode(frame(corrupted))).toBeNull();
  });
  it("decodes TC28 emergency status and squawk", () => {
    // TC28 subtype 1, emergency state 0, identity code 0x0808 = squawk 1200.
    const aircraft = new BeastDecoder(receiver).decode(
      frame("8d4bb87ae1080800000000a893de"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft).toMatchObject({ squawk: "1200", emergency: null });
  });
  it("decodes surface traffic as on-ground with local CPR", () => {
    const aircraft = new BeastDecoder({ lat: 43.6264, lon: 1.3747, name: "LFBO" }).decode(
      frame("903a23ff426a4e65f7487a775d17"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft).toMatchObject({ onGround: true });
    expect(aircraft?.lat).toBeCloseTo(43.6264, 2);
    expect(aircraft?.lon).toBeCloseTo(1.3747, 2);
  });
  it("decodes TC29 target state and status", () => {
    const aircraft = new BeastDecoder(receiver).decode(
      frame("8d4bb87aeaa72865017fdc130ae3"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft?.targetState).toMatchObject({
      selectedAltitudeFt: 20000,
      selectedAltitudeSource: "FMS",
      baroPressureHpa: 1013.6,
      selectedHeadingDeg: 90,
      autopilot: true,
      vnavMode: true,
      altitudeHoldMode: true,
      approachMode: true,
      lnavMode: true,
      tcasOperational: true,
    });
  });
  it("decodes TC31 aircraft operational status", () => {
    const aircraft = new BeastDecoder(receiver).decode(
      frame("8d4bb87af9123456785936ffca33"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft?.operationalStatus).toEqual({
      subtype: 1,
      capabilityClass: 0x1234,
      operationalMode: 0x5678,
      adsbVersion: 2,
      nicSupplementA: 1,
      nacp: 9,
      sil: 3,
      headingReference: "magnetic",
      nicBaro: null,
      silSupplement: 1,
    });
  });
});
