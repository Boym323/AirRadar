import { describe, expect, it } from "vitest";
import { formatFiledAltitude, formatFiledAirspeed, formatFiledEte, formatRouteDistance, hasFiniteFlightPlanValue } from "@/components/aircraft-detail-v2";

describe("FlightAware flight-plan formatters", () => {
  it("formats filed altitude in flight levels when appropriate", () => {
    expect(formatFiledAltitude(350).replace(/\s/g, " ")).toBe("FL350 · 35 000 ft");
    expect(formatFiledAltitude(50).replace(/\s/g, " ")).toBe("5 000 ft");
  });

  it("formats filed airspeed and ETE", () => {
    expect(formatFiledAirspeed(456)).toBe("456 kt");
    expect(formatFiledEte(5340)).toBe("1 h 29 min");
  });

  it("formats route distance in statute and nautical miles", () => {
    expect(formatRouteDistance(604).replace(/\s/g, " ")).toBe("604 mi · 525 NM");
  });

  it("omits unavailable flight-plan values", () => {
    expect(hasFiniteFlightPlanValue(undefined)).toBe(false);
  });
});
