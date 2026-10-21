import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/system-status", () => ({
  readSystemStatus: vi.fn(async (_service: unknown, detail: string) => ({ detail })),
  toPublicSystemStatus: (status: { detail: string }) => ({ status: "safe", detail: status.detail }),
  toAdminSystemStatus: (status: { detail: string }) => ({ status: "full", detail: status.detail }),
}));

import { GET as deliveryHealth } from "@/app/api/admin/alerts/delivery-health/route";
import { GET as altitude } from "@/app/api/admin/altitude/[hex]/route";
import { GET as flightAwareUsage } from "@/app/api/admin/flightaware/usage/route";
import { GET as navigationCandidates } from "@/app/api/admin/navigation-integrity/candidates/route";
import { GET as navigationDiagnostics } from "@/app/api/admin/navigation-integrity/diagnostics/route";
import { GET as weatherDiagnostics } from "@/app/api/admin/weather/diagnostics/route";
import { GET as systemStatus } from "@/app/api/system/status/route";
import { POST as subscribePush } from "@/app/api/push/subscribe/route";
import { readSystemStatus } from "@/lib/server/system-status";
import { watchlistSessionCookie } from "@/lib/server/watchlist-auth";

afterEach(() => vi.unstubAllEnvs());

describe("admin route authorization and public diagnostics", () => {
  it("keeps sanitized system status readable anonymously in legacy auth-off mode", async () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "false");
    const response = await systemStatus(new Request("https://radar.example/api/system/status"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "safe", detail: "public" });
    expect(readSystemStatus).toHaveBeenCalledWith(undefined, "public");
  });

  it("allows the full system diagnostic only to a valid administrator session", async () => {
    const token = "test-admin-token";
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "true");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", token);
    const login = new Request("https://radar.example/api/watchlist/session", { headers: { host: "radar.example", "x-forwarded-proto": "https" } });
    const cookie = watchlistSessionCookie(login, token).split(";", 1)[0]!;
    const response = await systemStatus(new Request("https://radar.example/api/system/status", { headers: { host: "radar.example", cookie } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "full", detail: "full" });
    expect(readSystemStatus).toHaveBeenLastCalledWith(undefined, "full");
  });

  it("fails closed on every privileged admin read when legacy auth is disabled", async () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "false");
    const request = new Request("https://radar.example/api/admin/private");
    const responses = await Promise.all([
      deliveryHealth(request),
      altitude(request, { params: Promise.resolve({ hex: "ABC123" }) }),
      flightAwareUsage(request),
      navigationCandidates(request),
      navigationDiagnostics(request),
      weatherDiagnostics(request),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 404, 401, 401, 401, 401]);
  });

  it("returns 400 for malformed and oversized authenticated Web Push requests", async () => {
    const token = "test-admin-token";
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "true");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", token);
    const login = new Request("https://radar.example/api/watchlist/session", { headers: { host: "radar.example", "x-forwarded-proto": "https" } });
    const cookie = watchlistSessionCookie(login, token).split(";", 1)[0]!;
    const request = (body: string) => new Request("https://radar.example/api/push/subscribe", {
      method: "POST",
      headers: { host: "radar.example", origin: "https://radar.example", cookie },
      body,
    });

    expect((await subscribePush(request("{invalid json"))).status).toBe(400);
    expect((await subscribePush(request("x".repeat(9_000)))).status).toBe(400);
  });

  it("rejects an anonymous Web Push write even when the legacy auth flag is off", async () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "false");
    const response = await subscribePush(new Request("https://radar.example/api/push/subscribe", {
      method: "POST",
      headers: { host: "radar.example", origin: "https://radar.example" },
      body: JSON.stringify({ endpoint: "https://push.example.test/sub", keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }),
    }));
    expect(response.status).toBe(503);
  });
});
