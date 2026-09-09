import { describe, expect, it } from "vitest";
import { aircraftColor, AIRCRAFT_COLOR_FALLBACK } from "@/lib/aircraft/color-mode";

describe("aircraft map color modes", () => {
  const aircraft = { altitude: 20_000, groundSpeed: 300, verticalRate: 1_000 };

  it("keeps default mode neutral and maps populated values", () => {
    expect(aircraftColor(aircraft, "default")).toBeNull();
    expect(aircraftColor(aircraft, "altitude")).not.toBe(AIRCRAFT_COLOR_FALLBACK);
    expect(aircraftColor(aircraft, "speed")).not.toBe(AIRCRAFT_COLOR_FALLBACK);
    expect(aircraftColor(aircraft, "verticalRate")).not.toBe(AIRCRAFT_COLOR_FALLBACK);
  });

  it("uses the same visible fallback for missing mode data", () => {
    expect(aircraftColor({ altitude: null, groundSpeed: null, verticalRate: null }, "altitude")).toBe(AIRCRAFT_COLOR_FALLBACK);
    expect(aircraftColor({ altitude: null, groundSpeed: null, verticalRate: null }, "speed")).toBe(AIRCRAFT_COLOR_FALLBACK);
    expect(aircraftColor({ altitude: null, groundSpeed: null, verticalRate: null }, "verticalRate")).toBe(AIRCRAFT_COLOR_FALLBACK);
  });
});
