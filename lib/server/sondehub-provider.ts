import { getAirRadarUserAgent } from "@/lib/server/user-agent";

const BASE = "https://api.v2.sondehub.org";
const SNAPSHOT_TTL_MS = 20 * 60_000;
const DETAIL_TTL_MS = 15 * 60_000;
const MAX_AGE_MS = 2 * 60 * 60_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_SONDES = 100;
const MAX_TRAIL = 120;
const SERIAL_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

export interface SondePoint {
  serial: string;
  model: string | null;
  lat: number;
  lon: number;
  altitudeM: number;
  observedAt: string;
  verticalSpeedMs: number | null;
  temperatureC: number | null;
  frequencyMhz: number | null;
}

export interface SondeLanding {
  lat: number;
  lon: number;
  altitudeM: number;
  predictedAt: string | null;
}

export interface SondeSnapshot {
  enabled: boolean;
  available: boolean;
  stale: boolean;
  source: "SondeHub";
  fetchedAt: string | null;
  sondes: SondePoint[];
}

export interface SondeDetail {
  serial: string;
  track: Array<{ lat: number; lon: number; altitudeM: number; observedAt: string }>;
  landing: SondeLanding | null;
  predictionSource: "SondeHub / Tawhiri" | null;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
function coordinates(value: Record<string, unknown>): { lat: number; lon: number; alt: number } | null {
  const lat = number(value.lat ?? value.latitude);
  const originalLon = number(value.lon ?? value.longitude);
  const alt = number(value.alt ?? value.altitude);
  if (lat === null || originalLon === null || alt === null || Math.abs(lat) > 90 || originalLon < -180 || originalLon > 360 || alt < -500 || alt > 60_000) return null;
  return { lat, lon: originalLon > 180 ? originalLon - 360 : originalLon, alt };
}
function date(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function boundedText(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= limit ? value : null;
}
function latestRecord(value: unknown): Record<string, unknown> | null {
  const direct = asObject(value);
  if (!direct) return null;
  if ("lat" in direct && "lon" in direct) return direct;
  const entries = Object.values(direct).map(asObject).filter((v): v is Record<string, unknown> => v !== null);
  return entries.sort((a, b) => Date.parse(String(b.datetime)) - Date.parse(String(a.datetime)))[0] ?? null;
}
function distanceKm(a: number, b: number, c: number, d: number): number {
  const rad = Math.PI / 180;
  const h = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Normalize only allowlisted SondeHub fields. Never forward upstream payloads. */
export function normalizeLatestSondes(raw: unknown, lat: number, lon: number, radiusKm: number, now: number): SondePoint[] {
  const root = asObject(raw);
  if (!root) return [];
  const points: SondePoint[] = [];
  for (const [id, value] of Object.entries(root).slice(0, 2_000)) {
    const item = latestRecord(value);
    const serial = boundedText(item?.serial, 40) ?? id;
    if (!SERIAL_RE.test(serial) || !item) continue;
    const coords = coordinates(item);
    const observedAt = date(item.datetime);
    if (!coords || !observedAt || Math.abs(now - Date.parse(observedAt)) > MAX_AGE_MS || distanceKm(lat, lon, coords.lat, coords.lon) > radiusKm) continue;
    points.push({
      serial,
      model: boundedText(item.type, 40),
      lat: coords.lat,
      lon: coords.lon,
      altitudeM: coords.alt,
      observedAt,
      verticalSpeedMs: number(item.vel_v),
      temperatureC: number(item.temp),
      frequencyMhz: number(item.frequency),
    });
  }
  points.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  return points.slice(0, MAX_SONDES);
}

/** Descent endpoint is a MODEL prediction, never the measured landing point. */
export function extractLandingPrediction(raw: unknown, serial: string, now: number): SondeLanding | null {
  if (!Array.isArray(raw)) return null;
  for (const candidate of raw.slice(0, 16)) {
    const item = asObject(candidate);
    if (!item || item.vehicle !== serial) continue;
    const timestamp = date(item.time);
    if (!timestamp || Math.abs(now - Date.parse(timestamp)) > 2 * 60 * 60_000) continue;
    if (typeof item.data !== "string" || item.data.length > 300_000) continue;
    let decoded: unknown;
    try { decoded = JSON.parse(item.data); } catch { continue; }
    const prediction = asObject(decoded)?.prediction;
    if (!Array.isArray(prediction)) continue;
    const descent = prediction.map(asObject).find((stage) => stage?.stage === "descent");
    if (!descent || !Array.isArray(descent.trajectory) || descent.trajectory.length === 0) continue;
    const last = asObject(descent.trajectory[descent.trajectory.length - 1]);
    if (!last) continue;
    const coords = coordinates(last);
    if (!coords || coords.alt > 1_000) continue;
    return { lat: coords.lat, lon: coords.lon, altitudeM: coords.alt, predictedAt: date(last.datetime) };
  }
  return null;
}

export function normalizeSondeTrack(raw: unknown, serial: string, now: number): SondeDetail["track"] {
  if (!Array.isArray(raw)) return [];
  const points: SondeDetail["track"] = [];
  for (const candidate of raw.slice(0, 10_000)) {
    const item = asObject(candidate);
    if (!item || item.serial !== serial) continue;
    const coords = coordinates(item);
    const observedAt = date(item.datetime);
    if (!coords || !observedAt || Math.abs(now - Date.parse(observedAt)) > 12 * 60 * 60_000) continue;
    points.push({ lat: coords.lat, lon: coords.lon, altitudeM: coords.alt, observedAt });
  }
  points.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const step = Math.max(1, Math.ceil(points.length / MAX_TRAIL));
  return points.filter((_, index) => index % step === 0 || index === points.length - 1).slice(-MAX_TRAIL);
}

export function isSondeHubEnabled(): boolean {
  return process.env.SONDEHUB_ENABLED?.trim().toLowerCase() === "true";
}

async function readBoundedJson(fetcher: typeof fetch, url: URL, now: number, onLimit: () => void): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "User-Agent": getAirRadarUserAgent("sondehub") },
  });
  if (response.status === 429) onLimit();
  if (!response.ok || !response.body) throw new Error("SondeHub unavailable");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error("SondeHub payload over limit");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("SondeHub payload over limit");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(data)) as unknown;
}

