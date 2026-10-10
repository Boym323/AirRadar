/**
 * Optional, operator-controlled SondeHub snapshot provider.
 *
 * SondeHub explicitly discourages regular REST polling. We load lazily when a
 * user enables the layer, coalesce callers and retain a shared bounded cache.
 * A separate MQTT receiver is required before this can be called live tracking.
 */
export const SONDEHUB_SOURCE = "https://sondehub.org/";
const SONDEHUB_API = "https://api.v2.sondehub.org/sondes";
const FRESH_MS = 20 * 60_000;
const STALE_MS = 60 * 60_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_RECORDS = 300;
const LOOKBACK_SECONDS = 3600;
const RADIUS_METERS = 400_000;

export interface SondeHubObservation {
  serial: string;
  latitude: number;
  longitude: number;
  altitudeM: number;
  observedAt: string;
  ascentMs: number | null;
  sondeType: string | null;
}

export interface SondeHubSnapshot {
  available: boolean;
  stale: boolean;
  source: "SondeHub";
  attribution: "SondeHub contributors (CC BY-SA 2.0)";
  sourceUrl: string;
  fetchedAt: string | null;
  observations: SondeHubObservation[];
  count: number;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function normalizeSondeHubPayload(payload: unknown, now: number): SondeHubObservation[] {
  const rows = record(payload);
  if (!rows) return [];
  const normalized: SondeHubObservation[] = [];
  for (const [key, value] of Object.entries(rows).slice(0, 2_000)) {
    const row = record(value);
    if (!row) continue;
    const serial = String(row.serial ?? key).trim();
    const lat = finite(row.lat);
    const lon = finite(row.lon);
    const alt = finite(row.alt);
    const observed = typeof row.datetime === "string" ? Date.parse(row.datetime) : NaN;
    if (!/^[A-Za-z0-9._-]{2,48}$/.test(serial)
      || lat === null || lat < -90 || lat > 90
      || lon === null || lon < -180 || lon > 180
      || alt === null || alt < -1_000 || alt > 65_000
      || !Number.isFinite(observed)
      || observed > now + 5 * 60_000 || now - observed > LOOKBACK_SECONDS * 1_000) continue;
    const ascent = finite(row.vel_v);
    const type = typeof row.type === "string" ? row.type.trim() : "";
    normalized.push({
      serial,
      latitude: lat,
      longitude: lon,
      altitudeM: alt,
      observedAt: new Date(observed).toISOString(),
      ascentMs: ascent !== null && Math.abs(ascent) <= 100 ? ascent : null,
      sondeType: type.length > 0 && type.length <= 40 ? type : null,
    });
  }
  normalized.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  return normalized.slice(0, MAX_RECORDS);
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error("SondeHub response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SondeHub response body unavailable");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("SondeHub response too large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return JSON.parse(text) as unknown;
}

function result(observations: SondeHubObservation[], fetchedAt: number | null, stale: boolean): SondeHubSnapshot {
  return {
    available: fetchedAt !== null,
    stale,
    source: "SondeHub",
    attribution: "SondeHub contributors (CC BY-SA 2.0)",
    sourceUrl: SONDEHUB_SOURCE,
    fetchedAt: fetchedAt === null ? null : new Date(fetchedAt).toISOString(),
    observations,
    count: observations.length,
  };
}

export class SondeHubProvider {
  private cache: { key: string; fetchedAt: number; observations: SondeHubObservation[] } | null = null;
  private inFlight: Promise<SondeHubSnapshot> | null = null;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  async getSnapshot(latitude: number, longitude: number): Promise<SondeHubSnapshot> {
    // Only receiver-centered requests, never arbitrary user-provided searches.
    const key = latitude.toFixed(3) + ":" + longitude.toFixed(3);
    const now = this.clock();
    if (this.cache?.key === key && now - this.cache.fetchedAt < FRESH_MS) {
      return result(this.cache.observations, this.cache.fetchedAt, false);
    }
    if (this.inFlight) return this.inFlight;
    const request = (async () => {
      try {
        const url = new URL(SONDEHUB_API);
        url.searchParams.set("lat", String(latitude));
        url.searchParams.set("lon", String(longitude));
        url.searchParams.set("distance", String(RADIUS_METERS));
        url.searchParams.set("last", String(LOOKBACK_SECONDS));
        const response = await this.fetcher(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: "application/json", "User-Agent": "AirRadar/1.0 (sondehub-snapshot; https://airradar.pomykal.cz)" },
        });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          throw new Error("SondeHub upstream unavailable");
        }
        const payload = await boundedJson(response);
        if (!record(payload)) throw new Error("SondeHub payload invalid");
        const fetchedAt = this.clock();
        const observations = normalizeSondeHubPayload(payload, fetchedAt);
        this.cache = { key, fetchedAt, observations };
        return result(observations, fetchedAt, false);
      } catch {
        if (this.cache?.key === key && this.clock() - this.cache.fetchedAt <= STALE_MS) {
          return result(this.cache.observations, this.cache.fetchedAt, true);
        }
        return result([], null, false);
      }
    })();
    this.inFlight = request;
    try { return await request; } finally { if (this.inFlight === request) this.inFlight = null; }
  }
}

export const defaultSondeHubProvider = new SondeHubProvider();
