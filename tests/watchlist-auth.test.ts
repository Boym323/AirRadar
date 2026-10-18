import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAdminAuthEnabled,
  isWatchlistAuthConfigured,
  isWatchlistSessionValid,
  requireWatchlistMutation,
  verifyWatchlistAdminToken,
  watchlistSessionCookie,
} from "@/lib/server/watchlist-auth";

afterEach(() => vi.unstubAllEnvs());

describe("optional AirRadar administrator authentication", () => {
  const request = (headers: Record<string, string> = {}) => new Request("https://radar.example/api/watchlist", {
    method: "POST",
    headers: { host: "radar.example", "x-forwarded-proto": "https", ...headers },
  });

  it("does not grant administrator access when legacy open mode is active", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "old-admin-token");
    expect(isAdminAuthEnabled()).toBe(false);
    expect(isWatchlistAuthConfigured()).toBe(false);
    expect(isWatchlistSessionValid(request())).toBe(true);
    expect(requireWatchlistMutation(request({ origin: "https://radar.example" }))?.status).toBe(503);
    expect(verifyWatchlistAdminToken("old-admin-token")).toBe(false);
  });

  it("rejects watchlist writes without a configured administrator session", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "false");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "");
    expect(requireWatchlistMutation(request({ origin: "https://radar.example" }))?.status).toBe(503);
    expect(requireWatchlistMutation(request({ origin: "https://attacker.example" }))?.status).toBe(403);
  });

  it("fails closed when authentication is enabled without a configured admin token", () => {
    vi.stubEnv("AIRRADAR_ADMIN_AUTH_ENABLED", "true");
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "");
    expect(isAdminAuthEnabled()).toBe(true);
    expect(isWatchlistSessionValid(request())).toBe(false);
    expect(requireWatchlistMutation(request())?.status).toBe(503);
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
    const cookie = sessionCookie.split(";", 1)[0];
    expect(isWatchlistSessionValid(request())).toBe(false);
    expect(isWatchlistSessionValid(request({ cookie }))).toBe(true);
    expect(requireWatchlistMutation(request({ origin: "https://radar.example", cookie }))).toBeNull();
    expect(requireWatchlistMutation(request({ origin: "https://attacker.example", cookie }))?.status).toBe(403);
  });
});
