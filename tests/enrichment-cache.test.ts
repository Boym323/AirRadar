import { describe, expect, it } from "vitest";
import { ENRICHMENT_TTLS, ProviderCache, metadataCacheKey, routeCacheKey } from "@/lib/server/enrichment-cache";

describe("provider enrichment cache", () => {
  it("coalesces concurrent calls and caches negative results", async () => {
    const cache = new ProviderCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await Promise.resolve();
      return null;
    };
    const options = { ttlMs: ENRICHMENT_TTLS.routeMs, negativeTtlMs: ENRICHMENT_TTLS.routeNegativeMs };
    await Promise.all([cache.get("route:test", loader, options), cache.get("route:test", loader, options)]);
    await cache.get("route:test", loader, options);
    expect(calls).toBe(1);
  });

  it("uses stable identity keys", () => {
    const date = new Date("2026-01-02T12:00:00Z");
    expect(metadataCacheKey("abc123")).toBe("aircraft-metadata:ABC123");
    expect(routeCacheKey(" test123 ", date)).toBe("flight-route:TEST123:2026-01-02");
  });
});
