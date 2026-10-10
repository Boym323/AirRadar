/** NOAA SWPC observations are independent context, not ADS-B/Navigation Integrity evidence. */
const NOAA_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const TTL_MS = 30 * 60_000;
const STALE_MS = 2 * 60 * 60_000;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_ROWS = 200;

export interface SpaceWeatherRecord {
  observedAt: string;
  kp: number;
  stationCount: number | null;
}
export interface SpaceWeatherSnapshot {
  enabled: boolean;
  available: boolean;
  stale: boolean;
  provider: "NOAA SWPC";
  latest: SpaceWeatherRecord | null;
  maximum24h: number | null;
  geomagneticScale: "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "UNKNOWN";
  records24h: SpaceWeatherRecord[];
  fetchedAt: string | null;
  disclaimer: string;
}

export const SPACE_WEATHER_DISCLAIMER = "Global geomagnetic context only. Kp is not evidence of GNSS jamming, spoofing, a local navigation fault or a causal link to an AirRadar anomaly.";
export const isSpaceWeatherEnabled = (): boolean => process.env.SPACE_WEATHER_ENABLED?.trim().toLowerCase() === "true";

function validObservationTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z)?$/.test(value)) return null;
  const date = new Date(value.endsWith("Z") ? value : value + "Z");
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function kpToGScale(kp: number | null): SpaceWeatherSnapshot["geomagneticScale"] {
  if (kp === null || !Number.isFinite(kp) || kp < 0 || kp > 9) return "UNKNOWN";
  if (kp < 5) return "G0";
  if (kp < 6) return "G1";
  if (kp < 7) return "G2";
  if (kp < 8) return "G3";
  if (kp < 9) return "G4";
  return "G5";
}
export function normalizeNoaaKp(raw: unknown, now: number): Pick<SpaceWeatherSnapshot, "latest" | "maximum24h" | "geomagneticScale" | "records24h"> {
  const parsed: SpaceWeatherRecord[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw.slice(0, MAX_ROWS)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const obj = entry as Record<string, unknown>;
      const observedAt = validObservationTime(obj.time_tag);
      const kp = typeof obj.Kp === "number" ? obj.Kp : null;
      if (!observedAt || kp === null || !Number.isFinite(kp) || kp < 0 || kp > 9) continue;
      const ts = Date.parse(observedAt);
      if (ts > now + 5 * 60_000 || now - ts > 8 * 24 * 60 * 60_000) continue;
      const count = obj.station_count;
      parsed.push({ observedAt, kp, stationCount: typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 30 ? count : null });
    }
  }
  parsed.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const latest = parsed.at(-1) ?? null;
  const records24h = parsed.filter((row) => now - Date.parse(row.observedAt) <= 24 * 60 * 60_000).slice(-9);
  const maximum24h = records24h.length ? Math.max(...records24h.map((row) => row.kp)) : null;
  return { latest, maximum24h, geomagneticScale: kpToGScale(latest?.kp ?? null), records24h };
}

export class SpaceWeatherProvider {
  private cached: { value: SpaceWeatherSnapshot; createdAt: number } | null = null;
  private pending: Promise<SpaceWeatherSnapshot> | null = null;
  private lastFailureAt = 0;

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly clock: () => number = Date.now) {}

  async getCurrent(): Promise<SpaceWeatherSnapshot> {
    const now = this.clock();
    const unavailable: SpaceWeatherSnapshot = {
      enabled: isSpaceWeatherEnabled(), available: false, stale: false, provider: "NOAA SWPC",
      latest: null, maximum24h: null, geomagneticScale: "UNKNOWN", records24h: [], fetchedAt: null, disclaimer: SPACE_WEATHER_DISCLAIMER,
    };
    if (!isSpaceWeatherEnabled()) return unavailable;
    if (this.cached && now - this.cached.createdAt < TTL_MS) return this.cached.value;
    if (this.pending) return this.pending;
    if (this.lastFailureAt && now - this.lastFailureAt < 5 * 60_000) return this.cached ? { ...this.cached.value, stale: true } : unavailable;
    this.pending = (async () => {
      try {
        const response = await this.fetcher(NOAA_URL, { cache: "no-store", signal: AbortSignal.timeout(7_000), headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("NOAA unavailable");
        const declared = Number(response.headers.get("content-length") ?? 0);
        if (declared > MAX_BODY_BYTES) throw new Error("NOAA body exceeds size limit");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("NOAA empty response");
        const parts: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) throw new Error("NOAA body exceeds size limit");
            parts.push(value);
          }
        } finally { await reader.cancel().catch(() => undefined); }
        const buffer = new Uint8Array(size);
        let pos = 0;
        for (const part of parts) { buffer.set(part, pos); pos += part.length; }
        const parsed = normalizeNoaaKp(JSON.parse(new TextDecoder().decode(buffer)) as unknown, now);
        const age = parsed.latest ? now - Date.parse(parsed.latest.observedAt) : Number.POSITIVE_INFINITY;
        const value: SpaceWeatherSnapshot = {
          ...unavailable, available: parsed.latest !== null, stale: age > 6 * 60 * 60_000,
          ...parsed, fetchedAt: new Date(now).toISOString(),
        };
        this.cached = { value, createdAt: now };
        this.lastFailureAt = 0;
        return value;
      } catch {
        this.lastFailureAt = this.clock();
        if (this.cached && now - this.cached.createdAt < STALE_MS) return { ...this.cached.value, stale: true };
        return unavailable;
      } finally { this.pending = null; }
    })();
    return this.pending;
  }
}
const singleton = globalThis as typeof globalThis & { __airradarSpaceWeather?: SpaceWeatherProvider };
export const defaultSpaceWeatherProvider = singleton.__airradarSpaceWeather ??= new SpaceWeatherProvider();
