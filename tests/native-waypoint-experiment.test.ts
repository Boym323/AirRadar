import { describe, expect, it } from "vitest";
import { waypointWindowMatches } from "@/lib/operational-twin/native-waypoint-experiment";

const native = process.env.AIRRADAR_NATIVE_BEAST === "1";
describe.skipIf(!native)("Operational Twin Rust waypoint numeric parity", () => {
  it("matches TS for deterministic random windows and invalid coordinates", () => {
    let state = 0x11223344;
    const rand = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let batch = 0; batch < 500; batch += 1) {
      const lat = rand() * 150 - 75;
      const lon = rand() * 340 - 170;
      const points = new Float64Array(240);
      for (let j = 0; j < points.length; j += 2) {
        points[j] = lat + (rand() - 0.5) * 4;
        points[j + 1] = lon + (rand() - 0.5) * 4;
      }
      if (batch % 10 === 0) points[0] = Number.NaN;
      expect(waypointWindowMatches(points, lat, lon, true)).toEqual(waypointWindowMatches(points, lat, lon, false));
    }
  });
  it("preserves empty and invalid input handling", () => {
    expect(waypointWindowMatches(new Float64Array(), 50, 14, true)).toEqual(new Uint8Array());
    expect(() => waypointWindowMatches(new Float64Array(3), 50, 14, true)).toThrow(RangeError);
  });
});
