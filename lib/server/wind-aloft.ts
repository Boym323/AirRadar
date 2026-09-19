export const WIND_LEVELS_HPA = [850, 700, 500, 300, 200] as const;
export type WindLevelHpa = (typeof WIND_LEVELS_HPA)[number];

export const WIND_GRID = {
  west: 11,
  east: 20.75,
  south: 47.5,
  north: 52.5,
  step: 0.75,
  maxPoints: 100,
} as const;

const API_URL = "https://api.open-meteo.com/v1/dwd-icon";
const CACHE_TTL_MS = 30 * 60_000;
const STALE_IF_ERROR_MS = 3 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MODEL = "ICON-EU" as const;

export interface WindAloftPoint {
  lat: number;
  lon: number;
  speedKt: number | null;
  directionDeg: number | null;
}

export interface WindAloftResponse {
  provider: "DWD / Open-Meteo";
  model: typeof MODEL;
  modelRun: string | null;
  validAt: string;
  availableValidTimes: string[];
  levelHpa: WindLevelHpa;
  points: WindAloftPoint[];
  fetchedAt: string;
  stale: boolean;
}

interface RawHourly { time?: unknown; [key: string]: unknown; }
interface RawPoint { hourly?: RawHourly; model_run?: unknown; }
interface Snapshot { points: RawPoint[]; validTimes: string[]; fetchedAt: number; modelRun: string | null; }

function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function forecastTimestamp(value: string): number {
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}
function indexedValue(hourly: RawHourly, key: string, index: number): unknown {
  const values = hourly[key];
  return Array.isArray(values) ? values[index] : null;
}

export function isWindLevel(value: unknown): value is WindLevelHpa {
  return typeof value === "number" && (WIND_LEVELS_HPA as readonly number[]).includes(value);
}

export function buildWindGrid(): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  for (let lat = WIND_GRID.south; lat <= WIND_GRID.north + 1e-9; lat += WIND_GRID.step) {
    for (let lon = WIND_GRID.west; lon <= WIND_GRID.east + 1e-9; lon += WIND_GRID.step) points.push({ lat: Number(lat.toFixed(3)), lon: Number(lon.toFixed(3)) });
  }
  return points.slice(0, WIND_GRID.maxPoints);
}

function nearestValidTime(times: string[], requested: string | null, now: number): string | null {
  const valid = times.filter((value) => Number.isFinite(forecastTimestamp(value)));
  if (!valid.length) return null;
  const target = requested && Number.isFinite(Date.parse(requested)) ? Date.parse(requested) : now;
  return valid.sort((left, right) => Math.abs(forecastTimestamp(left) - target) - Math.abs(forecastTimestamp(right) - target) || forecastTimestamp(left) - forecastTimestamp(right))[0];
}

