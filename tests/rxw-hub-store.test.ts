import { describe, expect, it, vi } from "vitest";
import {
  RXW_MAX_AIRCRAFT,
  RXW_MAX_MESSAGES_PER_AIRCRAFT,
  RXW_MAX_SEEN_UIDS,
  RXW_MESSAGE_TTL_MS,
  RxwHubMessageStore,
  normalizeRxwCommunication,
  rxwIcaoHex,
} from "@/lib/server/rxw-hub-store";

const now = Date.UTC(2026, 9, 10, 12);
const message = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, icao_hex: "4ca123", timestamp: now / 1000, station_id: "RXW-1",
  message_type: "VDL-M2", freq: 136.975, label: "H1",
  text: "PRIVATE MESSAGE SHOULD NOT BE EXPOSED",
  decodedText: { formatted: [{ label: "Private", value: "secret" }] },
  ...extra,
  it("keeps legacy RXW_FPN_ENABLED inert and never decodes ACARS message bodies", () => {
    process.env.RXW_FPN_ENABLED = "true";
    try {
      const store = new RxwHubMessageStore();
      const callback = vi.fn();
      const raw = message("fpn-retired", {
        label: "H1",
        flight: "CSA123",
        depa: "LKPR",
        dsta: "EGLL",
        text: "FPN/FNCSA123/RP:DA:LKPR:AA:EGLL:F:FOO,N50000E014000..BAR,N51000E012000ABCD",
      });
      expect(store.ingest(raw, now, callback)).toBe(true);
      expect(callback).toHaveBeenCalledOnce();
      expect(callback.mock.calls[0]?.[1]).toBeNull();
      expect(JSON.stringify(store.list("4CA123", now))).not.toContain("FPN/");
      expect(store.stats()).not.toHaveProperty("plans");
    } finally {
      delete process.env.RXW_FPN_ENABLED;
    }
  });

});

describe("RXW metadata normalization", () => {
  it("normalizes exact ICAO24 hex or numeric address, never a non-ICAO address", () => {
    expect(rxwIcaoHex({ icao_hex: "4ca123" })).toBe("4CA123");
    expect(rxwIcaoHex({ icao: 0x4ca123 })).toBe("4CA123");
    expect(rxwIcaoHex({ icao_hex: "~4ca123" })).toBeNull();
    expect(rxwIcaoHex({ tail: "OK-ABC", flight: "CSA123" })).toBeNull();
  });

  it("retains public technical fields but strips message bodies and decoded payload", () => {
    const result = normalizeRxwCommunication(message("abc"), now);
    expect(result).toMatchObject({
      uid: "abc", icaoHex: "4CA123", protocol: "VDL-M2",
      stationId: "RXW-1", frequencyMhz: 136.975, label: "H1",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("decodedText");
  });

  it("rejects invalid timestamps, identifiers and malformed payloads", () => {
    expect(normalizeRxwCommunication(null, now)).toBeNull();
    expect(normalizeRxwCommunication(message("old", { timestamp: (now - RXW_MESSAGE_TTL_MS - 1) / 1000 }), now)).toBeNull();
    expect(normalizeRxwCommunication(message("future", { timestamp: (now + 6 * 60_000) / 1000 }), now)).toBeNull();
    expect(normalizeRxwCommunication(message("wrong", { icao_hex: "~123456" }), now)).toBeNull();
    expect(normalizeRxwCommunication(message("", {}), now)).toBeNull();
  });
});

describe("RXW bounded cache", () => {
  it("deduplicates reconnect batches, sorts by timestamp and expires entries", () => {
    const store = new RxwHubMessageStore();
    expect(store.ingest(message("first"), now)).toBe(true);
    expect(store.ingest(message("first"), now)).toBe(false);
    expect(store.ingest(message("second", { timestamp: (now - 60_000) / 1000 }), now)).toBe(true);
    expect(store.list("4CA123", now).map((item) => item.uid)).toEqual(["first", "second"]);
    expect(store.stats()).toMatchObject({ accepted: 2, rejectedDuplicate: 1, rejectedInvalid: 0 });
    expect(store.ingest(null, now)).toBe(false);
    expect(store.stats().rejectedInvalid).toBe(1);
    expect(store.list("4CA123", now + RXW_MESSAGE_TTL_MS + 1)).toEqual([]);
  });

  it("limits both per-aircraft messages and total aircraft", () => {
    const store = new RxwHubMessageStore();
    for (let i = 0; i < RXW_MAX_MESSAGES_PER_AIRCRAFT + 5; i++) {
      store.ingest(message("m" + i), now);
    }
    expect(store.list("4CA123", now)).toHaveLength(RXW_MAX_MESSAGES_PER_AIRCRAFT);
    for (let i = 0; i < RXW_MAX_AIRCRAFT + 10; i++) {
      store.ingest(message("n" + i, { icao_hex: i.toString(16).padStart(6, "0") }), now);
    }
    expect(store.stats().aircraft).toBeLessThanOrEqual(RXW_MAX_AIRCRAFT);
  });

  it("never grows the deduplication index without bound", () => {
    const store = new RxwHubMessageStore();
    for (let i = 0; i < RXW_MAX_SEEN_UIDS + 20; i++) {
      store.ingest(message("uid" + i), now);
    }
    expect(store.stats().uids).toBeLessThanOrEqual(RXW_MAX_SEEN_UIDS);
  });
});
