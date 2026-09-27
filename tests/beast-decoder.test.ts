import { describe, expect, it } from "vitest";
import { BeastDecoder, decodeAdsbBarometricAltitude, decodeAdsbGnssAltitude, decodeAltitudeCode } from "@/lib/server/beast-decoder";
import type { BeastFrame } from "@/lib/server/beast-parser";

const receiver = { lat: 50, lon: 14, name: "test" };
function frame(hex: string): BeastFrame {
  return { type: 0x33, timestamp: Buffer.alloc(6), signal: 200, payload: Buffer.from(hex, "hex") };
}

const CRC_POLYNOMIAL = 0xfff409;
function crc(payload: Buffer): number {
  let value = 0n;
  for (const byte of payload) value = (value << 8n) | BigInt(byte);
  for (let bit = payload.length * 8 - 1; bit >= 24; bit -= 1) {
    if ((value >> BigInt(bit)) & 1n) value ^= BigInt(CRC_POLYNOMIAL) << BigInt(bit - 24);
  }
  return Number(value & 0xffffffn);
}

function df17Frame(icao: number, meHex: string): BeastFrame {
  const payload = Buffer.alloc(14);
  payload[0] = 0x8d;
  payload[1] = icao >>> 16;
  payload[2] = icao >>> 8;
  payload[3] = icao;
  Buffer.from(meHex, "hex").copy(payload, 4);
  const crcPayload = Buffer.from(payload);
  crcPayload.fill(0, 11);
  const parity = crc(crcPayload);
  payload[11] = parity >>> 16;
  payload[12] = parity >>> 8;
  payload[13] = parity;
  return { type: 0x33, timestamp: Buffer.alloc(6), signal: 200, payload };
}

function apFrame(df: number, icao: number, body: [number, number]): Buffer {
  const payload = Buffer.from([df << 3, 0, body[0], body[1], 0, 0, 0]);
  const parity = crc(payload) ^ icao;
  payload[4] = parity >>> 16;
  payload[5] = parity >>> 8;
  payload[6] = parity;
  return payload;
}

