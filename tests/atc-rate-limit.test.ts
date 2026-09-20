import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicRateLimiter } from "@/lib/server/rate-limit";

vi.mock("@/lib/server/sector-traffic-context", () => ({
  getAllSectorTrafficContext: vi.fn(async () => []),
  getSectorTrafficHistoryBatch: vi.fn(async () => ({ sectors: [] })),
  getSectorTrafficContext: vi.fn(async () => null),
  getSectorTrafficHistory: vi.fn(async () => null),
  getSectorTransitions: vi.fn(async () => ({ transitions: [], totalTransitions: 0 })),
}));

const trafficRoute = await import("@/app/api/atc/sectors/traffic/route");
const historyRoute = await import("@/app/api/atc/sectors/history/route");
const transitionRoute = await import("@/app/api/atc/sectors/transitions/route");

const request = (path: string) => new Request(`http://localhost${path}`, { headers: { "x-real-ip": "198.51.100.10" } });

describe("public ATC expensive endpoints", () => {
  beforeEach(() => publicRateLimiter.clear());

  it("rate-limits the live traffic endpoint", async () => {
    for (let i = 0; i < 30; i += 1) expect((await trafficRoute.GET(request("/api/atc/sectors/traffic"))).status).toBe(200);
    expect((await trafficRoute.GET(request("/api/atc/sectors/traffic"))).status).toBe(429);
  });

  it("uses the same limiter for history and transitions", async () => {
    for (let i = 0; i < 30; i += 1) expect((await historyRoute.GET(request("/api/atc/sectors/history?bucket=1m&from=2026-09-20T00:00:00Z&to=2026-09-20T00:01:00Z"))).status).toBe(200);
    expect((await historyRoute.GET(request("/api/atc/sectors/history?bucket=1m&from=2026-09-20T00:00:00Z&to=2026-09-20T00:01:00Z"))).status).toBe(429);
    publicRateLimiter.clear();
    for (let i = 0; i < 30; i += 1) expect((await transitionRoute.GET(request("/api/atc/sectors/transitions?window=5m"))).status).toBe(200);
    expect((await transitionRoute.GET(request("/api/atc/sectors/transitions?window=5m"))).status).toBe(429);
  });
});
