import { describe, expect, it, vi } from "vitest";
import { parseWeatherRadarCatalog, parseWeatherRadarFilename, WeatherRadarProvider } from "../lib/server/weather-radar/provider";

const now = Date.parse("2026-09-18T12:00:00.000Z");
const file = "pacz2gmaps3.z_cappi020.20260918.1155.0.png";
const maxFile = "pacz2gmaps3.z_max3d.20260918.1155.0.png";
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("ČHMÚ PseudoCAPPI radar product", () => {
  it("accepts only exact product filenames with valid UTC timestamps", () => {
    expect(parseWeatherRadarFilename(file, now, "PSEUDOCAPPI_2KM")?.id).toBe("202609181155");
    expect(parseWeatherRadarFilename(maxFile, now, "PSEUDOCAPPI_2KM")).toBeNull();
    expect(parseWeatherRadarFilename(file, now)).toBeNull();
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_cappi020.20261318.1155.0.png", now, "PSEUDOCAPPI_2KM")).toBeNull();
    expect(parseWeatherRadarCatalog('<a href="' + file + '">frame</a>', now, "PSEUDOCAPPI_2KM")).toHaveLength(1);
    expect(parseWeatherRadarCatalog('<a href="' + maxFile + '">frame</a>', now, "PSEUDOCAPPI_2KM")).toHaveLength(0);
  });
  it("uses the separate official CHMI path and never requests MAX-Z", async () => {
    const mock = vi.fn(async (url: string | URL | Request) => {
      const requested = String(url);
      if (requested.endsWith("/png/")) return new Response('<a href="' + file + '">frame</a>', { status: 200 });
      return new Response(png as BodyInit, { status: 200, headers: { "Content-Type": "image/png" } });
    });
    const fetcher = mock as unknown as typeof fetch;
    const provider = new WeatherRadarProvider(fetcher, () => now, "PSEUDOCAPPI_2KM");
    const catalog = await provider.getFrames();
    expect(catalog.available).toBe(true);
    expect(catalog.product).toBe("PSEUDOCAPPI_2KM");
    expect(catalog.frames[0]?.imageUrl).toBe("/api/weather/radar/frame/202609181155?product=PSEUDOCAPPI_2KM");
    expect(await provider.getFrame("202609181155")).toEqual(png);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls.map((args) => String(args[0])).every((url) => url.includes("/pseudocappi2km/png/"))).toBe(true);
  });
});
