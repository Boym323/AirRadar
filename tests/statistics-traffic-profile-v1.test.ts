import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aggregateTrafficProfileRows } from "@/lib/server/statistics-traffic-profile";
import { parseTrafficProfileRange } from "@/lib/statistics-traffic-profile";

const server = readFileSync(new URL("../lib/server/statistics-traffic-profile.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/statistics/traffic-profile/route.ts", import.meta.url), "utf8");

describe("Traffic Profile V1 backend", () => {
  it("validates only bounded 7d/30d ranges", () => {
    expect(parseTrafficProfileRange("7d")).toBe("7d");
    expect(parseTrafficProfileRange("30d")).toBe("30d");
    expect(parseTrafficProfileRange("today")).toBeNull();
    expect(parseTrafficProfileRange("90d")).toBeNull();
    expect(route).toContain("status: 400");
  });

  it("fills all 24 hourly and 7 ISO-weekday buckets", () => {
    const result = aggregateTrafficProfileRows({
      range: "7d",
      now: new Date("2026-10-06T12:00:00.000Z"),
      timezone: "Europe/Prague",
      hourlyRows: [{ bucket: "3", count: "2" }, { bucket: "17", count: "5" }],
      weekdayRows: [{ bucket: "1", count: "3" }, { bucket: "2", count: "4" }],
    });
    expect(result.hourly).toHaveLength(24);
    expect(result.weekdays).toHaveLength(7);
    expect(result.hourly[3]).toEqual({ hour: 3, count: 2 });
    expect(result.weekdays[0]).toEqual({ weekday: 1, count: 3 });
    expect(result.observedFlights).toBe(7);
  });

  it("keeps aggregation DB-side, bounded and Flight-only", () => {
    expect(server).toContain("statisticsTrafficBounds");
    expect(server).toContain("database.sql.public.flight");
    expect(server).toContain("fields.startTime");
    expect(server).toContain("EXTRACT(HOUR");
    expect(server).toContain("EXTRACT(ISODOW");
    expect(server).toContain('.groupBy("bucket")');
    expect(server).not.toContain("sql.public.flightPosition");
    expect(server).not.toContain(".all()");
    expect(route).toContain('checkPublicRateLimit("statistics"');
  });
});
