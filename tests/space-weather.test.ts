import { afterEach, describe, expect, it, vi } from "vitest";
import { kpToGScale, normalizeNoaaKp, SpaceWeatherProvider } from "../lib/server/space-weather";

const now = Date.parse("2026-10-10T18:00:00Z");
const row = (time_tag: string, Kp: number) => ({ time_tag, Kp, a_running: 9, station_count: 8 });

afterEach(() => { delete process.env.SPACE_WEATHER_ENABLED; });

describe("NOAA planetary Kp safety context", () => {
  it("accepts March-2026 NOAA object-array format and last 24h, not old header arrays", () => {
    const out = normalizeNoaaKp([row("2026-10-10T12:00:00", 4.67), row("2026-10-10T15:00:00", 7), { time_tag: "bad", Kp: 8 }, row("2026-10-08T15:00:00", 8)], now);
    expect(out.latest?.kp).toBe(7);
    expect(out.maximum24h).toBe(7);
    expect(out.geomagneticScale).toBe("G3");
    expect(out.records24h).toHaveLength(2);
    expect(normalizeNoaaKp([["time_tag", "Kp"], ["bad", 7]], now).latest).toBeNull();
  });
  it("grades global Kp without inferring aircraft or GNSS faults", () => {
    expect([4.9, 5, 6, 7, 8, 9].map(kpToGScale)).toEqual(["G0", "G1", "G2", "G3", "G4", "G5"]);
  });
  it("remains opt-in and caches repeated requests for 30 minutes", async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify([row("2026-10-10T15:00:00", 7)])));
    const provider = new SpaceWeatherProvider(mock as unknown as typeof fetch, () => now);
    expect((await provider.getCurrent()).enabled).toBe(false);
    expect(mock).not.toHaveBeenCalled();
    process.env.SPACE_WEATHER_ENABLED = "true";
    const first = await provider.getCurrent();
    expect(first.latest?.kp).toBe(7);
    expect(first.disclaimer).toContain("not evidence of GNSS");
    expect((await provider.getCurrent()).latest?.kp).toBe(7);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
