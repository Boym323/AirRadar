/** NOAA SWPC global geomagnetic context, not local GNSS-jamming evidence. */
const NOAA_KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const CACHE_MS = 10 * 60_000;
const STALE_MS = 60 * 60_000;
const MAX_BYTES = 128 * 1024;

export type SpaceWeatherKpStatus = "quiet" | "unsettled" | "storm";
export interface SpaceWeatherContext {
  available: boolean;
  stale: boolean;
  provider: "NOAA SWPC";
  sourceUrl: string;
  observedAt: string | null;
  fetchedAt: string | null;
  kp: number | null;
  status: SpaceWeatherKpStatus | null;
  description: "Global planetary index; not evidence of GNSS jamming, spoofing, or a local navigation fault";
}

type KpObservation = { observedAt: string; kp: number };

export function parseNoaaKp(body: unknown, now: number): KpObservation | null {
  if (!Array.isArray(body) || body.length > 1000) return null;
  let latest: KpObservation | null = null;
  for (const row of body) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.time_tag !== "string") continue;
    const rawTime = rec.time_tag;
    const instant = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(rawTime) ? rawTime : rawTime + "Z");
    const kp = typeof rec.Kp === "number" ? rec.Kp : typeof rec.Kp === "string" ? Number(rec.Kp) : NaN;
    if (!Number.isFinite(instant) || instant > now + 15 * 60_000 || now - instant > 7 * 24 * 60 * 60_000 || !Number.isFinite(kp) || kp < 0 || kp > 9) continue;
    if (!latest || instant > Date.parse(latest.observedAt)) latest = { observedAt: new Date(instant).toISOString(), kp };
  }
  return latest;
}

export class NoaaSpaceWeatherProvider {
  private cache: { observation: KpObservation; fetchedAt: number } | null = null;
  private inFlight: Promise<SpaceWeatherContext> | null = null;

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly clock: () => number = Date.now) {}

  private snapshot(stale: boolean): SpaceWeatherContext {
    const item = this.cache;
    const kp = item?.observation.kp ?? null;
    return {
      available: Boolean(item),
      stale,
      provider: "NOAA SWPC",
      sourceUrl: NOAA_KP_URL,
      observedAt: item?.observation.observedAt ?? null,
      fetchedAt: item ? new Date(item.fetchedAt).toISOString() : null,
      kp,
      status: kp === null ? null : kp >= 5 ? "storm" : kp >= 4 ? "unsettled" : "quiet",
      description: "Global planetary index; not evidence of GNSS jamming, spoofing, or a local navigation fault",
    };
  }

  async getContext(): Promise<SpaceWeatherContext> {
    const now = this.clock();
    if (this.cache && now - this.cache.fetchedAt < CACHE_MS) return this.snapshot(false);
    if (this.inFlight) return this.inFlight;
    const run = (async () => {
      try {
        const response = await this.fetcher(NOAA_KP_URL, {
          signal: AbortSignal.timeout(6_000),
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("json")) throw new Error("NOAA not available");
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) throw new Error("NOAA body too large");
        const body = await response.text();
        if (new TextEncoder().encode(body).length > MAX_BYTES) throw new Error("NOAA body too large");
        const observation = parseNoaaKp(JSON.parse(body) as unknown, this.clock());
        if (!observation) throw new Error("NOAA invalid measurements");
        this.cache = { observation, fetchedAt: this.clock() };
        return this.snapshot(false);
      } catch {
        if (this.cache && this.clock() - this.cache.fetchedAt <= STALE_MS) return this.snapshot(true);
        return this.snapshot(false);
      }
    })();
    this.inFlight = run;
    try { return await run; } finally { if (this.inFlight === run) this.inFlight = null; }
  }
}
export const defaultNoaaSpaceWeatherProvider = new NoaaSpaceWeatherProvider();
