import { afterEach, describe, expect, it, vi } from "vitest";
import { AdsbLolProvider } from "@/lib/server/adsblol-provider";

const receiver = { lat: 49.22, lon: 17.67, name: "Private receiver" };

function payload(ac: unknown[] = [], now = Date.now()) {
  return { ac, now, total: ac.length, msg: "No error" };
}

function aircraft(overrides: Record<string, unknown> = {}) {
  return {
    hex: "ABC123",
    flight: "TEST123 ",
    lat: 49.3,
    lon: 17.8,
    alt_baro: 12_000,
    gs: 220,
    track: 180,
    seen: 0.2,
    seen_pos: 0.4,
    messages: 12,
    rssi: -20,
    type: "adsb_icao",
    mlat: [],
    tisb: [],
    ...overrides,
  };
}

function provider(options: ConstructorParameters<typeof AdsbLolProvider>[1] = {}) {
  return new AdsbLolProvider(receiver, {
    enabled: true,
    baseUrl: "https://api.adsb.lol",
    pollIntervalMs: 10_000,
    requestTimeoutMs: 4_000,
    staleAfterMs: 30_000,
    maxRetryIntervalMs: 60_000,
    maxAircraft: 3,
    ...options,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AdsbLolProvider", () => {
  it("uses the public geographic API with the configured radius and normalizes a valid response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload([aircraft()])), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const value = provider({ radiusNm: 250 });

    const snapshot = await value.getSnapshot();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://api.adsb.lol/v2/lat/49.22/lon/17.67/dist/250");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Accept: "application/json", "User-Agent": expect.stringContaining("AirRadar/") },
    });
    expect(snapshot.aircraft).toHaveLength(1);
    expect(snapshot.aircraft[0]).toMatchObject({ icaoHex: "ABC123", origin: "adsblol", callsign: "TEST123" });
    expect(value.getDiagnostics()).toMatchObject({ status: "online", aircraftCount: 1, positionedAircraftCount: 1 });
  });

  it("accepts an empty response without treating it as a provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload()), { status: 200 })));
    const value = provider();

    expect((await value.getSnapshot()).aircraft).toEqual([]);
    expect(value.getDiagnostics().status).toBe("online");
  });

  it("does not count stale network positions as positioned aircraft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload([
      aircraft({ seen: 0.2, seen_pos: 90 }),
    ])), { status: 200 })));
    const value = provider();

    const snapshot = await value.getSnapshot();

    expect(snapshot.aircraft).toHaveLength(1);
    expect(value.getDiagnostics()).toMatchObject({ aircraftCount: 1, positionedAircraftCount: 0 });
  });

  it("skips malformed aircraft entries and invalid coordinates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload([
      aircraft(),
      aircraft({ hex: "not-an-icao" }),
      aircraft({ hex: "DEF456", lat: 95 }),
    ])), { status: 200 })));
    const value = provider();

    expect((await value.getSnapshot()).aircraft.map((item) => item.icaoHex)).toEqual(["ABC123"]);
  });

  it("keeps malformed JSON and HTTP errors in the provider diagnostics", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("{", { status: 200 }))
      .mockResolvedValueOnce(new Response("server error", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const value = provider();

    await value.getSnapshot();
    expect(value.getDiagnostics().status).toBe("invalid_response");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 10_000));
    await value.getSnapshot();
    expect(value.getDiagnostics().status).toBe("http_error");
  });

  it("respects Retry-After and does not make overlapping requests", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-09T16:00:00.000Z");
    vi.setSystemTime(now);
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "Retry-After": "60" } }))
      .mockImplementationOnce(() => pending);
    vi.stubGlobal("fetch", fetcher);
    const value = provider();

    await value.getSnapshot();
    expect(value.getDiagnostics()).toMatchObject({ status: "rate_limited", retryAfterMs: 60_000 });
    await value.getSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(59_999);
    await value.getSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    const first = value.getSnapshot();
    const second = value.getSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(2);
    release(new Response(JSON.stringify(payload([aircraft()])), { status: 200 }));
    await Promise.all([first, second]);
    expect(value.getDiagnostics().status).toBe("online");
  });

  it("aborts a timed out request and stops new requests after shutdown", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const value = provider();
    const request = value.getSnapshot();
    await vi.advanceTimersByTimeAsync(4_000);
    await request;
    expect(value.getDiagnostics().status).toBe("timeout");
    await value.stop();
    await value.getSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
