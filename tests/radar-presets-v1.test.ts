import { describe, expect, it } from "vitest";
import {
  RADAR_PRESETS_MAX,
  RADAR_PRESETS_STORAGE_KEY,
  addRadarPreset,
  createRadarPreset,
  parseRadarPresets,
  readRadarPresets,
  writeRadarPresets,
} from "@/lib/radar/presets";
import { DEFAULT_MAP_AIRCRAFT_FILTERS } from "@/lib/aircraft/map-filters";

function input(name = "PRG arrivals") {
  return {
    name,
    camera: { longitude: 14.26, latitude: 50.1, zoom: 9.2 },
    coverage: "local" as const,
    mapFilters: { ...DEFAULT_MAP_AIRCRAFT_FILTERS, source: "local" as const },
    layers: {
      showAircraft: true,
      showOgn: false,
      showAirports: true,
      showSignificantAirports: true,
      showSmallAirports: false,
      showHeliports: false,
      showAtc: true,
      showAtcTraffic: false,
      showAtsRoutes: false,
      showNavData: false,
      showSids: false,
      showStars: false,
      showSigmet: true,
      showWeatherRadar: true,
      showMetar: true,
      showWind: false,
      showAircraftWeather: false,
      showNavigationIntegrity: false,
      showAupUup: true,
      showRangeRings: true,
    },
    display: { colorMode: "altitude" as const, radarOpacity: 0.65, windLevel: 300 as const },
  };
}

describe("Radar Presets V1", () => {
  it("creates a versioned browser-local snapshot", () => {
    const preset = createRadarPreset(input(), new Date("2026-10-06T18:00:00Z"), "preset-1");
    expect(preset).toMatchObject({
      version: 1,
      id: "preset-1",
      name: "PRG arrivals",
      coverage: "local",
      camera: { longitude: 14.26, latitude: 50.1, zoom: 9.2 },
      mapFilters: { source: "local" },
    });
  });

  it("rejects malformed stored presets and caps the list", () => {
    const valid = Array.from({ length: RADAR_PRESETS_MAX + 3 }, (_, index) =>
      createRadarPreset(input("Preset " + index), new Date(1_700_000_000_000 + index), "p-" + index),
    );
    expect(parseRadarPresets([{ nope: true }, ...valid])).toHaveLength(RADAR_PRESETS_MAX);
  });

  it("reads and writes only the dedicated localStorage key", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
    const preset = createRadarPreset(input(), new Date("2026-10-06T18:00:00Z"), "preset-1");
    writeRadarPresets(storage, [preset]);
    expect(memory.has(RADAR_PRESETS_STORAGE_KEY)).toBe(true);
    expect(readRadarPresets(storage)).toEqual([preset]);
  });

  it("keeps newest presets first and bounded", () => {
    let presets = [] as ReturnType<typeof parseRadarPresets>;
    for (let index = 0; index < RADAR_PRESETS_MAX + 2; index += 1) {
      presets = addRadarPreset(presets, createRadarPreset(input("P" + index), new Date(index), "p" + index));
    }
    expect(presets).toHaveLength(RADAR_PRESETS_MAX);
    expect(presets[0]?.id).toBe("p9");
  });
});
