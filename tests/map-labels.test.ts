import { describe, expect, it } from "vitest";
import { aircraftMapLabel, aircraftMapLabelLevel, aircraftMapLabelLines, aircraftMapLabelText } from "@/lib/aircraft/map-labels";

const aircraft = {
  callsign: "CSA123",
  registration: "OK-ABC",
  icaoHex: "ABC123",
  altitude: 20_000,
  groundSpeed: 478,
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

  it("keeps map telemetry on a quieter second line at local zoom", () => {
    expect(aircraftMapLabelLines(aircraft, 9)).toEqual({ primary: "CSA123", secondary: "FL200" });
    expect(aircraftMapLabelLines(aircraft, 11)).toEqual({ primary: "CSA123", secondary: "FL200 · 478KT" });
    expect(aircraftMapLabelText(aircraft, 11)).toBe("CSA123\nFL200 · 478KT");
  });

  it("reduces stale traffic to identity without changing the LOD thresholds", () => {
    expect(aircraftMapLabelLines(aircraft, 11, { suppressTelemetry: true })).toEqual({ primary: "CSA123", secondary: null });
    expect(aircraftMapLabelLines(aircraft, 5)).toBeNull();
  });
});
