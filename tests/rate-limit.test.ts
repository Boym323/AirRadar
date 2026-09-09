import { describe, expect, it } from "vitest";
import { BoundedRateLimiter, getRateLimitClientKey } from "@/lib/server/rate-limit";

describe("bounded request limiter", () => {
  it("enforces a window and allows requests after expiry", () => {
    const limiter = new BoundedRateLimiter(4);
    expect(limiter.consume("history", { limit: 2, windowMs: 1000 }, 0).allowed).toBe(true);
    expect(limiter.consume("history", { limit: 2, windowMs: 1000 }, 1).allowed).toBe(true);
    const rejected = limiter.consume("history", { limit: 2, windowMs: 1000 }, 2);
    expect(rejected).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    expect(limiter.consume("history", { limit: 2, windowMs: 1000 }, 1000).allowed).toBe(true);
  });

  it("keeps the number of scopes bounded and expires old buckets", () => {
    const limiter = new BoundedRateLimiter(2);
    limiter.consume("one", { limit: 1, windowMs: 1000 }, 0);
    limiter.consume("two", { limit: 1, windowMs: 1000 }, 0);
    limiter.consume("three", { limit: 1, windowMs: 1000 }, 0);
    expect(limiter.size()).toBe(2);
    limiter.consume("fresh", { limit: 1, windowMs: 1000 }, 1000);
    expect(limiter.size()).toBe(1);
  });

  it("uses the trusted reverse-proxy address and ignores forgeable X-Forwarded-For", () => {
    expect(getRateLimitClientKey(new Request("http://localhost", { headers: { "x-real-ip": "192.0.2.10", "x-forwarded-for": "198.51.100.20" } }))).toBe("192.0.2.10");
    expect(getRateLimitClientKey(new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.20" } }))).toBe("anonymous");
    expect(getRateLimitClientKey(new Request("http://localhost", { headers: { "x-real-ip": "not-an-ip" } }))).toBe("anonymous");
  });
});
