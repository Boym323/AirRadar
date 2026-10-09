import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPublicRateLimit: vi.fn(() => ({ allowed: true })),
  rateLimitResponse: vi.fn(),
  getAircraftStateService: vi.fn(),
  isDatabaseConfigured: vi.fn(() => true),
  getPrisma: vi.fn(),
  getAtcData: vi.fn(),
  toPublicHealthResponse: vi.fn((_snapshot, database, _at, atc) => ({ status: "ok", database, atc })),
  measureRuntimeAsync: vi.fn((_name, _count, operation) => operation()),
  measureRuntime: vi.fn((_name, _count, operation) => operation()),
}));
vi.mock("@/lib/server/rate-limit", () => ({ checkPublicRateLimit: mocks.checkPublicRateLimit, rateLimitResponse: mocks.rateLimitResponse }));
vi.mock("@/lib/server/aircraft-state", () => ({ getAircraftStateService: mocks.getAircraftStateService }));
vi.mock("@/lib/server/db", () => ({ isDatabaseConfigured: mocks.isDatabaseConfigured, getPrisma: mocks.getPrisma }));
vi.mock("@/lib/server/providers", () => ({ getAtcData: mocks.getAtcData }));
vi.mock("@/lib/server/public-health", () => ({ toPublicHealthResponse: mocks.toPublicHealthResponse }));
vi.mock("@/lib/server/runtime-performance", () => ({ measureRuntimeAsync: mocks.measureRuntimeAsync, measureRuntime: mocks.measureRuntime }));

import { GET } from "@/app/api/health/route";

const NEVER = new Promise<never>(() => {});
const request = () => new Request("http://localhost/api/health");
const unavailable = { status: "unavailable", source: null, sourceReference: null, effectiveDate: null, lastVerifiedAt: null, sectorCount: 0, transmitterCount: 0 };

describe("health dependency deadlines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPublicRateLimit.mockReturnValue({ allowed: true });
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getAircraftStateService.mockReturnValue({
      waitForReady: vi.fn(async () => undefined), getSnapshot: vi.fn(() => ({ aircraft: [] })),
      getAlertStatus: vi.fn(() => ({ status: "disabled" })),
    });
    mocks.getPrisma.mockReturnValue({ orm: { public: { Aircraft: { limit: () => ({ all: async () => [] }) } } } });
    mocks.getAtcData.mockResolvedValue({ metadata: { status: "ok" } });
    mocks.toPublicHealthResponse.mockImplementation((_snapshot, database, _at, atc) => ({ status: "ok", database, atc }));
    mocks.measureRuntimeAsync.mockImplementation((_name, _count, operation) => operation());
    mocks.measureRuntime.mockImplementation((_name, _count, operation) => operation());
  });

  it("returns the usual health payload and records each dependency phase", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).database.status).toBe("ok");
    expect(mocks.measureRuntimeAsync.mock.calls.map((call) => call[0])).toEqual(["health.total", "health.ready", "health.database", "health.atc"]);
  });

  it("returns bounded 503 when readiness never resolves", async () => {
    vi.useFakeTimers();
    try {
      mocks.getAircraftStateService.mockReturnValue({ waitForReady: () => NEVER });
      const result = GET(request());
      await vi.advanceTimersByTimeAsync(1501);
      const response = await result;
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally { vi.useRealTimers(); }
  });

  it("marks database offline on timeout without hanging the response", async () => {
    vi.useFakeTimers();
    try {
      mocks.getPrisma.mockReturnValue({ orm: { public: { Aircraft: { limit: () => ({ all: () => NEVER }) } } } });
      const result = GET(request());
      await vi.advanceTimersByTimeAsync(1501);
      const response = await result;
      expect(response.status).toBe(200);
      expect((await response.json()).database.status).toBe("offline");
    } finally { vi.useRealTimers(); }
  });

  it("falls back to unavailable ATC metadata on timeout", async () => {
    vi.useFakeTimers();
    try {
      mocks.getAtcData.mockReturnValue(NEVER);
      const result = GET(request());
      await vi.advanceTimersByTimeAsync(1001);
      const response = await result;
      expect(response.status).toBe(200);
      expect((await response.json()).atc).toEqual(unavailable);
    } finally { vi.useRealTimers(); }
  });
});