export class WindAloftProvider {
  private snapshot: Snapshot | null = null;
  private inFlight: Promise<Snapshot> | null = null;
  private hasAttempted = false;
  private attempts = 0;
  private lastAttemptAt: string | null = null;
  private lastFailureAt: string | null = null;
  private consecutiveFailures = 0;

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly clock: () => number = Date.now) {}

  async getWind(level: WindLevelHpa, requestedValidAt: string | null = null): Promise<WindAloftResponse> {
    const snapshot = await this.getSnapshot();
    const validAt = nearestValidTime(snapshot.validTimes, requestedValidAt, this.clock());
    if (!validAt) throw new Error("Wind forecast has no valid times");
    const timeIndex = snapshot.validTimes.indexOf(validAt);
    const points = snapshot.points.flatMap((point) => {
      const hourly = point.hourly;
      if (!hourly || !Array.isArray(hourly.time)) return [];
      const speed = finite(indexedValue(hourly, `wind_speed_${level}hPa`, timeIndex));
      const direction = finite(indexedValue(hourly, `wind_direction_${level}hPa`, timeIndex));
      const lat = finite((point as RawPoint & { latitude?: unknown }).latitude);
      const lon = finite((point as RawPoint & { longitude?: unknown }).longitude);
      return lat === null || lon === null ? [] : [{ lat, lon, speedKt: speed, directionDeg: direction }];
    });
    return { provider: "DWD / Open-Meteo", model: MODEL, modelRun: snapshot.modelRun, validAt, availableValidTimes: snapshot.validTimes.slice(0, 96), levelHpa: level, points, fetchedAt: new Date(snapshot.fetchedAt).toISOString(), stale: this.clock() - snapshot.fetchedAt > CACHE_TTL_MS };
  }

  diagnostics(): { status: "online" | "degraded" | "offline"; operationalState: "on_demand" | "loading" | "ok" | "degraded" | "offline"; reasonCode: string | null; model: string; modelRun: string | null; validTimes: number; cacheEntries: number; lastSuccessAt: string | null; hasAttempted: boolean; inFlight: boolean; attempts: number; lastAttemptAt: string | null; lastFailureAt: string | null; consecutiveFailures: number } {
    const stale = this.snapshot !== null && this.clock() - this.snapshot.fetchedAt > CACHE_TTL_MS;
    const operationalState = !this.hasAttempted ? "on_demand" : this.inFlight !== null ? "loading" : this.snapshot ? (stale || this.consecutiveFailures ? "degraded" : "ok") : "offline";
    return { status: this.snapshot ? (stale || this.consecutiveFailures ? "degraded" : "online") : "offline", operationalState, reasonCode: operationalState === "on_demand" ? "NOT_INITIALIZED" : operationalState === "loading" ? "FIRST_LOAD_PENDING" : operationalState === "degraded" ? (this.snapshot ? "STALE_CACHE" : "LAST_REFRESH_FAILED") : operationalState === "offline" ? "UPSTREAM_UNAVAILABLE" : null, model: MODEL, modelRun: this.snapshot?.modelRun ?? null, validTimes: this.snapshot?.validTimes.length ?? 0, cacheEntries: this.snapshot ? 1 : 0, lastSuccessAt: this.snapshot ? new Date(this.snapshot.fetchedAt).toISOString() : null, hasAttempted: this.hasAttempted, inFlight: this.inFlight !== null, attempts: this.attempts, lastAttemptAt: this.lastAttemptAt, lastFailureAt: this.lastFailureAt, consecutiveFailures: this.consecutiveFailures };
  }

  private async getSnapshot(): Promise<Snapshot> {
    const now = this.clock();
    if (this.snapshot && now - this.snapshot.fetchedAt < CACHE_TTL_MS) return this.snapshot;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.loadSnapshot().catch((error) => {
      if (this.snapshot && now - this.snapshot.fetchedAt < STALE_IF_ERROR_MS) return this.snapshot;
      throw error;
    }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async loadSnapshot(): Promise<Snapshot> {
    this.hasAttempted = true;
    this.attempts += 1;
    this.lastAttemptAt = new Date(this.clock()).toISOString();
    const grid = buildWindGrid();
    const url = new URL(API_URL);
    url.searchParams.set("latitude", grid.map((point) => point.lat).join(","));
    url.searchParams.set("longitude", grid.map((point) => point.lon).join(","));
    url.searchParams.set("models", "icon_eu");
    url.searchParams.set("hourly", WIND_LEVELS_HPA.flatMap((level) => [`wind_speed_${level}hPa`, `wind_direction_${level}hPa`]).join(","));
    url.searchParams.set("wind_speed_unit", "kn");
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("forecast_days", "3");
    try {
    const response = await this.fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Wind provider HTTP ${response.status}`);
    const payload = await response.json() as RawPoint | RawPoint[];
    const points = Array.isArray(payload) ? payload : [payload];
    const firstTimes = points[0]?.hourly?.time;
    if (!Array.isArray(firstTimes) || firstTimes.length === 0 || firstTimes.some((value) => typeof value !== "string")) throw new Error("Wind provider returned no hourly times");
    const snapshot: Snapshot = { points, validTimes: firstTimes as string[], fetchedAt: this.clock(), modelRun: points.map((point) => point.model_run).find((value): value is string => typeof value === "string") ?? null };
    this.snapshot = snapshot;
    this.consecutiveFailures = 0;
    return snapshot;
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastFailureAt = new Date(this.clock()).toISOString();
      throw error;
    }
  }
}

export const defaultWindAloftProvider = new WindAloftProvider();
