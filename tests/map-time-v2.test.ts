import { describe, expect, it } from "vitest";
import { MapTimeController, contextResolutionBucket } from "@/lib/map-time/controller";
import { resolveIntervalContains, resolveNearestBefore, resolveNearestValid } from "@/lib/map-time/temporal";

describe("Global Map Time", () => {
  it("normalizes UTC instants and publishes one master clock", () => {
    const controller = new MapTimeController({ mode: "LIVE", currentTime: "2026-09-18T11:00:00+00:00" });
    const states: string[] = [];
    controller.subscribe((state) => states.push(`${state.mode}:${state.currentTime}`));
    controller.seek("2026-09-18T13:35:00+02:00");
    controller.setLive(new Date("2026-09-19T00:00:00Z"));
    expect(states).toEqual(["LIVE:2026-09-18T11:00:00.000Z", "HISTORICAL:2026-09-18T11:35:00.000Z", "LIVE:2026-09-19T00:00:00.000Z"]);
  });

  it("resolves observed data without future leakage", () => {
    const records = [{ at: "2026-09-18T13:30:00Z" }, { at: "2026-09-18T13:40:00Z" }];
    expect(resolveNearestBefore(records, "2026-09-18T13:35:00Z").record?.at).toBe("2026-09-18T13:30:00Z");
    expect(resolveNearestBefore(records, "2026-09-18T13:29:00Z").record).toBeNull();
    expect(resolveNearestValid(records, "2026-09-18T13:35:00Z", 5 * 60_000).resolution.match).toBe("NEAREST_VALID");
  });

  it("resolves planned intervals and bounded playback buckets", () => {
    const result = resolveIntervalContains([{ validFrom: "2026-09-18T12:00:00Z", validTo: "2026-09-18T16:00:00Z" }], "2026-09-18T13:35:00Z");
    expect(result.resolution.match).toBe("INTERVAL_CONTAINS");
    expect(resolveIntervalContains([{ validFrom: "2026-09-18T12:00:00Z", validTo: "2026-09-18T16:00:00Z" }], "2026-09-18T16:00:00Z").record).toBeNull();
    expect(contextResolutionBucket("2026-09-18T13:35:59Z", 5 * 60_000)).toBe(contextResolutionBucket("2026-09-18T13:39:59Z", 5 * 60_000));
  });
});
