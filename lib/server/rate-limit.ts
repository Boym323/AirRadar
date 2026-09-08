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
 * Small process-local fixed-window limiter. It deliberately limits scopes,
 * rather than trusting forwarded client IP headers from an unknown proxy.
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

export const publicRateLimiter = new BoundedRateLimiter(8);

export const PUBLIC_RATE_LIMITS = {
  aircraft: { limit: 60, windowMs: 60_000 },
  aircraftPhoto: { limit: 30, windowMs: 60_000 },
  history: { limit: 30, windowMs: 60_000 },
  airports: { limit: 30, windowMs: 60_000 },
  weather: { limit: 30, windowMs: 60_000 },
  atcSectors: { limit: 30, windowMs: 60_000 },
  health: { limit: 60, windowMs: 60_000 },
  statistics: { limit: 12, windowMs: 60_000 },
  systemStatus: { limit: 12, windowMs: 60_000 },
  version: { limit: 60, windowMs: 60_000 },
  search: { limit: 60, windowMs: 60_000 },
  watchlist: { limit: 60, windowMs: 60_000 },
} as const;

export function checkPublicRateLimit(scope: keyof typeof PUBLIC_RATE_LIMITS): RateLimitResult {
  return publicRateLimiter.consume(scope, PUBLIC_RATE_LIMITS[scope]);
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
