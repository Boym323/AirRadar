import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyTerminalGroundTruth, type TerminalTrackSample } from "@/lib/predictive-intelligence/terminal-ground-truth";

const airport = { icaoCode: "TEST", iataCode: null, name: "Test", city: null, country: null, latitude: 50, longitude: 14, elevationFt: 1_000 };
const runway = { id: 1, airportId: 1, sourceAirportIdent: "TEST", lengthFt: 8_000, widthFt: 150, surface: "ASP", lighted: true, closed: false, leIdent: "09", leLatitude: 50, leLongitude: 13.98, leElevationFt: 1_000, leHeadingDegT: 90, leDisplacedThresholdFt: null, heIdent: "27", heLatitude: 50, heLongitude: 14.02, heElevationFt: 1_000, heHeadingDegT: 270, heDisplacedThresholdFt: null };
function track(values: Array<[number, number, number, number, number]>): TerminalTrackSample[] {
  return values.map(([lon, altitudeFt, speed, trackDeg, verticalRateFpm], index) => ({ recordedAt: new Date(Date.parse("2026-10-02T00:00:00Z") + index * 30_000).toISOString(), lat: 50, lon, altitudeFt, groundSpeedKt: speed, trackDeg, verticalRateFpm }));
}

describe("terminal ground truth", () => {
  it("stays outside the predictive intelligence input graph", () => {
    const source = readFileSync(fileURLToPath(new URL("../lib/predictive-intelligence/terminal-ground-truth.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/predictive-intelligence\/(engine|config|state|calibration)/);
    expect(source).not.toMatch(/weather|airport-operations|predictive runway|predictive confidence|hysteresis|ETA/);
  });

  it("confirms a covered runway approach without using prediction inputs", () => {
    const result = classifyTerminalGroundTruth({ airports: [airport], runwaysByAirport: new Map([["TEST", [runway]]]), positions: track([
      [14.08, 4_000, 150, 270, -700], [14.05, 2_500, 135, 270, -600], [14.03, 1_500, 110, 270, -400], [14.02, 1_100, 95, 270, -200], [14.01, 1_020, 75, 270, -50], [14.005, 1_010, 65, 270, 0],
    ]) });
    expect(result.status).toBe("CONFIRMED");
    expect(result.airportIcao).toBe("TEST");
    expect(result.runwayStatus).toBe("CONFIRMED");
    expect(result.runway).toBe("27");
  });

  it("does not equate a high receiver-loss endpoint with landing", () => {
    const result = classifyTerminalGroundTruth({ airports: [airport], positions: track([
      [14.08, 8_000, 180, 270, -700], [14.06, 7_000, 170, 270, -600], [14.04, 6_000, 160, 270, -500], [14.03, 5_500, 150, 270, -300], [14.025, 5_200, 145, 270, -100],
    ]) });
    expect(result.status).not.toBe("CONFIRMED");
    expect(result.landingAt).toBeNull();
  });

  it("uses an exact on-ground transition when supplied", () => {
    const positions = track([
      [14.08, 4_000, 150, 270, -700], [14.05, 2_500, 135, 270, -600], [14.03, 1_500, 110, 270, -400], [14.02, 1_100, 95, 270, -200], [14.01, 1_020, 75, 270, -50], [14.005, 1_010, 65, 270, 0],
    ]);
    positions[4]!.onGround = true;
    const result = classifyTerminalGroundTruth({ airports: [airport], runwaysByAirport: new Map([["TEST", [runway]]]), positions });
    expect(result.landingAt).toBe(positions[4]!.recordedAt);
    expect(result.uncertaintySeconds).toBeGreaterThan(0);
  });
});
