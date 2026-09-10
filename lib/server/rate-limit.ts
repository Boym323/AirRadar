export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

interface Bucket extends RateLimitPolicy {
  count: number;
  resetAt: number;
}

/**
 * Small process-local fixed-window limiter. Keys are bounded so an attacker
 * cannot turn client identity into an unbounded in-memory map.
 */
export class BoundedRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly maxEntries = 32) {}

  consume(scope: string, policy: RateLimitPolicy, now = Date.now()): RateLimitResult {
    this.prune(now);
    let bucket = this.buckets.get(scope);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maxEntries) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { ...policy, count: 0, resetAt: now + policy.windowMs };
      this.buckets.set(scope, bucket);
    }

    if (bucket.count >= bucket.limit) {
      return {
        allowed: false,
        limit: bucket.limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        resetAt: bucket.resetAt,
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      limit: bucket.limit,
      remaining: Math.max(0, bucket.limit - bucket.count),
      retryAfterSeconds: 0,
      resetAt: bucket.resetAt,
    };
  }

  size(): number {
    return this.buckets.size;
  }

  clear(): void {
    this.buckets.clear();
  }

  private prune(now: number): void {
    for (const [scope, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(scope);
    }
  }
}

export const publicRateLimiter = new BoundedRateLimiter(512);

export const PUBLIC_RATE_LIMITS = {
  aircraft: { limit: 60, windowMs: 60_000 },
  aircraftPhoto: { limit: 30, windowMs: 60_000 },
  history: { limit: 30, windowMs: 60_000 },
  airports: { limit: 30, windowMs: 60_000 },
  airportDetail: { limit: 30, windowMs: 60_000 },
  airportTraffic: { limit: 12, windowMs: 60_000 },
  weather: { limit: 30, windowMs: 60_000 },
  atcSectors: { limit: 30, windowMs: 60_000 },
  health: { limit: 60, windowMs: 60_000 },
  statistics: { limit: 12, windowMs: 60_000 },
  receptionRecords: { limit: 12, windowMs: 60_000 },
  logbookSummary: { limit: 12, windowMs: 60_000 },
  alertHistory: { limit: 12, windowMs: 60_000 },
  recap: { limit: 12, windowMs: 60_000 },
  systemStatus: { limit: 12, windowMs: 60_000 },
  version: { limit: 60, windowMs: 60_000 },
  search: { limit: 60, windowMs: 60_000 },
  watchlist: { limit: 60, windowMs: 60_000 },
} as const;

/**
 * The production reverse proxy overwrites X-Real-IP. X-Forwarded-For is
 * intentionally ignored because direct clients can forge it. Requests that
 * do not arrive through the trusted proxy share the bounded anonymous bucket.
 */
export function getRateLimitClientKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && isIP(realIp) ? realIp : "anonymous";
}

export function checkPublicRateLimit(scope: keyof typeof PUBLIC_RATE_LIMITS, request: Request): RateLimitResult {
  return publicRateLimiter.consume(`${scope}:${getRateLimitClientKey(request)}`, PUBLIC_RATE_LIMITS[scope]);
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
import { isIP } from "node:net";