describe("BeastDecoder", () => {
  it("decodes ICAO and callsign from a deterministic DF17 identification frame", () => {
    const aircraft = new BeastDecoder(receiver).decode(frame("8d4840d6202cc371c32ce0576098"), Date.parse("2026-01-01T00:00:00Z"));
    expect(aircraft).toMatchObject({ icaoHex: "4840D6", callsign: "KLM1023", category: "A4", source: "ADS-B" });
  });
  it("decodes the 12-bit DF17 Q-bit altitude without using the DF4/20 AC13 layout", () => {
    // TC11: ME altitude bits are 0xbf0 = 37,000 ft. The field is 12 bits;
    // the following T/F/CPR bits are not part of the altitude.
    const aircraft = new BeastDecoder(receiver).decode(
      df17Frame(0x4bb87a, "58bf0000000000"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft).toMatchObject({ icaoHex: "4BB87A", altitude: 37000, baroAltitude: 37000, sourceType: "df17" });
  });
  it("decodes independent AC13 Gillham/Q=0 and Q=1 altitude codes", () => {
    // Layout and Gillham rules cross-checked against:
    // https://mode-s.org/1090MHz/content/mode-s/3-surveillance.html
    expect(decodeAltitudeCode(0x06a2)).toBe(10000);
    expect(decodeAltitudeCode(0x6b8)).toBe(10000);
  });
  it.each([
    [0, 0x058],
    [10_000, 0x378],
    [30_000, 0x9b8],
    [40_000, 0xcd8],
    [41_000, 0xd30],
    [45_000, 0xe70],
  ] as const)("decodes independent ADS-B AC12 vector %s ft", (altitude, code) => {
    expect(decodeAdsbBarometricAltitude(code)).toBe(altitude);
  });
  it("regresses the production bug pattern instead of decoding 41000/40000 as ~2x", () => {
    expect(decodeAdsbBarometricAltitude(0xd30)).toBe(41_000);
    expect(decodeAdsbBarometricAltitude(0xcd8)).toBe(40_000);
    expect(decodeAdsbBarometricAltitude(0xd30)).not.toBe(82_600);
    expect(decodeAdsbBarometricAltitude(0xcd8)).not.toBe(80_800);
  });
  it.each([
    [41_000, "58d30000000000"],
    [40_000, "58cd8000000000"],
  ] as const)("carries the corrected AC12 altitude %s ft through the Beast aircraft state", (altitude, me) => {
    const aircraft = new BeastDecoder(receiver).decode(df17Frame(0x4bb87a, me));
    expect(aircraft).toMatchObject({ altitude, baroAltitude: altitude, sourceType: "df17" });
  });
  it("keeps ADS-B GNSS altitude in its own metres-to-feet decoder", () => {
    expect(decodeAdsbGnssAltitude(0x0bf)).toBe(627);
    expect(decodeAdsbBarometricAltitude(0x0bf)).toBe(1_375);
  });
  it("decodes short DF11 identity and DF4 altitude replies", () => {
    const decoder = new BeastDecoder(receiver);
    const allCall = decoder.decode(frame("5d4bb87a000000"));
    expect(allCall).toMatchObject({ icaoHex: "4BB87A", sourceType: "df11" });
    const altitudeReply = decoder.decode({ ...frame("00000000000000"), payload: apFrame(4, 0x4bb87a, [0x06, 0xb8]) });
    expect(altitudeReply).toMatchObject({ icaoHex: "4BB87A", altitude: 10000, baroAltitude: 10000, sourceType: "df4" });
  });
  it("rejects AP replies whose ICAO is not already tracked", () => {
    const payload = apFrame(4, 0x123456, [0x0b, 0xf0]);
    expect(new BeastDecoder(receiver).decode({ ...frame("00000000000000"), payload })).toBeNull();
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
    // TC20, GNSS height is a 12-bit metre value, not AC13 feet.
    const aircraft = new BeastDecoder(receiver).decode(
      df17Frame(0x4bb87a, "a00bf000000000"),
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(aircraft).toMatchObject({ altitude: 627, geomAltitude: 627 });
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

  it("does not refresh extended telemetry age on unrelated Beast frames", () => {
    const decoder = new BeastDecoder(receiver);
    const telemetryAt = Date.parse("2026-01-01T00:00:00Z");
    const ordinaryAt = Date.parse("2026-01-01T00:01:00Z");

    const targetState = decoder.decode(frame("8d4bb87aeaa72865017fdc130ae3"), telemetryAt)!;
    expect(targetState.observationTimes?.extendedTelemetry).toBe(telemetryAt);

    const ordinaryAltitude = decoder.decode(
      df17Frame(0x4bb87a, "58bf0000000000"),
      ordinaryAt,
    )!;
    expect(ordinaryAltitude.observationTimes?.extendedTelemetry).toBe(telemetryAt);
    expect(ordinaryAltitude.observationTimes?.signal).toBe(ordinaryAt);
  });

  it("keeps the last altitude message DF/TC when a later frame is unrelated", () => {
    const decoder = new BeastDecoder(receiver);
    const altitude = decoder.decode(df17Frame(0x4bb87a, "58bf0000000000"), 1_000)!;
    expect(altitude.altitudeObservation).toMatchObject({ source: "LOCAL_BEAST", df: 17, typeCode: 11, valueFt: 37_000 });
    const identity = decoder.decode(df17Frame(0x4bb87a, "20800000000000"), 2_000)!;
    expect(identity.altitudeObservation).toMatchObject({ df: 17, typeCode: 11, valueFt: 37_000 });
  });

  it("retains the receiver-local Beast signal and uses usable receiver time deltas", () => {
    const decoder = new BeastDecoder(receiver);
    const payload = Buffer.from("8d4bb87a580bf000000000f15f2e", "hex");
    const first = decoder.decode({ ...frame(""), timestamp: Buffer.from("000000100000", "hex"), signal: 77, payload }, 1_000_000)!;
    const firstSeen = Date.parse(first.lastSeen);
    const second = decoder.decode({ ...frame(""), timestamp: Buffer.from("00000010bb80", "hex"), signal: 88, payload }, 2_000_000)!;
    const secondSeen = Date.parse(second.lastSeen);
    expect(firstSeen).toBe(1_000_000);
    expect(second.beastSignal).toBe(88);
    expect(secondSeen - firstSeen).toBe(4);
  });

  it("counts missing timestamps and rejects non-wrap discontinuities", () => {
    const decoder = new BeastDecoder(receiver);
    const payload = Buffer.from("8d4bb87a580bf000000000f15f2e", "hex");
    decoder.decode({ ...frame(""), timestamp: Buffer.alloc(6), payload }, 1_000);
    decoder.decode({ ...frame(""), timestamp: Buffer.from("000000100000", "hex"), payload }, 2_000);
    decoder.decode({ ...frame(""), timestamp: Buffer.from("0000000fffff", "hex"), payload }, 3_000);
    expect(decoder.getDiagnostics()).toMatchObject({ timestampFallbacks: 1, timestampDiscontinuities: 1 });
  });
});
