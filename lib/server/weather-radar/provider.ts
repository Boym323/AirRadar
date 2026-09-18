import {
  WEATHER_RADAR_BOUNDS,
  WEATHER_RADAR_CATALOG_TTL_MS,
  WEATHER_RADAR_HORIZON_MS,
  WEATHER_RADAR_MAX_FRAMES,
  WEATHER_RADAR_PRODUCT,
  WEATHER_RADAR_PROVIDER,
  WEATHER_RADAR_SOURCE_URL,
  WEATHER_RADAR_STALE_AFTER_MS,
  type WeatherRadarCatalog,
  type WeatherRadarDiagnostics,
  type WeatherRadarFrame,
} from "./types";

const FILE_PATTERN = /^pacz2gmaps3\.z_max3d\.(\d{8})\.(\d{4})\.0\.png$/i;
const FRAME_ID_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const MAX_PNG_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const FUTURE_TOLERANCE_MS = 10 * 60_000;

export interface ParsedRadarFrame {
  id: string;
  observedAt: string;
  filename: string;
}

function validDate(year: number, month: number, day: number, hour: number, minute: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && date.getUTCHours() === hour && date.getUTCMinutes() === minute ? date : null;
}

export function parseWeatherRadarFilename(filename: string, now = Date.now()): ParsedRadarFrame | null {
  const match = filename.match(FILE_PATTERN);
  if (!match) return null;
  const date = validDate(Number(match[1].slice(0, 4)), Number(match[1].slice(4, 6)), Number(match[1].slice(6, 8)), Number(match[2].slice(0, 2)), Number(match[2].slice(2, 4)));
  if (!date || date.getTime() > now + FUTURE_TOLERANCE_MS) return null;
  const id = `${match[1]}${match[2]}`;
  return { id, observedAt: date.toISOString(), filename };
}

export function parseWeatherRadarCatalog(html: string, now = Date.now()): ParsedRadarFrame[] {
  const found = new Map<string, ParsedRadarFrame>();
  const hrefPattern = /(?:href|src)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    const filename = match[1].split("/").pop() ?? "";
    const parsed = parseWeatherRadarFilename(filename, now);
    if (parsed) found.set(parsed.id, parsed);
  }
  return [...found.values()]
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
    .filter((frame) => Date.parse(frame.observedAt) >= now - WEATHER_RADAR_HORIZON_MS)
    .slice(-WEATHER_RADAR_MAX_FRAMES);
}

function frameIdDate(id: string): Date | null {
  const match = id.match(FRAME_ID_PATTERN);
  return match ? validDate(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])) : null;
}

export function isValidWeatherRadarFrameId(id: string, now = Date.now()): boolean {
  const date = frameIdDate(id);
  return date !== null && date.getTime() <= now + FUTURE_TOLERANCE_MS;
}

function filenameForFrameId(id: string): string {
  if (!isValidWeatherRadarFrameId(id)) throw new Error("Invalid weather radar frame id");
  return `pacz2gmaps3.z_max3d.${id.slice(0, 8)}.${id.slice(8, 12)}.0.png`;
}

function frameFromParsed(parsed: ParsedRadarFrame, latestId: string | null, now: number): WeatherRadarFrame {
  return {
    id: parsed.id,
    observedAt: parsed.observedAt,
    provider: WEATHER_RADAR_PROVIDER,
    product: WEATHER_RADAR_PRODUCT,
    imageUrl: `/api/weather/radar/frame/${parsed.id}`,
    latest: parsed.id === latestId,
    stale: now - Date.parse(parsed.observedAt) > WEATHER_RADAR_STALE_AFTER_MS,
  };
}

interface CachedCatalog { value: WeatherRadarCatalog; fetchedAt: number; }
interface CachedFrame { value: Uint8Array; fetchedAt: number; }

