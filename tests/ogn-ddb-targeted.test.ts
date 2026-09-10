import { afterEach, describe, expect, it, vi } from "vitest";
import { OgnDdb } from "@/lib/ogn/ddb";

const device = (type: "F" | "I" | "O", id: string, overrides: Record<string, unknown> = {}) => ({
  device_type: type,
  device_id: id,
  aircraft_model: "ASW 20",
  registration: "OK-TEST",
  cn: "42",
  tracked: "Y",
  identified: "Y",
  aircraft_type: 1,
  ...overrides,
});

function response(devices: unknown[], status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ devices }), { status, headers: { "content-type": "application/json", ...headers } });
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

afterEach(() => vi.useRealTimers());

describe("OGN targeted DDB resolver", () => {
  it("does not request at startup and batches unique IDs while preserving exact device types", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([device("I", "ABCDEF")]));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, batchSize: 50, batchDelayMs: 0, minRequestIntervalMs: 0 });

    ddb.start();
    expect(fetcher).not.toHaveBeenCalled();
    ddb.ensure("F", "abcdef");
    ddb.ensure("I", "ABCDEF");
    ddb.ensure("F", "abcdef");
    await tick();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(fetcher.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/download/");
    expect(url.searchParams.get("j")).toBe("1");
    expect(url.searchParams.get("t")).toBe("1");
    expect(url.searchParams.get("device_id")).toBe("ABCDEF");
    expect(ddb.getResolution("I", "ABCDEF").status).toBe("found");
    expect(ddb.getResolution("F", "ABCDEF").status).toBe("missing");
    expect(ddb.getDiagnostics()).toMatchObject({ strategy: "targeted", mode: "targeted-rich-json", batchCount: 1, lastBatchSize: 2, negativeEntries: 1 });
    await ddb.stop();
  });

  it("treats an empty targeted response as missing, but keeps a failed batch unresolved", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(new Response("failure", { status: 500 }))
      .mockResolvedValueOnce(new Response("failure", { status: 500 }));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, batchDelayMs: 0, minRequestIntervalMs: 0, failureRetryMs: 600_000 });

    ddb.start();
    ddb.ensure("F", "ABCDEF");
    await tick();
    expect(ddb.getResolution("F", "ABCDEF").status).toBe("missing");

    ddb.ensure("F", "123456");
    await tick();
    expect(ddb.getResolution("F", "123456").status).toBe("unresolved");
    expect(ddb.getDiagnostics()).toMatchObject({ negativeEntries: 1, failedRequests: 1, pendingKeys: 1 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await ddb.stop();
  });

  it("does not convert 429 into a fallback or lose the queued key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, headers: { "Retry-After": "600" } }));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, batchDelayMs: 0, minRequestIntervalMs: 0, failureRetryMs: 0 });

    ddb.start();
    ddb.ensure("F", "ABCDEF");
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ddb.getDiagnostics()).toMatchObject({ rateLimited: true, pendingKeys: 1, retryAfterMs: 600_000 });
    await ddb.stop();
  });
});
