import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAdminAuthEnabled,
  isSensitiveWatchlistSessionValid,
  isWatchlistAuthConfigured,
  isWatchlistSessionValid,
  requireWatchlistMutation,
  verifyWatchlistAdminToken,
  watchlistSessionCookie,
} from "@/lib/server/watchlist-auth";

afterEach(() => vi.unstubAllEnvs());

describe("optional AirRadar administrator authentication", () => {
  const request = (headers: Record<string, string> = {}, path = "/api/watchlist") => new Request(`https://radar.example${path}`, {
    method: "POST",
    headers: { host: "radar.example", "x-forwarded-proto": "https", ...headers },
  });

  it("defaults to no token even when a legacy token remains configured", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "old-admin-token");
    expect(isAdminAuthEnabled()).toBe(false);
    expect(isWatchlistAuthConfigured()).toBe(false);
    expect(isWatchlistSessionValid(request())).toBe(true);
    expect(requireWatchlistMutation(request({ origin: "https://radar.example" }))).toBeNull();
    expect(verifyWatchlistAdminToken("old-admin-token")).toBe(false);
  });

  it("accepts watchlist writes with no login but still rejects cross-origin mutations", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "false");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "");
    expect(requireWatchlistMutation(request({ origin: "https://radar.example" }))).toBeNull();
    expect(requireWatchlistMutation(request({ origin: "https://attacker.example" }))?.status).toBe(403);
  });

  it("fails closed when authentication is enabled without a configured admin token", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "true");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "");
    expect(isAdminAuthEnabled()).toBe(true);
    expect(isWatchlistSessionValid(request())).toBe(false);
    expect(requireWatchlistMutation(request())?.status).toBe(503);
  });

  it("keeps sensitive diagnostics fail-closed in legacy open mode", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "false");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "legacy-token");
    expect(isWatchlistSessionValid(request())).toBe(true);
    expect(isSensitiveWatchlistSessionValid(request())).toBe(false);
    expect(requireWatchlistMutation(request({ origin: "https://radar.example" }), { requireExplicitAuth: true })?.status).toBe(503);
    expect(isWatchlistSessionValid(request({}, "/api/admin/alerts/history"))).toBe(false);
    expect(requireWatchlistMutation(request({ origin: "https://radar.example" }, "/api/admin/alerts/rules"))?.status).toBe(503);
  });

  it("accepts signed sessions only when explicitly enabled and rejects cross-origin requests", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "true");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "test-admin-token");
    expect(isWatchlistAuthConfigured()).toBe(true);
    expect(verifyWatchlistAdminToken("test-admin-token")).toBe(true);
    expect(verifyWatchlistAdminToken("wrong-token")).toBe(false);
    const loginRequest = new Request("https://radar.example/api/watchlist/session", {
      headers: { host: "radar.example", "x-forwarded-proto": "https" },
    });
    const sessionCookie = watchlistSessionCookie(loginRequest, "test-admin-token");
    expect(sessionCookie).toContain("Path=/;");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Strict");
    expect(sessionCookie).toContain("Secure");
    const cookie = sessionCookie.split(";", 1)[0];
    expect(isWatchlistSessionValid(request())).toBe(false);
    expect(isWatchlistSessionValid(request({ cookie }))).toBe(true);
    expect(requireWatchlistMutation(request({ origin: "https://radar.example", cookie }))).toBeNull();
    expect(requireWatchlistMutation(request({ origin: "https://attacker.example", cookie }))?.status).toBe(403);
  });
});
