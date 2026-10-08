import { describe, expect, it } from "vitest";
import { stableAltitudeProfile } from "@/lib/radar/altitude-profile";

const at = (minute: number, altitude: number | null) => ({
  recordedAt: new Date(Date.UTC(2026, 9, 8, 8, minute)).toISOString(),
  altitude,
});

describe("radar quick-detail altitude profile", () => {
  it("compresses sustained level flight at FL370", () => {
    expect(stableAltitudeProfile([at(0, 37_000), at(2, 37_000), at(5, 37_000), at(7, 37_000)]))
      .toEqual({ altitudeFt: 37_000, samples: 4 });
  });

  it("tolerates minor altitude fluctuations and uses the newest reading", () => {
    expect(stableAltitudeProfile([at(0, 37_000), at(2, 37_040), at(4, 36_980)], at(6, 37_020)))
      .toEqual({ altitudeFt: 37_020, samples: 4 });
  });

  it("preserves the chart for climbs or descents", () => {
    expect(stableAltitudeProfile([at(0, 36_700), at(2, 36_900), at(5, 37_000)])).toBeNull();
  });

  it("preserves the chart when samples are too sparse or span too little time", () => {
    expect(stableAltitudeProfile([at(0, 37_000), at(1, 37_000)])).toBeNull();
    expect(stableAltitudeProfile([
      { recordedAt: "2026-10-08T08:00:00Z", altitude: 37_000 },
      { recordedAt: "2026-10-08T08:00:40Z", altitude: 37_000 },
      { recordedAt: "2026-10-08T08:01:00Z", altitude: 37_000 },
    ])).toBeNull();
  });

  it("ignores invalid samples and deduplicates matching timestamps", () => {
    expect(stableAltitudeProfile([
      at(0, 37_000), at(0, 37_000), at(3, 37_000),
      { recordedAt: "invalid", altitude: 37_000 }, at(6, null),
    ])).toBeNull();
  });

  it("limits stability to the most recent 30-minute window", () => {
    expect(stableAltitudeProfile([
      at(0, 33_000), at(31, 37_000), at(34, 37_000), at(37, 37_000),
    ])).toEqual({ altitudeFt: 37_000, samples: 3 });
  });
});
