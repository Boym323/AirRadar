import { describe, expect, it } from "vitest";
import { addMultiAircraft, MULTI_AIRCRAFT_LIMIT, removeMultiAircraft } from "@/lib/radar/multi-aircraft";

describe("V6-A bounded live multi-aircraft selection", () => {
  it("normalizes ICAO, deduplicates, and rejects malformed identity", () => {
    expect(addMultiAircraft([], "a1b2c3")).toEqual(["A1B2C3"]);
    expect(addMultiAircraft(["A1B2C3"], "a1b2c3")).toEqual(["A1B2C3"]);
    expect(addMultiAircraft(["A1B2C3"], "flight-123")).toEqual(["A1B2C3"]);
  });
  it("never exceeds ten live pins", () => {
    const ten = Array.from({ length: MULTI_AIRCRAFT_LIMIT }, (_, i) => i.toString(16).toUpperCase().padStart(6, "0"));
    expect(addMultiAircraft(ten, "ABCDEF")).toEqual(ten);
  });
  it("can unpin any aircraft without changing the others", () => {
    expect(removeMultiAircraft(["A1B2C3", "001ABC"], "a1b2c3")).toEqual(["001ABC"]);
  });
});
