import { describe, expect, it } from "vitest";
import { decodeCommB } from "@/lib/server/bds-decoder";

describe("Comm-B BDS decoder", () => {
  it("decodes the published BDS 4,0 example", () => {
    // DF20 example A8001EBCAEE57730A80106DE1344; MB is bytes 5..11.
    const result = decodeCommB(Buffer.from("aee57730a80106", "hex"));
    expect(result).toMatchObject({ register: "BDS4,0", confidence: "high" });
    expect(result?.values).toMatchObject({ selectedAltitudeMcpFt: 24000, selectedAltitudeFmsFt: 24000, navQnhHpa: 1013.2 });
  });

  it("decodes BDS 4,4 wind, temperature and static pressure", () => {
    const field = (value: bigint, start: number, length: number, raw: number): bigint => {
      const shift = BigInt(56 - start - length);
      return value | (BigInt(raw) << shift);
    };
    let mb = 0n;
    mb = field(mb, 0, 4, 1);      // FOM
    mb = field(mb, 4, 1, 1);      // wind valid
    mb = field(mb, 5, 9, 45);     // 45 kt
    mb = field(mb, 14, 9, 128);   // 90 degrees
    mb = field(mb, 24, 10, 80);   // +20 C
    mb = field(mb, 34, 1, 1);     // static pressure valid
    mb = field(mb, 35, 11, 1013); // 1013 hPa
    const payload = Buffer.from(mb.toString(16).padStart(14, "0"), "hex");

    const result = decodeCommB(payload);
    expect(result).toMatchObject({ register: "BDS4,4", confidence: "medium" });
    expect(result?.values).toMatchObject({
      windSpeedKt: 45,
      windDirectionDeg: 90,
      outsideAirTemperatureC: 20,
      staticPressureHpa: 1013,
    });
  });

  it("rejects status/value violations instead of manufacturing telemetry", () => {
    expect(decodeCommB(Buffer.from("00000000000000", "hex"))).toBeNull();
  });

  it("decodes optional turbulence and humidity and returns unavailable fields as absent", () => {
    const field = (value: bigint, start: number, length: number, raw: number): bigint => value | (BigInt(raw) << BigInt(56 - start - length));
    let mb = 0n;
    mb = field(mb, 0, 4, 2);      // GNSS FOM
    mb = field(mb, 4, 1, 1);      // wind valid
    mb = field(mb, 5, 9, 80);
    mb = field(mb, 14, 9, 0);
    mb = field(mb, 24, 10, 120);   // +30 C
    mb = field(mb, 46, 1, 1);      // turbulence valid
    mb = field(mb, 47, 2, 2);      // moderate
    mb = field(mb, 49, 1, 1);      // humidity valid
    mb = field(mb, 50, 6, 32);     // 50%
    const result = decodeCommB(Buffer.from(mb.toString(16).padStart(14, "0"), "hex"));
    expect(result?.weatherSourceQuality).toBe("GNSS");
    expect(result?.inferenceConfidence).toBe("high");
    expect(result?.values).toMatchObject({ turbulenceLevel: 2, humidityPct: 50, outsideAirTemperatureC: 30 });
    expect(result?.values.staticPressureHpa).toBeNull();
  });
});
