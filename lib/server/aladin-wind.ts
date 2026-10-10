import { getReceiverPosition } from "@/lib/server/config";
import { defaultWindAloftProvider, isWindLevel, type WindLevelHpa } from "@/lib/server/wind-aloft";

const API_URL = "https://api.open-meteo.com/v1/forecast";
const MODEL = "chmi_aladin_central_europe_2km";
const CACHE_MS = 30 * 60_000;
const STALE_MS = 2 * 60 * 60_000;
const MAX_BYTES = 128 * 1024;

export interface ModelWindSample {
  model: "ALADIN-CE-2KM" | "ICON-EU";
  provider: "CHMI / Open-Meteo" | "DWD / Open-Meteo";
  validAt: string;
  speedKt: number;
  directionDeg: number;
}
export interface WindModelComparison {
  available: boolean;
  stale: boolean;
  location: { lat: number; lon: number };
  levelHpa: WindLevelHpa;
  aladin: ModelWindSample | null;
  icon: ModelWindSample | null;
  speedDifferenceKt: number | null;
  directionDifferenceDeg: number | null;
  reason: string | null;
  notice: string;
}

export function circularDirectionDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}
export function compareModelWinds(
  aladin: ModelWindSample | null,
  icon: ModelWindSample | null,
  location: { lat: number; lon: number },
  levelHpa: WindLevelHpa,
  stale = false,
): WindModelComparison {
  const aligned = Boolean(aladin && icon && Math.abs(Date.parse(aladin.validAt) - Date.parse(icon.validAt)) <= 60 * 60_000);
  return {
    available: Boolean(aladin || icon),
    stale,
    location,
    levelHpa,
    aladin,
    icon,
    speedDifferenceKt: aligned && aladin && icon ? Math.round((aladin.speedKt - icon.speedKt) * 10) / 10 : null,
    directionDifferenceDeg: aligned && aladin && icon ? Math.round(circularDirectionDifference(aladin.directionDeg, icon.directionDeg)) : null,
    reason: !aladin ? "ALADIN_UNAVAILABLE" : !icon ? "ICON_UNAVAILABLE" : !aligned ? "VALID_TIME_MISMATCH" : null,
    notice: "Model-to-model comparison only; not a measured aircraft wind or a forecast skill score",
  };
}

function validNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function timestamp(s: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
}
export function parseAladinWind(raw: unknown, level: WindLevelHpa, now: number): ModelWindSample | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const hourly = (raw as Record<string, unknown>).hourly;
  if (!hourly || typeof hourly !== "object" || Array.isArray(hourly)) return null;
  const item = hourly as Record<string, unknown>;
  const times = item.time;
  const speeds = item[`wind_speed_${level}hPa`];
  const directions = item[`wind_direction_${level}hPa`];
  if (!Array.isArray(times) || !Array.isArray(speeds) || !Array.isArray(directions)) return null;
  let best: { index: number; distance: number } | null = null;
  for (let i = 0; i < Math.min(times.length, 100); i++) {
    if (typeof times[i] !== "string") continue;
    const when = timestamp(times[i] as string);
    if (!Number.isFinite(when) || Math.abs(now - when) > 6 * 60 * 60_000) continue;
    const speed = validNumber(speeds[i], 0, 250);
    const direction = validNumber(directions[i], 0, 360);
    if (speed === null || direction === null) continue;
    const distance = Math.abs(now - when);
    if (!best || distance < best.distance) best = { index: i, distance };
  }
  if (!best) return null;
  const i = best.index;
  return {
    model: "ALADIN-CE-2KM",
    provider: "CHMI / Open-Meteo",
    validAt: new Date(timestamp(times[i] as string)).toISOString(),
    speedKt: speeds[i] as number,
    directionDeg: directions[i] as number,
  };
}

export class AladinWindProvider {
  private cache: { sample: ModelWindSample; level: WindLevelHpa; fetchedAt: number; lat: number; lon: number } | null = null;
  private inFlight: { key: string; promise: Promise<ModelWindSample | null> } | null = null;
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly clock: () => number = Date.now) {}
  async getWind(level: WindLevelHpa, lat: number, lon: number): Promise<{ sample: ModelWindSample | null; stale: boolean }> {
    const now = this.clock();
    const cached = this.cache;
    if (cached && cached.level === level && cached.lat === lat && cached.lon === lon && now - cached.fetchedAt < CACHE_MS) {
      return { sample: cached.sample, stale: false };
    }
    const key = `${level}:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    if (this.inFlight?.key === key) return { sample: await this.inFlight.promise, stale: false };
    const run = (async () => {
      const url = new URL(API_URL);
      url.searchParams.set("latitude", lat.toFixed(4));
      url.searchParams.set("longitude", lon.toFixed(4));
      url.searchParams.set("hourly", `wind_speed_${level}hPa,wind_direction_${level}hPa`);
      url.searchParams.set("wind_speed_unit", "kn");
      url.searchParams.set("timezone", "UTC");
      url.searchParams.set("forecast_days", "3");
      url.searchParams.set("models", MODEL);
      const response = await this.fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
      if (!response.ok || !response.headers.get("content-type")?.includes("json")) throw new Error("ALADIN unavailable");
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > MAX_BYTES) throw new Error("ALADIN oversized");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("ALADIN missing body");
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_BYTES) throw new Error("ALADIN oversized");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const combined = new Uint8Array(total);
      let pos = 0;
      for (const chunk of chunks) { combined.set(chunk, pos); pos += chunk.length; }
      const parsed = parseAladinWind(JSON.parse(new TextDecoder().decode(combined)) as unknown, level, this.clock());
      if (!parsed) throw new Error("ALADIN has no valid wind sample");
      this.cache = { sample: parsed, level, fetchedAt: this.clock(), lat, lon };
      return parsed;
    })();
    this.inFlight = { key, promise: run };
    try { return { sample: await run, stale: false }; }
    catch {
      if (cached && cached.level === level && cached.lat === lat && cached.lon === lon && now - cached.fetchedAt <= STALE_MS) return { sample: cached.sample, stale: true };
      return { sample: null, stale: false };
    } finally { if (this.inFlight?.promise === run) this.inFlight = null; }
  }
}

export const defaultAladinWindProvider = new AladinWindProvider();

export async function getWindModelComparison(level: WindLevelHpa): Promise<WindModelComparison> {
  if (!isWindLevel(level)) throw new Error("Invalid level");
  const { lat, lon } = getReceiverPosition();
  const [aladinResult, iconResult] = await Promise.all([
    defaultAladinWindProvider.getWind(level, lat, lon),
    defaultWindAloftProvider.getWind(level).catch(() => null),
  ]);
  const iconPoints = iconResult?.points.filter((point) => point.speedKt !== null && point.directionDeg !== null) ?? [];
  const nearest = [...iconPoints].sort((a, b) =>
    Math.hypot(a.lat - lat, a.lon - lon) - Math.hypot(b.lat - lat, b.lon - lon))[0];
  const iconSample: ModelWindSample | null = nearest?.speedKt !== null && nearest?.speedKt !== undefined && nearest.directionDeg !== null && nearest.directionDeg !== undefined && iconResult
    ? { model: "ICON-EU", provider: "DWD / Open-Meteo", validAt: iconResult.validAt.endsWith("Z") ? iconResult.validAt : iconResult.validAt + "Z", speedKt: nearest.speedKt, directionDeg: nearest.directionDeg }
    : null;
  return compareModelWinds(aladinResult.sample, iconSample, { lat, lon }, level, aladinResult.stale || Boolean(iconResult?.stale));
}
