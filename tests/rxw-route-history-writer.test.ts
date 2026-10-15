import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeRxwCommunication } from "@/lib/server/rxw-hub-store";
import { buildRxwRouteSnapshot, listHistoricalRxwRoutes, RxwRouteHistoryWriter } from "@/lib/server/rxw-route-history";

const mockDb = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/server/db", () => ({
  getPrisma: () => ({
    runtime: () => mockDb,
    raw: { sql: (strings: TemplateStringsArray, ...params: unknown[]) => {
      const request = { text: strings.join("?"), params };
      return {
        affectedCount: () => ({ build: () => request }),
        returnsRow: () => ({ build: () => request }),
      };
    } },
  }),
}));

const NOW = Date.UTC(2026, 9, 15, 12);
function communication(id: string, extra: Record<string, unknown> = {}) {
  const raw = {
    uid: id, station_id: "RXW", icao_hex: "4ca123", timestamp: NOW / 1000,
    message_type: "VDL-M2", flight: "CSA123",
    depa: "LKPR", dsta: "EGLL", eta: "1445", ...extra,
  };
  const parsed = normalizeRxwCommunication(raw, Number(raw.timestamp) * 1000);
  if (!parsed) throw new Error("test communication invalid");
  return parsed;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.RXW_HUB_ENABLED = "true";
  process.env.RXW_ROUTE_HISTORY_ENABLED = "true";
  mockDb.execute.mockReset().mockResolvedValue(undefined);
  mockDb.query.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.RXW_HUB_ENABLED;
  delete process.env.RXW_ROUTE_HISTORY_ENABLED;
});

describe("RXW route history writer backpressure and query", () => {
  it("coalesces semantically identical retransmissions, even with different UIDs", async () => {
    const writer = new RxwRouteHistoryWriter();
    const one = communication("uid-one");
    const two = communication("uid-two", { timestamp: (NOW + 30_000) / 1000 });
    expect(buildRxwRouteSnapshot(one, null)?.id).toBe(buildRxwRouteSnapshot(two, null)?.id);
    writer.enqueue(one, null);
    writer.enqueue(two, null);
    expect(writer.diagnostics()).toMatchObject({ accepted: 1, deduplicated: 1, pending: 1 });
    await writer.flush();
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    expect(writer.diagnostics()).toMatchObject({ pending: 0, written: 1 });
    writer.enqueue(two, null);
    expect(writer.diagnostics()).toMatchObject({ deduplicated: 2, pending: 0 });
    const changed = communication("changed", { dsta: "LZIB" });
    writer.enqueue(changed, null);
    expect(writer.diagnostics()).toMatchObject({ accepted: 2, pending: 1 });
  });

  it("creates another snapshot in the next bucket; raw UID is absent from persisted payload", () => {
    const first = buildRxwRouteSnapshot(communication("one"), null);
    const later = buildRxwRouteSnapshot(
      communication("other", { timestamp: (NOW + 11 * 60_000) / 1000 }), null,
    );
    expect(first?.id).not.toBe(later?.id);
    expect(JSON.stringify(first)).not.toContain("one");
    expect(JSON.stringify(first)).not.toContain('"uid"');
  });

  it("keeps a failed batch and retries with backoff, without dropping it", async () => {
    mockDb.execute.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const writer = new RxwRouteHistoryWriter();
    writer.enqueue(communication("one"), null);
    await writer.flush();
    expect(writer.diagnostics()).toMatchObject({ failures: 1, dropped: 0, pending: 1, inFlight: 0 });
    await writer.flush();
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 5001);
    await writer.flush();
    expect(mockDb.execute).toHaveBeenCalledTimes(2);
    expect(writer.diagnostics()).toMatchObject({ written: 1, dropped: 0, pending: 0, retryAfterAt: null });
  });

  it("bounds queue plus in-flight rows and batches writes into at most 32 rows", async () => {
    const writer = new RxwRouteHistoryWriter();
    for (let i = 0; i < 275; i++) {
      writer.enqueue(communication(String(i), { icao_hex: (0x400000 + i).toString(16) }), null);
    }
    expect(writer.diagnostics()).toMatchObject({ accepted: 256, dropped: 19, pending: 256 });
    await writer.flush();
    expect(writer.diagnostics()).toMatchObject({ written: 32, pending: 224 });
    const query = mockDb.execute.mock.calls[0]![0] as { text: string; params: unknown[] };
    const batch = JSON.parse(String(query.params[0])) as unknown[];
    expect(batch).toHaveLength(32);
    expect(query.text).toContain("ON CONFLICT");
  });

  it("drains multiple batches before a graceful DB shutdown", async () => {
    const writer = new RxwRouteHistoryWriter();
    for (let i = 0; i < 70; i++) {
      writer.enqueue(communication(String(i), { icao_hex: (0x400000 + i).toString(16) }), null);
    }
    await writer.drainForShutdown();
    expect(writer.diagnostics()).toMatchObject({ pending: 0, written: 70 });
    expect(mockDb.execute).toHaveBeenCalledTimes(3);
  });

  it("uses indexed typed fields without a server-side JSON object roundtrip", async () => {
    const data = buildRxwRouteSnapshot(communication("row"), null)!;
    mockDb.query.mockResolvedValue([data]);
    const routes = await listHistoricalRxwRoutes({
      icaoHex: "4CA123", callsign: "CSA123",
      startTime: new Date(NOW - 1_000).toISOString(),
      lastSeenAt: new Date(NOW + 1000).toISOString(), endTime: null,
    });
    expect(routes).toMatchObject([{ origin: "LKPR", destination: "EGLL", kind: "AIRPORT_PAIR" }]);
    const request = mockDb.query.mock.calls[0]![0] as { text: string; params: unknown[] };
    expect(request.text).toContain('ORDER BY "observedAtMs" DESC');
    expect(request.text).not.toContain("json_build_object");
    expect(request.params).toContain("4CA123");
    expect(request.params).toContain("CSA123");
  });
});
