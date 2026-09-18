import { describe, expect, it, vi } from "vitest";
import { AviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { parseWeatherRadarCatalog, parseWeatherRadarFilename, WeatherRadarProvider } from "@/lib/server/weather-radar/provider";
import { buildWindGrid, isWindLevel, WindAloftProvider } from "@/lib/server/wind-aloft";

const NOW = Date.parse("2026-09-18T12:00:00.000Z");

describe("Map Context V1 providers", () => {
  it("strictly parses and bounds CHMI radar catalog filenames", () => {
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_max3d.20260918.1155.0.png", NOW)?.id).toBe("202609181155");
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_max3d.20261318.1155.0.png", NOW)).toBeNull();
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_max3d.20260918.1205.0.jpg", NOW)).toBeNull();
    const html = [
      '<a href="pacz2gmaps3.z_max3d.20260918.1100.0.png">old</a>',
      '<a href="pacz2gmaps3.z_max3d.20260918.1155.0.png">latest</a>',
      '<a href="other.txt">other</a>',
    ].join("\n");
    expect(parseWeatherRadarCatalog(html, NOW).map((frame) => frame.id)).toEqual(["202609181100", "202609181155"]);
  });

  it("validates CHMI PNG content and coalesces frame requests", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
    const provider = new WeatherRadarProvider(fetcher, () => NOW);
    const [first, second] = await Promise.all([provider.getFrame("202609181155"), provider.getFrame("202609181155")]);
    expect(first.length).toBe(9);
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(provider.getFrame("https://example.com/frame.png")).rejects.toThrow();
  });

  it("uses one AWC batch request for map METAR and preserves stale semantics", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{
      icaoId: "LKPR", reportTime: "2026-09-18T11:50:00Z", fltCat: "VFR", wdir: 260, wspd: 12, wgst: 21, visib: "10+", temp: 18, dewp: 11, altim: 1015, lat: 50.1, lon: 14.26, clouds: [{ cover: "SCT", base: 3500 }], rawOb: "LKPR 181150Z 26012G21KT 9999 SCT035 18/11 Q1015",
    }])));
    const provider = new AviationWeatherProvider({ fetcher, now: () => NOW, metarTtlMs: 300_000 });
    const result = await provider.getMetarMap([{ stationId: "LKPR", lat: 50.1, lon: 14.26 }, { stationId: "LKPR", lat: 50.1, lon: 14.26 }]);
    expect(result.observations).toMatchObject([{ stationId: "LKPR", flightCategory: "VFR", windDirection: 260, windSpeed: 12, windGust: 21, ceiling: 3500, stale: false }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("ids=LKPR");
  });

  it("bounds the ICON-EU grid and keeps meteorological FROM direction", async () => {
    expect(isWindLevel(300)).toBe(true);
    expect(isWindLevel(250)).toBe(false);
    expect(buildWindGrid().length).toBeLessThanOrEqual(100);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{
      latitude: 50, longitude: 14, model_run: "2026-09-18T09:00:00Z", hourly: {
        time: ["2026-09-18T12:00", "2026-09-18T13:00"], wind_speed_300hPa: [82, 84], wind_direction_300hPa: [270, 275],
      },
    }])));
    const provider = new WindAloftProvider(fetcher, () => NOW);
    const result = await provider.getWind(300, "2026-09-18T12:00:00Z");
    expect(result).toMatchObject({ model: "ICON-EU", levelHpa: 300, validAt: "2026-09-18T12:00", modelRun: "2026-09-18T09:00:00Z" });
    expect(result.points[0]).toMatchObject({ speedKt: 82, directionDeg: 270 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
