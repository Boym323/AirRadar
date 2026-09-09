import { describe, expect, it } from "vitest";
import { aircraftMapLabel, aircraftMapLabelLevel } from "@/lib/aircraft/map-labels";

const aircraft = {
  callsign: "CSA123",
  registration: "OK-ABC",
  icaoHex: "ABC123",
  altitude: 20_000,
  aircraftType: "A320",
  enrichment: undefined,
};

describe("aircraft map labels", () => {
  it("progresses label detail without rendering at wide zoom", () => {
    expect(aircraftMapLabelLevel(5)).toBe("hidden");
    expect(aircraftMapLabelLevel(7)).toBe("callsign");
    expect(aircraftMapLabelLevel(9)).toBe("callsignAltitude");
    expect(aircraftMapLabelLevel(11)).toBe("callsignAltitudeType");
    expect(aircraftMapLabel(aircraft, 5, "20 000 ft")).toBeNull();
    expect(aircraftMapLabel(aircraft, 7, "20 000 ft")).toBe("CSA123");
    expect(aircraftMapLabel(aircraft, 9, "20 000 ft")).toBe("CSA123 · 20 000 ft");
    expect(aircraftMapLabel(aircraft, 11, "20 000 ft")).toBe("CSA123 · 20 000 ft · A320");
  });

  it("uses stable identity fallback when callsign is absent", () => {
    expect(aircraftMapLabel({ ...aircraft, callsign: null, registration: null }, 7, "—")).toBe("ABC123");
  });
});
