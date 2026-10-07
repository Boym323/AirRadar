import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  busiestHour,
  busiestWeekday,
  quietestHour,
} from "@/components/traffic-rhythm-metrics";

const page = readFileSync(new URL("../components/traffic-rhythm.tsx", import.meta.url), "utf8");

describe("Traffic Rhythm Analytics V1 UI", () => {
  it("derives busiest and quietest buckets including real zero-count quiet hours", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 17 ? 12 : hour === 3 ? 0 : 2 }));
    expect(busiestHour(hours)).toEqual({ hour: 17, count: 12 });
    expect(quietestHour(hours)).toEqual({ hour: 3, count: 0 });
    expect(busiestHour(hours.map((item) => ({ ...item, count: 0 })))).toBeNull();
  });

  it("derives the busiest ISO weekday", () => {
    expect(busiestWeekday([
      { weekday: 1, count: 2 },
      { weekday: 2, count: 9 },
      { weekday: 3, count: 4 },
    ])).toEqual({ weekday: 2, count: 9 });
  });

  it("renders both bounded ranges, zero-data and charts", () => {
    expect(page).toContain("TRAFFIC_PROFILE_RANGES");
    expect(page).toContain("/api/statistics/traffic-profile?range=");
    expect(page).toContain("zeroData");
    expect(page).toContain("data.hourly.map");
    expect(page).toContain("data.weekdays.map");
    expect(page).toContain("Flight.startTime");
  });
});
