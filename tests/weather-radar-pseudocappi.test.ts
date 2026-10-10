import { describe, expect, it, vi } from "vitest";
import { parseWeatherRadarFilename, parseWeatherRadarCatalog, WeatherRadarProvider } from "@/lib/server/weather-radar/provider";

const NOW = Date.parse("2026-10-10T20:15:00Z");
const FILENAME = "pacz2gmaps3.z_cappi020.20261010.2005.0.png";
const CATALOG = '<a href="' + FILENAME + '">data</a>';

describe("CHMI PseudoCAPPI product", () => {
  it("accepts only verified product-specific PNG names", () => {
    expect(parseWeatherRadarFilename(FILENAME, NOW)).toBeNull();
    expect(parseWeatherRadarFilename(FILENAME, NOW, "PSEUDOCAPPI_2KM")?.id).toBe("202610102005");
    expect(parseWeatherRadarCatalog(CATALOG, NOW, "PSEUDOCAPPI_2KM")).toHaveLength(1);
    expect(parseWeatherRadarFilename("pacz2gmaps3.z_cappi020.20991301.2005.0.png", NOW, "PSEUDOCAPPI_2KM")).toBeNull();
  });

  it("keeps separate catalog and frame URLs from existing MAX_Z", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith(".png")) {
        return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { "content-type": "image/png" } });
      }
      return new Response(CATALOG, { headers: { "content-type": "text/html" } });
    });
    const provider = new WeatherRadarProvider(fetcher as typeof fetch, () => NOW, "PSEUDOCAPPI_2KM");
    const catalog = await provider.getFrames();
    expect(catalog.product).toBe("PSEUDOCAPPI_2KM");
    expect(catalog.frames[0]?.imageUrl).toBe("/api/weather/radar/frame/202610102005?product=PSEUDOCAPPI_2KM");
    expect(await provider.getFrame("202610102005")).toHaveLength(8);
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://opendata.chmi.cz/meteorology/weather/radar/composite/pseudocappi2km/png/",
      "https://opendata.chmi.cz/meteorology/weather/radar/composite/pseudocappi2km/png/" + FILENAME,
    ]);
  });
});
