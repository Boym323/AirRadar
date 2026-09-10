import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OGN_HOST, DEFAULT_OGN_PORT, getOgnConfig } from "@/lib/server/config";
import { DEFAULT_OGN_DDB_URL } from "@/lib/ogn/ddb";

afterEach(() => vi.unstubAllEnvs());

describe("OGN configuration", () => {
  it("is disabled by default and uses the official APRS endpoint", () => {
    vi.stubEnv("OGN_ENABLED", "false");
    expect(getOgnConfig()).toMatchObject({ enabled: false, host: DEFAULT_OGN_HOST, port: DEFAULT_OGN_PORT, radiusKm: 250, connectTimeoutMs: 10_000, handshakeTimeoutMs: 10_000, staleAfterMs: 15_000, removeAfterMs: 60_000, maxPacketAgeMs: 120_000, ddbUrl: DEFAULT_OGN_DDB_URL, maxTargets: 5_000, configurationError: null });
  });

  it("keeps TCP connect and login handshake timeouts independently configurable", () => {
    vi.stubEnv("OGN_CONNECT_TIMEOUT_MS", "5000");
    vi.stubEnv("OGN_HANDSHAKE_TIMEOUT_MS", "7000");
    expect(getOgnConfig()).toMatchObject({ connectTimeoutMs: 5_000, handshakeTimeoutMs: 7_000 });
  });

  it("keeps the server-side DDB URL on the official host", () => {
    vi.stubEnv("OGN_DDB_URL", "https://example.invalid/ddb?j=1&t=1");
    const value = getOgnConfig();
    expect(value.ddbUrl).toBe(DEFAULT_OGN_DDB_URL);
    expect(value.configurationError).toContain("OGN_DDB_URL");
  });

  it("reports invalid operator configuration without accepting unsafe values", () => {
    vi.stubEnv("OGN_ENABLED", "true");
    vi.stubEnv("OGN_HOST", "bad host\nwith-control");
    vi.stubEnv("OGN_PORT", "70000");
    vi.stubEnv("OGN_RADIUS_KM", "0");
    vi.stubEnv("OGN_REMOVE_AFTER_MS", "5000");
    vi.stubEnv("OGN_STALE_AFTER_MS", "15000");
    const value = getOgnConfig();
    expect(value).toMatchObject({ enabled: true, host: DEFAULT_OGN_HOST, port: 65_535, radiusKm: 1 });
    expect(value.configurationError).toContain("OGN_HOST");
    expect(value.configurationError).toContain("OGN_PORT");
    expect(value.configurationError).toContain("OGN_RADIUS_KM");
    expect(value.configurationError).toContain("OGN_REMOVE_AFTER_MS");
  });
});
