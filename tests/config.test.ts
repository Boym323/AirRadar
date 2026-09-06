import { afterEach, describe, expect, it, vi } from "vitest";
import { getReceiverPosition } from "@/lib/server/config";

afterEach(() => vi.unstubAllEnvs());

describe("numeric environment configuration", () => {
  it.each(["", "   ", "not-a-number"])('uses the coordinate fallback for %j', (value) => {
    vi.stubEnv("RECEIVER_LAT", value);
    vi.stubEnv("RECEIVER_LON", value);
    expect(getReceiverPosition()).toMatchObject({ lat: 50.0755, lon: 14.4378 });
  });

  it("keeps explicit zero coordinates", () => {
    vi.stubEnv("RECEIVER_LAT", "0");
    vi.stubEnv("RECEIVER_LON", "0");
    expect(getReceiverPosition()).toMatchObject({ lat: 0, lon: 0 });
  });

  it.each([
    ["90.1", "14", 50.0755, 14],
    ["-90.1", "14", 50.0755, 14],
    ["50", "180.1", 50, 14.4378],
    ["50", "-180.1", 50, 14.4378],
  ])("rejects coordinates outside their valid range: %s, %s", (lat, lon, expectedLat, expectedLon) => {
    vi.stubEnv("RECEIVER_LAT", lat);
    vi.stubEnv("RECEIVER_LON", lon);
    expect(getReceiverPosition()).toMatchObject({ lat: expectedLat, lon: expectedLon });
  });
});