export class SondeHubProvider {
  private readonly snapshots = new Map<string, { value: SondeSnapshot; expires: number }>();
  private readonly details = new Map<string, { value: SondeDetail; expires: number }>();
  private readonly pending = new Map<string, Promise<SondeSnapshot>>();
  private blockedUntil = 0;
  private lastAttemptAt = 0;
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly clock: () => number = Date.now) {}
  private backoff(): void { this.blockedUntil = this.clock() + 15 * 60_000; }

  async getSnapshot(lat: number, lon: number, radiusKm: number): Promise<SondeSnapshot> {
    const unavailable: SondeSnapshot = { enabled: isSondeHubEnabled(), available: false, stale: false, source: "SondeHub", fetchedAt: null, sondes: [] };
    if (!isSondeHubEnabled()) return unavailable;
    const key = [lat.toFixed(1), lon.toFixed(1), radiusKm].join(":");
    const now = this.clock();
    const cached = this.snapshots.get(key);
    if (cached && cached.expires > now) return cached.value;
    if (now < this.blockedUntil || now - this.lastAttemptAt < 60_000) return cached ? { ...cached.value, stale: true } : unavailable;
    const existing = this.pending.get(key);
    if (existing) return existing;
    this.lastAttemptAt = now;
    const task = (async () => {
      try {
        const url = new URL(BASE + "/sondes");
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lon", String(lon));
        url.searchParams.set("distance", String(Math.round(radiusKm * 1_000)));
        url.searchParams.set("last", "7200");
        const raw = await readBoundedJson(this.fetcher, url, now, () => this.backoff());
        const value: SondeSnapshot = { ...unavailable, available: true, fetchedAt: new Date(now).toISOString(), sondes: normalizeLatestSondes(raw, lat, lon, radiusKm, now) };
        this.snapshots.delete(key);
        this.snapshots.set(key, { value, expires: now + SNAPSHOT_TTL_MS });
        while (this.snapshots.size > 6) this.snapshots.delete(this.snapshots.keys().next().value!);
        return value;
      } catch {
        return cached ? { ...cached.value, stale: true } : unavailable;
      } finally { this.pending.delete(key); }
    })();
    this.pending.set(key, task);
    return task;
  }

  async getDetail(serial: string): Promise<SondeDetail | null> {
    if (!isSondeHubEnabled() || !SERIAL_RE.test(serial)) return null;
    const now = this.clock();
    const cached = this.details.get(serial);
    if (cached && cached.expires > now) return cached.value;
    if (now < this.blockedUntil) return cached?.value ?? null;
    const tracksUrl = new URL(BASE + "/sonde/" + encodeURIComponent(serial));
    const predictionUrl = new URL(BASE + "/predictions");
    predictionUrl.searchParams.set("vehicles", serial);
    const [trackResult, predictionResult] = await Promise.allSettled([
      readBoundedJson(this.fetcher, tracksUrl, now, () => this.backoff()),
      readBoundedJson(this.fetcher, predictionUrl, now, () => this.backoff()),
    ]);
    if (trackResult.status !== "fulfilled" && predictionResult.status !== "fulfilled") return cached?.value ?? null;
    const landing = predictionResult.status === "fulfilled" ? extractLandingPrediction(predictionResult.value, serial, now) : null;
    const value: SondeDetail = {
      serial,
      track: trackResult.status === "fulfilled" ? normalizeSondeTrack(trackResult.value, serial, now) : [],
      landing,
      predictionSource: landing ? "SondeHub / Tawhiri" : null,
    };
    this.details.delete(serial);
    this.details.set(serial, { value, expires: now + DETAIL_TTL_MS });
    while (this.details.size > 24) this.details.delete(this.details.keys().next().value!);
    return value;
  }
}

const globalSonde = globalThis as typeof globalThis & { __airradarSondeHub?: SondeHubProvider };
export const defaultSondeHubProvider = globalSonde.__airradarSondeHub ??= new SondeHubProvider();
