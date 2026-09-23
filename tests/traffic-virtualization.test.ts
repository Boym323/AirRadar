import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_TRAFFIC_ROW_HEIGHT,
  AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD,
  aircraftTrafficVirtualRange,
} from "@/lib/radar/traffic-virtualization";

describe("aircraft traffic virtualization", () => {
  it("keeps small traffic lists fully mounted", () => {
    expect(aircraftTrafficVirtualRange({
      count: AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD - 1,
      rootTop: 100,
      rootBottom: 600,
      spaceTop: 300,
    })).toEqual({ start: 0, end: AIRCRAFT_TRAFFIC_VIRTUALIZATION_THRESHOLD - 1 });
  });

  it("renders only a bounded window around the visible rows", () => {
    const range = aircraftTrafficVirtualRange({
      count: 250,
      rootTop: 100,
      rootBottom: 720,
      spaceTop: -3_000,
    });
    expect(range.start).toBeGreaterThan(0);
    expect(range.end).toBeLessThan(250);
    expect(range.end - range.start).toBeLessThan(40);
  });

  it("keeps overscan bounded at the beginning and end", () => {
    expect(aircraftTrafficVirtualRange({
      count: 100,
      rootTop: 0,
      rootBottom: AIRCRAFT_TRAFFIC_ROW_HEIGHT * 5,
      spaceTop: 0,
    }).start).toBe(0);

    const totalHeight = 100 * AIRCRAFT_TRAFFIC_ROW_HEIGHT;
    expect(aircraftTrafficVirtualRange({
      count: 100,
      rootTop: 0,
      rootBottom: AIRCRAFT_TRAFFIC_ROW_HEIGHT * 5,
      spaceTop: -(totalHeight - AIRCRAFT_TRAFFIC_ROW_HEIGHT * 5),
    }).end).toBe(100);
  });

  it("mounts no rows while the virtual space is outside the scroll viewport", () => {
    expect(aircraftTrafficVirtualRange({
      count: 100,
      rootTop: 0,
      rootBottom: 500,
      spaceTop: 700,
    })).toEqual({ start: 0, end: 0 });
  });
});
