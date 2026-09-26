import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: false,
  getHistory: vi.fn(),
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 12, remaining: 11, retryAfterSeconds: 0, resetAt: Date.now() + 60_000 })),
}));

vi.mock("@/lib/server/watchlist-auth", () => ({
  isWatchlistSessionValid: () => mocks.authenticated,
}));

vi.mock("@/lib/server/runtime-telemetry", () => ({
  getRuntimeTelemetryHistory: mocks.getHistory,
}));

vi.mock("@/lib/server/rate-limit", () => ({
  checkPublicRateLimit: mocks.checkRateLimit,
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

import { GET } from "@/app/api/system/runtime-history/route";

describe("runtime telemetry history route", () => {
  beforeEach(() => {
    mocks.authenticated = false;
    mocks.getHistory.mockReset();
    mocks.checkRateLimit.mockClear();
  });

  it("rejects anonymous callers without exposing telemetry", async () => {
    const response = await GET(new Request("https://airradar.example/api/system/runtime-history"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "auth_required" });
    expect(mocks.getHistory).not.toHaveBeenCalled();
  });

  it("returns bounded history to an authenticated admin session", async () => {
    mocks.authenticated = true;
    mocks.getHistory.mockReturnValue({
      schemaVersion: 1,
      intervalMs: 60_000,
      retentionMs: 86_400_000,
      samples: [{ recordedAt: "2026-09-26T06:00:00.000Z", processRssBytes: 1, heapUsedBytes: 1, cgroupMemoryCurrentBytes: 1, activeSseClients: 0, aircraftCount: 1, listenerCount: 0, databaseState: "ok", databaseLatencyMs: 3, localProviderState: "online", networkProviderState: "online" }],
      diagnostics: { file: "/var/lib/airradar/runtime-telemetry-v1.json", loadedFromDisk: true, lastLoadError: null, lastSaveAt: null, lastSaveError: null },
    });

    const response = await GET(new Request("https://airradar.example/api/system/runtime-history"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).samples).toHaveLength(1);
  });
});
