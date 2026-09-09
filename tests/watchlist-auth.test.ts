import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireWatchlistMutation,
  verifyWatchlistAdminToken,
  watchlistSessionCookie,
} from "@/lib/server/watchlist-auth";

afterEach(() => vi.unstubAllEnvs());

describe("watchlist mutation authentication", () => {
  it("fails closed when the admin token is not configured", () => {
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "");
    const response = requireWatchlistMutation(new Request("http://localhost/api/watchlist", { method: "POST" }));
    expect(response?.status).toBe(503);
  });

  it("accepts a signed same-origin session and rejects a cross-origin request", async () => {
    vi.stubEnv("WATCHLIST_ADMIN_TOKEN", "test-admin-token");
    expect(verifyWatchlistAdminToken("test-admin-token")).toBe(true);
    expect(verifyWatchlistAdminToken("wrong-token")).toBe(false);
    const loginRequest = new Request("https://radar.example/api/watchlist/session", { headers: { host: "radar.example", "x-forwarded-proto": "https" } });
    const cookie = watchlistSessionCookie(loginRequest, "test-admin-token").split(";", 1)[0];
    const authorized = requireWatchlistMutation(new Request("https://radar.example/api/watchlist", {
      method: "POST",
      headers: { host: "radar.example", "x-forwarded-proto": "https", origin: "https://radar.example", cookie },
    }));
    expect(authorized).toBeNull();
    const csrf = requireWatchlistMutation(new Request("https://radar.example/api/watchlist", {
      method: "POST",
      headers: { host: "radar.example", "x-forwarded-proto": "https", origin: "https://attacker.example", cookie },
    }));
    expect(csrf?.status).toBe(403);
  });
});
