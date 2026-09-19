export const WEATHER_RADAR_BOUNDS = {
  west: 11.267,
  east: 20.77,
  south: 48.047,
  north: 52.167,
} as const;

export const WEATHER_RADAR_PROVIDER = "CHMI" as const;
export const WEATHER_RADAR_PRODUCT = "MAX_Z_MASKED" as const;
export const WEATHER_RADAR_SOURCE_URL = "https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png_masked/";
export const WEATHER_RADAR_CATALOG_TTL_MS = 60_000;
export const WEATHER_RADAR_HORIZON_MS = 2 * 60 * 60_000;
export const WEATHER_RADAR_MAX_FRAMES = 25;
export const WEATHER_RADAR_STALE_AFTER_MS = 18 * 60_000;

export interface WeatherRadarFrame {
  id: string;
  observedAt: string;
  provider: typeof WEATHER_RADAR_PROVIDER;
  product: typeof WEATHER_RADAR_PRODUCT;
  imageUrl: string;
  latest: boolean;
  stale: boolean;
}

export interface WeatherRadarCatalog {
  available: boolean;
  provider: typeof WEATHER_RADAR_PROVIDER;
  product: typeof WEATHER_RADAR_PRODUCT;
  frames: WeatherRadarFrame[];
  latestFrameId: string | null;
  bounds: typeof WEATHER_RADAR_BOUNDS;
  generatedAt: string;
}

export interface WeatherRadarDiagnostics {
  status: "disabled" | "online" | "degraded" | "offline";
  operationalState: "disabled" | "on_demand" | "loading" | "ok" | "degraded" | "offline";
  reasonCode: string | null;
  hasAttempted: boolean;
  inFlight: boolean;
  latestFrameId: string | null;
  latestObservedAt: string | null;
  catalogAgeMs: number | null;
  cachedFrames: number;
  failures: number;
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}