export class WeatherRadarProvider {
  private catalog: CachedCatalog | null = null;
  private readonly frames = new Map<string, CachedFrame>();
  private catalogInFlight: Promise<WeatherRadarCatalog> | null = null;
  private readonly frameInFlight = new Map<string, Promise<Uint8Array>>();
  private failures = 0;
  private lastSuccessAt: string | null = null;

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly clock: () => number = Date.now) {}

  async getFrames(): Promise<WeatherRadarCatalog> {
    const now = this.clock();
    if (this.catalog && now - this.catalog.fetchedAt < WEATHER_RADAR_CATALOG_TTL_MS) return this.catalog.value;
    if (this.catalogInFlight) return this.catalogInFlight;
    this.catalogInFlight = this.loadCatalog(now).finally(() => { this.catalogInFlight = null; });
    return this.catalogInFlight;
  }

  async getFrame(id: string): Promise<Uint8Array> {
    if (!isValidWeatherRadarFrameId(id, this.clock())) throw new Error("Invalid weather radar frame id");
    const cached = this.frames.get(id);
    if (cached) return cached.value;
    const existing = this.frameInFlight.get(id);
    if (existing) return existing;
    const request = this.loadFrame(id).finally(() => this.frameInFlight.delete(id));
    this.frameInFlight.set(id, request);
    return request;
  }

  getDiagnostics(): WeatherRadarDiagnostics {
    const catalog = this.catalog?.value;
    const now = this.clock();
    return {
      status: catalog ? (this.failures ? "degraded" : "online") : this.failures ? "offline" : "disabled",
      latestFrameId: catalog?.latestFrameId ?? null,
      latestObservedAt: catalog?.frames.at(-1)?.observedAt ?? null,
      catalogAgeMs: this.catalog ? Math.max(0, now - this.catalog.fetchedAt) : null,
      cachedFrames: this.frames.size,
      failures: this.failures,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  private async loadCatalog(now: number): Promise<WeatherRadarCatalog> {
    try {
      const response = await this.fetcher(WEATHER_RADAR_SOURCE_URL, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`CHMI catalog HTTP ${response.status}`);
      const html = await response.text();
      const parsed = parseWeatherRadarCatalog(html, now);
      const latestId = parsed.at(-1)?.id ?? null;
      const value: WeatherRadarCatalog = {
        available: parsed.length > 0,
        provider: WEATHER_RADAR_PROVIDER,
        product: WEATHER_RADAR_PRODUCT,
        frames: parsed.map((frame) => frameFromParsed(frame, latestId, now)),
        latestFrameId: latestId,
        bounds: WEATHER_RADAR_BOUNDS,
        generatedAt: new Date(now).toISOString(),
      };
      this.catalog = { value, fetchedAt: now };
      this.lastSuccessAt = new Date(now).toISOString();
      return value;
    } catch {
      this.failures += 1;
      if (this.catalog) return this.catalog.value;
      return { available: false, provider: WEATHER_RADAR_PROVIDER, product: WEATHER_RADAR_PRODUCT, frames: [], latestFrameId: null, bounds: WEATHER_RADAR_BOUNDS, generatedAt: new Date(now).toISOString() };
    }
  }

  private async loadFrame(id: string): Promise<Uint8Array> {
    try {
      const filename = filenameForFrameId(id);
      const response = await this.fetcher(`${WEATHER_RADAR_SOURCE_URL}${filename}`, { cache: "force-cache", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) throw new Error("CHMI frame is not a PNG");
      const rawLength = response.headers.get("content-length");
      const length = rawLength === null ? Number.NaN : Number(rawLength);
      if (Number.isFinite(length) && (length <= 0 || length > MAX_PNG_BYTES)) throw new Error("CHMI frame is too large");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 8 || bytes.length > MAX_PNG_BYTES || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a) throw new Error("CHMI frame has invalid PNG signature");
      this.frames.set(id, { value: bytes, fetchedAt: this.clock() });
      while (this.frames.size > WEATHER_RADAR_MAX_FRAMES + 4) this.frames.delete(this.frames.keys().next().value!);
      return bytes;
    } catch (error) {
      this.failures += 1;
      throw error;
    }
  }
}

export const defaultWeatherRadarProvider = new WeatherRadarProvider();
