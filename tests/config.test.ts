import { afterEach, describe, expect, it, vi } from "vitest";
import { dayKey, DEFAULT_APP_TIMEZONE, getAppTimezone, getPublicReceiverPositionMode, getReceiverPosition } from "@/lib/server/config";
import { getAtcData } from "@/lib/server/providers";

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

  it("derives day keys in the configured local timezone", () => {
    expect(dayKey(new Date("2026-07-01T21:59:00Z"), "Europe/Prague")).toBe("2026-07-01");
    expect(dayKey(new Date("2026-07-01T22:01:00Z"), "Europe/Prague")).toBe("2026-07-02");
  });

  it("falls back safely when APP_TIMEZONE is missing or invalid", () => {
    vi.stubEnv("APP_TIMEZONE", " ");
    expect(getAppTimezone()).toBe(DEFAULT_APP_TIMEZONE);
    vi.stubEnv("APP_TIMEZONE", "not/a-timezone");
    expect(getAppTimezone()).toBe(DEFAULT_APP_TIMEZONE);
    expect(dayKey(new Date("2026-07-01T22:01:00Z"), "not/a-timezone")).toBe("2026-07-02");
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

  it.each(["exact", "approximate", "hidden"])("accepts public receiver mode %s", (mode) => {
    vi.stubEnv("PUBLIC_RECEIVER_POSITION_MODE", mode);
    expect(getPublicReceiverPositionMode()).toBe(mode);
  });

  it.each([undefined, "", "invalid", "EXACTLY"])("defaults invalid public receiver mode %j to approximate", (mode) => {
    vi.stubEnv("PUBLIC_RECEIVER_POSITION_MODE", mode ?? "");
    expect(getPublicReceiverPositionMode()).toBe("approximate");
  });

  it("does not leak demo ATC data for a real receiver without an imported database dataset", async () => {
    vi.stubEnv("READSB_BASE_URL", "http://receiver.example");
    vi.stubEnv("ATC_SAMPLE_ENABLED", "false");
    vi.stubEnv("DATABASE_URL", "");
    const data = await getAtcData();
    expect(data.sectors).toEqual([]);
    expect(data.transmitters).toEqual([]);
    expect(data.metadata.status).toBe("unavailable");
  });
});
