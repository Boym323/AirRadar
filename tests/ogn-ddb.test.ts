import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OGN_DDB_FALLBACK_URL, DEFAULT_OGN_DDB_URL, OgnDdb, ddbKey, ddbDeviceTypeForAddressType, parseDdbRetryAfter } from "@/lib/ogn/ddb";

const device = {
  device_type: "F",
  device_id: "8E20F0",
  aircraft_model: "ASW 20",
  registration: "OK-TEST",
  cn: "42",
  tracked: "Y",
  identified: "Y",
  aircraft_type: 1,
};

function response(devices: unknown[]) {
  return new Response(JSON.stringify({ devices }), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.useRealTimers());

describe("OGN DDB refresh", () => {
  it("loads the documented device schema and swaps the index atomically", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([device]))
      .mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, refreshMs: 60_000, maxStaleMs: 86_400_000 });

    await ddb.refresh();
    expect(ddb.lookup("F", "8e20f0")).toMatchObject({ deviceType: "F", deviceId: "8E20F0", registration: "OK-TEST", tracked: "Y", identified: "Y" });
    expect(ddb.isUsable()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(DEFAULT_OGN_DDB_URL);
    expect(ddb.getDiagnostics()).toMatchObject({ mode: "rich-json", endpoint: "https://ddb.glidernet.org/download/", lastHttpStatus: 200, fallbackCount: 0, fallbackUsed: false, aircraftTypeAvailable: true });
  });

  it("rejects malformed, oversized, and empty snapshots without creating a usable index", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([{ ...device, device_id: "bad" }]))
      .mockResolvedValueOnce(response([{ ...device, device_id: "bad" }]));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, maxBytes: 1024 });
    await ddb.refresh();
    expect(ddb.isUsable()).toBe(false);
    expect(ddb.getDiagnostics()).toMatchObject({ status: "offline", entries: 0, failures: 1, stale: true });

    const empty = new OgnDdb({ fetcher: vi.fn().mockResolvedValue(response([])) as unknown as typeof fetch });
    await empty.refresh();
    expect(empty.getDiagnostics().status).toBe("offline");
  });

  it("falls back from a primary HTTP failure and leaves optional type enrichment null", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("provider failure", { status: 500 }))
      .mockResolvedValueOnce(response([{ ...device, aircraft_type: undefined }]));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch });

    await ddb.refresh();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(DEFAULT_OGN_DDB_URL);
    expect(fetcher.mock.calls[1][0]).toBe(DEFAULT_OGN_DDB_FALLBACK_URL);
    expect(ddb.isUsable()).toBe(true);
    expect(ddb.lookup("F", "8E20F0")?.aircraftType).toBeNull();
    expect(ddb.getDiagnostics()).toMatchObject({ status: "online", mode: "base-json", lastHttpStatus: 200, fallbackCount: 1, fallbackUsed: true, aircraftTypeAvailable: false });
  });

  it("rejects a fallback missing privacy fields without a partial snapshot", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("provider failure", { status: 500 }))
      .mockResolvedValueOnce(response([{ ...device, tracked: undefined }]));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch });

    await ddb.refresh();

    expect(ddb.isUsable()).toBe(false);
    expect(ddb.lookup("F", "8E20F0")).toBeNull();
    expect(ddb.getDiagnostics()).toMatchObject({ status: "offline", failures: 1, entries: 0 });
  });

  it("retains a valid snapshot when both variants fail sanity-count validation", async () => {
    const manyDevices = Array.from({ length: 120 }, (_, index) => ({ ...device, device_id: index.toString(16).padStart(6, "0").toUpperCase() }));
    const fiveDevices = manyDevices.slice(0, 5);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(manyDevices))
      .mockResolvedValueOnce(response(fiveDevices))
      .mockResolvedValueOnce(response(fiveDevices));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, refreshMs: 60_000, maxStaleMs: 86_400_000 });

    await ddb.refresh();
    await ddb.refresh();

    expect(ddb.lookup("F", "000000")).not.toBeNull();
    expect(ddb.getDiagnostics()).toMatchObject({ status: "stale", entries: 120, failures: 1, stale: false });
  });

  it("recovers primary rich mode after a successful fallback", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("provider failure", { status: 500 }))
      .mockResolvedValueOnce(response([{ ...device, aircraft_type: undefined }]))
      .mockResolvedValueOnce(response([device]));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch });

    await ddb.refresh();
    await ddb.refresh();

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][0]).toBe(DEFAULT_OGN_DDB_URL);
    expect(ddb.getDiagnostics()).toMatchObject({ mode: "rich-json", fallbackCount: 1, fallbackUsed: false, aircraftTypeAvailable: true });
  });

  it("does not fall back after a rate limit and retains a usable old snapshot", async () => {
    let now = Date.parse("2026-09-10T12:00:00.000Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([device]))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers: { "Retry-After": "600" } }));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, now: () => now, failureRetryMs: 300_000 });

    await ddb.refresh();
    await ddb.refresh();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(DEFAULT_OGN_DDB_URL);
    expect(ddb.lookup("F", "8E20F0")).not.toBeNull();
    expect(ddb.getDiagnostics()).toMatchObject({ status: "stale", rateLimited: true, retryAfterMs: 600_000, nextRetryAt: null, fallbackCount: 0 });
    now += 600_000;
    expect(ddb.isUsable()).toBe(true);
  });

  it("fails closed without a snapshot when primary is rate limited", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, headers: { "Retry-After": "600" } }));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch });

    await ddb.refresh();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ddb.isUsable()).toBe(false);
    expect(ddb.getDiagnostics()).toMatchObject({ status: "offline", rateLimited: true, fallbackCount: 0 });
  });

  it("parses bounded Retry-After seconds and HTTP dates", () => {
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    expect(parseDdbRetryAfter("600", now)).toBe(600_000);
    expect(parseDdbRetryAfter("Thu, 10 Sep 2026 12:10:00 GMT", now)).toBe(600_000);
    expect(parseDdbRetryAfter("-1", now)).toBeNull();
    expect(parseDdbRetryAfter("not-a-date", now)).toBeNull();
    expect(parseDdbRetryAfter("999999999999", now)).toBeNull();
  });

  it("schedules the allowed retry and cancels it during shutdown", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, headers: { "Retry-After": "600" } }));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, failureRetryMs: 300_000 });
    ddb.start();
    await ddb.refresh();
    expect(ddb.getDiagnostics().nextRetryAt).not.toBeNull();
    const calls = fetcher.mock.calls.length;
    await ddb.stop();
    await vi.advanceTimersByTimeAsync(900_000);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it("does not immediately fall back after a network failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch });

    await ddb.refresh();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ddb.getDiagnostics()).toMatchObject({ status: "offline", fallbackCount: 0, rateLimited: false });
  });

  it("maps OGN address detail codes to DDB device types", () => {
    expect(ddbKey("f", "8e20f0")).toBe("F:8E20F0");
    expect(ddbDeviceTypeForAddressType(1)).toBe("I");
    expect(ddbDeviceTypeForAddressType(2)).toBe("F");
    expect(ddbDeviceTypeForAddressType(3)).toBe("O");
    expect(ddbDeviceTypeForAddressType(99)).toBeNull();
  });
});
