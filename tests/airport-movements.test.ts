import { describe, expect, it } from "vitest";
import type { AirportRunway } from "@/lib/airports/infrastructure";
import { analyzeAirportMovement, type MovementFlight, type MovementPosition } from "@/lib/server/airport-movements";

const airport = { icaoCode: "LKPR", latitude: 50, longitude: 14, elevationFt: 1_200 };
const runways: AirportRunway[] = [{
  id: 1, airportId: 1, sourceAirportIdent: "LKPR", lengthFt: 10_000, widthFt: 150, surface: "ASP", lighted: true, closed: false,
  leIdent: "06", leLatitude: 50.001, leLongitude: 13.99, leElevationFt: 1_200, leHeadingDegT: 60, leDisplacedThresholdFt: null,
  heIdent: "24", heLatitude: 50.001, heLongitude: 14.01, heElevationFt: 1_200, heHeadingDegT: 240, heDisplacedThresholdFt: null,
}];

function positions(values: Array<[string, number, number, number | null, number | null, number | null, number | null]>): MovementPosition[] {
  return values.map(([recordedAt, lat, lon, altitude, groundSpeed, track, verticalRate]) => ({ recordedAt, lat, lon, altitude, groundSpeed, track, verticalRate }));
}

function flight(id: number, values: MovementPosition[]): MovementFlight {
  return { id, icaoHex: "abc123", callsign: "TEST123", registration: "OK-TEST", positions: values };
}

describe("airport movement intelligence", () => {
  it("recognises a descending final approach and a likely landing", () => {
    const result = analyzeAirportMovement(flight(1, positions([
      ["2026-09-12T08:00:00Z", 50.08, 14.3, 7_000, 190, 240, -500],
      ["2026-09-12T08:02:00Z", 50.03, 14.08, 3_000, 130, 240, -600],
      ["2026-09-12T08:04:00Z", 50.001, 14.01, 1_500, 80, 240, -300],
      ["2026-09-12T08:05:00Z", 50.001, 14.012, 1_250, 65, 240, -100],
    ])), airport, runways);
    expect(result).toMatchObject({ movement: "LANDING", airport: "LKPR", runway: { designator: "24" } });
    expect(result?.evidence.join(" ")).toContain("threshold geometry");
  });

  it("keeps an aborted approach as an approach inference, never a confirmed landing", () => {
    const result = analyzeAirportMovement(flight(2, positions([
      ["2026-09-12T08:00:00Z", 50.08, 14.3, 7_000, 190, 240, -500],
      ["2026-09-12T08:02:00Z", 50.03, 14.08, 3_000, 130, 240, -600],
      ["2026-09-12T08:04:00Z", 50.015, 14.03, 2_000, 140, 240, -200],
      ["2026-09-12T08:06:00Z", 50.04, 14.1, 3_500, 170, 60, 500],
    ])), airport, runways);
    expect(result?.movement).toBe("APPROACH");
    expect(result?.movement).not.toBe("LANDING");
    expect(result?.evidence.join(" ")).toContain("away");
  });

  it("recognises takeoff and acquired-after-liftoff departure", () => {
    const takeoff = analyzeAirportMovement(flight(3, positions([
      ["2026-09-12T09:00:00Z", 50.001, 14.01, 1_250, 50, 240, 100],
      ["2026-09-12T09:02:00Z", 49.99, 13.97, 2_500, 120, 240, 700],
      ["2026-09-12T09:04:00Z", 49.97, 13.92, 5_000, 180, 240, 800],
    ])), airport, runways);
    expect(takeoff).toMatchObject({ movement: "TAKEOFF", runway: { designator: "24" } });

    const departure = analyzeAirportMovement(flight(4, positions([
      ["2026-09-12T09:00:00Z", 50.01, 14.04, 3_500, 150, 240, 500],
      ["2026-09-12T09:02:00Z", 49.98, 13.98, 4_500, 190, 240, 700],
      ["2026-09-12T09:04:00Z", 49.95, 13.92, 7_000, 220, 240, 800],
    ])), airport, runways);
    expect(departure?.movement).toBe("DEPARTURE");
  });

  it("recognises a high-altitude pass and does not call it an approach", () => {
    const result = analyzeAirportMovement(flight(5, positions([
      ["2026-09-12T10:00:00Z", 50, 13.8, 22_000, 420, 90, 0],
      ["2026-09-12T10:02:00Z", 50, 14, 22_100, 420, 90, 0],
      ["2026-09-12T10:04:00Z", 50, 14.2, 22_000, 420, 90, 0],
    ])), airport, runways);
    expect(result?.movement).toBe("OVERFLIGHT");
    expect(result?.runway).toBeNull();
  });

  it("handles insufficient, stale/gappy, and ambiguous observations conservatively", () => {
    expect(analyzeAirportMovement(flight(6, positions([
      ["2026-09-12T10:00:00Z", 50, 14, 2_000, 100, 0, 0],
      ["2026-09-12T10:01:00Z", 50, 14.01, 2_000, 100, 0, 0],
    ])), airport, runways)).toBeNull();

    const gappy = analyzeAirportMovement(flight(7, positions([
      ["not-a-time", 50, 14, 2_000, 100, 0, 0],
      ["2026-09-12T10:01:00Z", 50, 14.01, 2_000, 100, 0, 0],
      ["2026-09-12T10:02:00Z", 50, 14.02, 2_000, 100, 0, 0],
    ])), airport, runways);
    expect(gappy).toBeNull();

    const parallel = runways.concat({ ...runways[0], id: 2, leIdent: "06L", heIdent: "24L", leLongitude: 13.991, heLongitude: 14.011 });
    const result = analyzeAirportMovement(flight(8, positions([
      ["2026-09-12T11:00:00Z", 50.08, 14.3, 7_000, 190, 240, -500],
      ["2026-09-12T11:02:00Z", 50.03, 14.08, 3_000, 130, 240, -600],
      ["2026-09-12T11:04:00Z", 50.001, 14.0105, 1_500, 80, 240, -300],
    ])), airport, parallel);
    expect(result?.runway).toBeNull();
  });

  it("wraps reciprocal headings correctly", () => {
    const wrapRunway = { ...runways[0], leIdent: "36", heIdent: "18", leHeadingDegT: 359, heHeadingDegT: 179, leLongitude: 13.99, heLongitude: 14.01 };
    const result = analyzeAirportMovement(flight(9, positions([
      ["2026-09-12T12:00:00Z", 49.9, 14.01, 7_000, 190, 1, -500],
      ["2026-09-12T12:02:00Z", 49.96, 14.01, 3_000, 130, 359, -600],
      ["2026-09-12T12:04:00Z", 49.999, 14.01, 1_500, 80, 1, -300],
    ])), airport, [wrapRunway]);
    expect(result?.runway?.designator).toBe("36");
  });
});
