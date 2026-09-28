import { describe, expect, it } from "vitest";
import { normalizeAircraftHex } from "@/app/api/weather/aircraft/observations/route";

describe("Aircraft Weather V1.1 latest-aircraft contract", () => {
  it("normalizes valid ICAO hex values and rejects malformed identifiers", () => {
    expect(normalizeAircraftHex("abcdef")).toBe("ABCDEF");
    expect(normalizeAircraftHex(" ABC123 ")).toBe("ABC123");
    expect(normalizeAircraftHex("abc12")).toBeUndefined();
    expect(normalizeAircraftHex("not-hex")).toBeUndefined();
  });
});
