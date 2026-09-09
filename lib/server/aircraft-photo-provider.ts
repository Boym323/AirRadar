import { normalizeIcaoHex } from "@/lib/server/validation";
import type { AircraftPhoto } from "@/lib/aircraft/photo";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const AIRCRAFT_PHOTO_TTLS = {
  positiveMs: 24 * 60 * 60_000,
  negativeMs: 60 * 60_000,
  timeoutMs: 4_000,
  maxEntries: 2_000,
} as const;

export const PLANESPOTTERS_API_BASE_URL = "https://api.planespotters.net";
export const PLANESPOTTERS_ALLOWED_HOSTS = new Set(["t.plnspttrs.net", "www.planespotters.net"]);
export const AIRCRAFT_PHOTO_USER_AGENT = getAirRadarUserAgent("aircraft-photo");

interface PhotoCacheEntry {
  value: AircraftPhoto | null;
  expiresAt: number;
}

interface AircraftPhotoCacheOptions {
  positiveMs?: number;
  negativeMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export interface CachedAircraftPhoto {
  photo: AircraftPhoto | null;
  cached: boolean;
}

/** Process-local, bounded cache for photo metadata only; image bytes never pass through it. */
export class AircraftPhotoCache {
  private readonly entries = new Map<string, PhotoCacheEntry>();
  private readonly inFlight = new Map<string, Promise<AircraftPhoto | null>>();
  private readonly positiveMs: number;
  private readonly negativeMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: AircraftPhotoCacheOptions = {}) {
    this.positiveMs = options.positiveMs ?? AIRCRAFT_PHOTO_TTLS.positiveMs;
    this.negativeMs = options.negativeMs ?? AIRCRAFT_PHOTO_TTLS.negativeMs;
    this.maxEntries = Math.max(1, options.maxEntries ?? AIRCRAFT_PHOTO_TTLS.maxEntries);
    this.now = options.now ?? Date.now;
  }

  async get(key: string, loader: () => Promise<AircraftPhoto | null>): Promise<CachedAircraftPhoto> {
    const cached = this.entries.get(key);
    const now = this.now();
    if (cached && cached.expiresAt > now) return { photo: cached.value, cached: true };
    if (cached) this.entries.delete(key);

    const existing = this.inFlight.get(key);
    if (existing) return { photo: await existing, cached: false };

    const request = loader()
      .catch(() => null)
      .then((photo) => {
        this.entries.set(key, {
          value: photo,
          expiresAt: this.now() + (photo === null ? this.negativeMs : this.positiveMs),
        });
        this.evictIfNeeded();
        return photo;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return { photo: await request, cached: false };
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}

interface ProviderPhotoResponse {
  status: "found" | "empty" | "invalid" | "failed";
  photo: AircraftPhoto | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, maximumLength = 2_048): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximumLength ? trimmed : null;
}

function allowedHttpsUrl(value: unknown): string | null {
  const candidate = stringValue(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return PLANESPOTTERS_ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function photoFromPayload(payload: unknown): ProviderPhotoResponse {
  if (!isRecord(payload) || !Array.isArray(payload.photos)) return { status: "failed", photo: null };
  if (payload.photos.length === 0) return { status: "empty", photo: null };

  for (const candidate of payload.photos) {
    if (!isRecord(candidate)) continue;
    const thumbnail = isRecord(candidate.thumbnail) ? candidate.thumbnail : null;
    const thumbnailUrl = allowedHttpsUrl(thumbnail?.src);
    const sourceUrl = allowedHttpsUrl(candidate.link);
    if (!thumbnailUrl || !sourceUrl) continue;
    const photographer = stringValue(candidate.photographer, 200);
    return {
      status: "found",
      photo: {
        thumbnailUrl,
        sourceUrl,
        photographer,
        attribution: photographer ? `© ${photographer}` : null,
        provider: "planespotters",
      },
    };
  }

  return { status: "invalid", photo: null };
}

function endpoint(kind: "hex" | "reg", value: string): string {
  return `${PLANESPOTTERS_API_BASE_URL}/pub/photos/${kind}/${encodeURIComponent(value)}`;
}

export interface PlanespottersPhotoProviderOptions {
  fetcher?: typeof fetch;
  cache?: AircraftPhotoCache;
  timeoutMs?: number;
}

export class PlanespottersPhotoProvider {
  private readonly fetcher: typeof fetch;
  private readonly cache: AircraftPhotoCache;
  private readonly timeoutMs: number;

  constructor(options: PlanespottersPhotoProviderOptions = {}) {
    // Resolve the global fetch at request time so tests and the runtime can
    // provide the current server fetch implementation.
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.cache = options.cache ?? new AircraftPhotoCache();
    this.timeoutMs = Math.max(1, options.timeoutMs ?? AIRCRAFT_PHOTO_TTLS.timeoutMs);
  }

  async getPhoto(rawIcaoHex: unknown, rawRegistration?: unknown): Promise<CachedAircraftPhoto> {
    const icaoHex = normalizeIcaoHex(rawIcaoHex);
    if (!icaoHex) return { photo: null, cached: false };
    const registration = stringValue(rawRegistration, 100);
    return this.cache.get(icaoHex, async () => {
      const byHex = await this.fetchPhoto(endpoint("hex", icaoHex));
      if (byHex.status === "found") return byHex.photo;
      if (byHex.status !== "empty" || !registration) return null;
      const byRegistration = await this.fetchPhoto(endpoint("reg", registration));
      return byRegistration.status === "found" ? byRegistration.photo : null;
    });
  }

  cacheSize(): number {
    return this.cache.size();
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async fetchPhoto(url: string): Promise<ProviderPhotoResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": AIRCRAFT_PHOTO_USER_AGENT },
        signal: controller.signal,
      });
      if (response.status === 404) return { status: "empty", photo: null };
      if (!response.ok) return { status: "failed", photo: null };
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { status: "failed", photo: null };
      }
      return photoFromPayload(payload);
    } catch {
      return { status: "failed", photo: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const defaultPlanespottersPhotoProvider = new PlanespottersPhotoProvider();

export function getAircraftPhoto(rawIcaoHex: unknown, registration?: string | null): Promise<CachedAircraftPhoto> {
  return defaultPlanespottersPhotoProvider.getPhoto(rawIcaoHex, registration);
}
