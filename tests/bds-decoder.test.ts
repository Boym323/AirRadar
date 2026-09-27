import { describe, expect, it } from "vitest";
import { decodeCommB } from "@/lib/server/bds-decoder";

describe("Comm-B BDS decoder", () => {
  it("decodes the published BDS 4,0 example", () => {
    // DF20 example A8001EBCAEE57730A80106DE1344; MB is bytes 5..11.
    const result = decodeCommB(Buffer.from("aee57730a80106", "hex"));
    expect(result).toMatchObject({ register: "BDS4,0", confidence: "high" });
    expect(result?.values).toMatchObject({ selectedAltitudeMcpFt: 24000, selectedAltitudeFmsFt: 24000, navQnhHpa: 1013.2 });
  });

  it("rejects status/value violations instead of manufacturing telemetry", () => {
    expect(decodeCommB(Buffer.from("00000000000000", "hex"))).toBeNull();
  });
});
