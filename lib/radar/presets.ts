import type { CoverageMode } from "@/lib/aircraft/types";
import type { AircraftColorMode } from "@/lib/aircraft/color-mode";
import {
  DEFAULT_MAP_AIRCRAFT_FILTERS,
  type MapAircraftFilters,
} from "@/lib/aircraft/map-filters";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";

export const RADAR_PRESETS_STORAGE_KEY = "airradar.radar-presets.v1";
export const RADAR_PRESETS_MAX = 8;

export interface RadarPresetLayers {
  showAircraft: boolean;
  showOgn: boolean;
  showAirports: boolean;
  showSignificantAirports: boolean;
  showSmallAirports: boolean;
  showHeliports: boolean;
  showAtc: boolean;
  showAtcTraffic: boolean;
  showAtsRoutes: boolean;
  showNavData: boolean;
  showSids: boolean;
  showStars: boolean;
  showSigmet: boolean;
  showWeatherRadar: boolean;
  showMetar: boolean;
  showWind: boolean;
  showAircraftWeather: boolean;
  showNavigationIntegrity: boolean;
  showAupUup: boolean;
  showRangeRings: boolean;
}

export interface RadarPreset {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  camera: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  coverage: CoverageMode;
  mapFilters: MapAircraftFilters;
  layers: RadarPresetLayers;
  display: {
    colorMode: AircraftColorMode;
    radarOpacity: number;
    windLevel: WindLevelHpa;
  };
}

export interface RadarPresetInput {
  name: string;
  camera: RadarPreset["camera"];
  coverage: CoverageMode;
  mapFilters: MapAircraftFilters;
  layers: RadarPresetLayers;
  display: RadarPreset["display"];
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function validCoverage(value: unknown): value is CoverageMode {
  return value === "local" || value === "extended";
}

function validColorMode(value: unknown): value is AircraftColorMode {
  return value === "default" || value === "altitude" || value === "speed" || value === "verticalRate";
}

function validWindLevel(value: unknown): value is WindLevelHpa {
  return value === 850 || value === 700 || value === 500 || value === 300 || value === 200;
}

function validMapFilters(value: unknown): value is MapAircraftFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const filters = value as Record<string, unknown>;
  return ["source", "quick", "status", "minAltitude", "maxAltitude", "callsign", "registration", "icaoHex", "aircraftType", "operator"]
    .every((key) => typeof filters[key] === "string")
    && typeof filters.emergencyOnly === "boolean";
}

function validLayers(value: unknown): value is RadarPresetLayers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const layers = value as Record<string, unknown>;
  return [
    "showAircraft", "showOgn", "showAirports", "showSignificantAirports", "showSmallAirports", "showHeliports",
    "showAtc", "showAtcTraffic", "showAtsRoutes", "showNavData", "showSids", "showStars", "showSigmet",
    "showWeatherRadar", "showMetar", "showWind", "showAircraftWeather", "showNavigationIntegrity", "showAupUup",
    "showRangeRings",
  ].every((key) => boolean(layers[key]));
}

export function parseRadarPreset(value: unknown): RadarPreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const preset = value as Record<string, unknown>;
  const camera = preset.camera;
  const display = preset.display;
  if (
    preset.version !== 1
    || typeof preset.id !== "string"
    || !preset.id.trim()
    || typeof preset.name !== "string"
    || !preset.name.trim()
    || typeof preset.createdAt !== "string"
    || !camera || typeof camera !== "object" || Array.isArray(camera)
    || !display || typeof display !== "object" || Array.isArray(display)
    || !validCoverage(preset.coverage)
    || !validMapFilters(preset.mapFilters)
    || !validLayers(preset.layers)
  ) return null;

  const cameraValue = camera as Record<string, unknown>;
  const displayValue = display as Record<string, unknown>;
  if (
    !finite(cameraValue.longitude) || cameraValue.longitude < -180 || cameraValue.longitude > 180
    || !finite(cameraValue.latitude) || cameraValue.latitude < -90 || cameraValue.latitude > 90
    || !finite(cameraValue.zoom) || cameraValue.zoom < 0 || cameraValue.zoom > 24
    || !validColorMode(displayValue.colorMode)
    || !finite(displayValue.radarOpacity) || displayValue.radarOpacity < 0.2 || displayValue.radarOpacity > 1
    || !validWindLevel(displayValue.windLevel)
  ) return null;

  return {
    version: 1,
    id: preset.id,
    name: preset.name.trim().slice(0, 60),
    createdAt: preset.createdAt,
    camera: {
      longitude: cameraValue.longitude,
      latitude: cameraValue.latitude,
      zoom: cameraValue.zoom,
    },
    coverage: preset.coverage,
    mapFilters: { ...DEFAULT_MAP_AIRCRAFT_FILTERS, ...preset.mapFilters },
    layers: preset.layers,
    display: {
      colorMode: displayValue.colorMode,
      radarOpacity: displayValue.radarOpacity,
      windLevel: displayValue.windLevel,
    },
  };
}

export function parseRadarPresets(value: unknown): RadarPreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = parseRadarPreset(item);
    return parsed ? [parsed] : [];
  }).slice(0, RADAR_PRESETS_MAX);
}

export function readRadarPresets(storage: Pick<Storage, "getItem">): RadarPreset[] {
  try {
    const raw = storage.getItem(RADAR_PRESETS_STORAGE_KEY);
    return raw ? parseRadarPresets(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeRadarPresets(storage: Pick<Storage, "setItem">, presets: readonly RadarPreset[]): void {
  try {
    storage.setItem(RADAR_PRESETS_STORAGE_KEY, JSON.stringify(presets.slice(0, RADAR_PRESETS_MAX)));
  } catch {
    // Browser storage is optional.
  }
}

export function createRadarPreset(input: RadarPresetInput, now = new Date(), id?: string): RadarPreset {
  const name = input.name.trim().slice(0, 60) || "Preset";
  return {
    version: 1,
    id: id ?? `preset-${now.getTime()}`,
    name,
    createdAt: now.toISOString(),
    camera: input.camera,
    coverage: input.coverage,
    mapFilters: { ...input.mapFilters },
    layers: { ...input.layers },
    display: { ...input.display },
  };
}

export function addRadarPreset(presets: readonly RadarPreset[], preset: RadarPreset): RadarPreset[] {
  return [preset, ...presets.filter((item) => item.id !== preset.id)].slice(0, RADAR_PRESETS_MAX);
}
