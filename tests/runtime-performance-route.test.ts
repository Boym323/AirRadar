import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(() => false),
  rateLimit: vi.fn(() => ({ allowed: true })),
  metrics: vi.fn(() => ({ "health.total": { calls: 5, avgMs: 30, maxMs: 50, p50Ms: 25, p95Ms: 49, p99Ms: 50, samplesMs: [1, 2] } })),
  runtime: vi.fn(() => ({ status: "disabled", heapUsedBytes: 123, heapTotalBytes: 200, rssBytes: 300, eventLoopLagP50Ms: null, eventLoopLagP95Ms: null, eventLoopLagP99Ms: null, gcSampleCount: 0, gcMaxPauseMs: null, gcAveragePauseMs: null })),
}));
vi.mock("@/lib/server/watchlist-auth", () => ({ isWatchlistSessionValid: mocks.authenticated }));
vi.mock("@/lib/server/rate-limit", () => ({ checkPublicRateLimit: mocks.rateLimit, rateLimitResponse: vi.fn() }));
vi.mock("@/lib/server/runtime-performance", () => ({ getRuntimePerformanceDiagnostics: mocks.metrics }));
vi.mock("@/lib/server/runtime-health-observation", () => ({ getRuntimeHealthObservation: mocks.runtime }));
import { GET } from "@/app/api/system/runtime-performance/route";

describe("authenticated runtime performance projection", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authenticated.mockReturnValue(false); mocks.rateLimit.mockReturnValue({ allowed: true }); });
  it("denies public callers without accessing internal counters", async () => {
    const result = await GET(new Request("http://localhost/api/system/runtime-performance"));
    expect(result.status).toBe(401);
    expect(mocks.metrics).not.toHaveBeenCalled();
    expect(mocks.runtime).not.toHaveBeenCalled();
  });
  it("returns bounded phase metrics but never raw samples", async () => {
    mocks.authenticated.mockReturnValue(true);
    const response = await GET(new Request("http://localhost/api/system/runtime-performance"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.phases["health.total"].calls).toBe(5);
    expect(body.phases["health.total"].samplesMs).toBeUndefined();
    expect(Object.keys(body.phases)).toHaveLength(5);
    expect(body.runtime.status).toBe("disabled");
  });
});
