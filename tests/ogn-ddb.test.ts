import { describe, expect, it, vi } from "vitest";
import { OgnDdb, ddbKey, ddbDeviceTypeForAddressType } from "@/lib/ogn/ddb";

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

describe("OGN DDB refresh", () => {
  it("loads the documented device schema and swaps the index atomically", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response([device]))
      .mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, refreshMs: 60_000, maxStaleMs: 86_400_000 });

    await ddb.refresh();
    expect(ddb.lookup("F", "8e20f0")).toMatchObject({ deviceType: "F", deviceId: "8E20F0", registration: "OK-TEST", tracked: "Y", identified: "Y" });
    expect(ddb.isUsable()).toBe(true);
    await ddb.refresh();
    expect(ddb.lookup("F", "8E20F0")?.registration).toBe("OK-TEST");
    expect(ddb.getDiagnostics()).toMatchObject({ status: "stale", entries: 1, failures: 1, stale: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed, oversized, and empty snapshots without creating a usable index", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ ...device, device_id: "bad" }]));
    const ddb = new OgnDdb({ fetcher: fetcher as unknown as typeof fetch, maxBytes: 1024 });
    await ddb.refresh();
    expect(ddb.isUsable()).toBe(false);
    expect(ddb.getDiagnostics()).toMatchObject({ status: "offline", entries: 0, failures: 1, stale: true });

    const empty = new OgnDdb({ fetcher: vi.fn().mockResolvedValue(response([])) as unknown as typeof fetch });
    await empty.refresh();
    expect(empty.getDiagnostics().status).toBe("offline");
  });

  it("maps OGN address detail codes to DDB device types", () => {
    expect(ddbKey("f", "8e20f0")).toBe("F:8E20F0");
    expect(ddbDeviceTypeForAddressType(1)).toBe("I");
    expect(ddbDeviceTypeForAddressType(2)).toBe("F");
    expect(ddbDeviceTypeForAddressType(3)).toBe("O");
    expect(ddbDeviceTypeForAddressType(99)).toBeNull();
  });
});
