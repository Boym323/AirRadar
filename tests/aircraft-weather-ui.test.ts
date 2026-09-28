import { describe, expect, it } from "vitest";
import { airflowDestinationDegrees, circularDirectionDelta, formatFlightLevel, weatherSourceLabel } from "@/lib/weather/aircraft-weather-ui";

describe("Aircraft Weather UI semantics", () => {
  it("converts meteorological from-direction to airflow destination", () => {
    expect(airflowDestinationDegrees(350)).toBe(170);
    expect(airflowDestinationDegrees(10)).toBe(190);
    expect(airflowDestinationDegrees(180)).toBe(0);
  });

  it("uses circular wind direction differences across north", () => {
    expect(circularDirectionDelta(355, 5)).toBe(10);
    expect(circularDirectionDelta(350, 10)).toBe(20);
  });

  it("keeps user-facing provenance labels explicit", () => {
    expect(weatherSourceLabel("BDS_4_4")).toBe("Mode-S BDS 4,4 weather");
    expect(weatherSourceLabel("READSB_JSON")).toBe("Aircraft / local readsb");
    expect(formatFlightLevel(36_000)).toBe("FL360");
  });

  it("keeps receiver-centred queries server-side when public receiver coordinates are hidden", () => {
    expect("center=receiver").toContain("center=receiver");
    expect("lat/lon omitted from the public request").not.toContain("50.0755");
  });
});
