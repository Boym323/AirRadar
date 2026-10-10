import { describe, it, expect, vi } from "vitest";
import { AladinWindProvider, parseAladinWind, compareModelWinds, circularDirectionDifference } from "@/lib/server/aladin-wind";

const NOW = Date.parse("2026-10-10T12:30:00Z");
const payload = { hourly: { time: ["2026-10-10T12:00"], wind_speed_300hPa: [74], wind_direction_300hPa: [355] } };

describe("ALADIN versus ICON-EU (diagnostic only)", () => {
  it("validates ALADIN model wind and circular direction delta", () => {
    expect(parseAladinWind(payload, 300, NOW)).toMatchObject({ model: "ALADIN-CE-2KM", speedKt: 74, directionDeg: 355 });
    expect(parseAladinWind({ hourly: { time: ["2026-10-10T12:00"], wind_speed_300hPa: [-50], wind_direction_300hPa: [355] } }, 300, NOW)).toBeNull();
    expect(circularDirectionDifference(355, 5)).toBe(10);
  });
  it("does not compare model outputs with different valid times", () => {
    const a = { model: "ALADIN-CE-2KM" as const, provider: "CHMI / Open-Meteo" as const, speedKt: 74, directionDeg: 355, validAt: "2026-10-10T12:00:00Z" };
    const b = { model: "ICON-EU" as const, provider: "DWD / Open-Meteo" as const, speedKt: 60, directionDeg: 5, validAt: "2026-10-10T14:00:00Z" };
    expect(compareModelWinds(a, b, { lat: 49.2, lon: 17.6 }, 300).reason).toBe("VALID_TIME_MISMATCH");
    expect(compareModelWinds(a, { ...b, validAt: a.validAt }, { lat: 49.2, lon: 17.6 }, 300).directionDifferenceDeg).toBe(10);
  });
  it("fetches only on demand and coalesces in-flight calls", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL) => Response.json(payload));
    const provider = new AladinWindProvider(fetcher as typeof fetch, () => NOW);
    const [first, second] = await Promise.all([provider.getWind(300, 49.2, 17.6), provider.getWind(300, 49.2, 17.6)]);
    expect(first.sample?.speedKt).toBe(74);
    expect(second.sample?.speedKt).toBe(74);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("chmi_aladin_central_europe_2km");
  });
});
