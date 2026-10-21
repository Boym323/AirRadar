import { afterEach, describe, expect, it } from "vitest";
import { RxwHubMessageStore, normalizeRxwCommunication } from "@/lib/server/rxw-hub-store";
import type { RxwWaypointPlan } from "@/lib/aircraft/rxw-communications";
import {
  buildRxwRouteSnapshot, decodeRxwRouteSnapshot,
  isRxwRouteHistoryEnabled, rxwRouteRetentionDays,
} from "@/lib/server/rxw-route-history";

const now = Date.UTC(2026, 9, 15, 12);
const fpn = "FPN/FNCSA123/RP:DA:LKPR:AA:EGLL:F:BODAL,N50000E014000..SOMID,N51000E012000ABCD";
const message = (uid: string, extras: Record<string, unknown> = {}) => ({
  uid, station_id: "RXW", icao_hex: "4ca123", timestamp: now / 1000,
  message_type: "VDL-M2", label: "H1", flight: "CSA123",
  depa: "LKPR", dsta: "EGLL", eta: "1445",
  text: fpn, decodedText: { secret: "never persisted" },
  ...extras,
});
afterEach(() => {
  delete process.env.RXW_ROUTE_HISTORY_ENABLED;
  delete process.env.RXW_HUB_ENABLED;
  delete process.env.RXW_ROUTE_HISTORY_RETENTION_DAYS;
});

describe("parsed-only ACARS/VDL2 route archive", () => {
  it("requires explicit hub and history opt-ins and bounds retention", () => {
    process.env.RXW_ROUTE_HISTORY_ENABLED = "true";
    expect(isRxwRouteHistoryEnabled()).toBe(false);
    process.env.RXW_HUB_ENABLED = "true";
    expect(isRxwRouteHistoryEnabled()).toBe(true);
    process.env.RXW_ROUTE_HISTORY_RETENTION_DAYS = "999";
    expect(rxwRouteRetentionDays()).toBe(30);
    process.env.RXW_ROUTE_HISTORY_RETENTION_DAYS = "7";
    expect(rxwRouteRetentionDays()).toBe(7);
  });

  it("continues to decode previously archived FPN snapshots without ingest-time parsing", () => {
    const incoming = normalizeRxwCommunication(message("one"), now);
    expect(incoming).not.toBeNull();
    const legacyPlan: RxwWaypointPlan = {
      icaoHex: "4CA123", flight: "CSA123", origin: "LKPR", destination: "EGLL",
      status: "planned", positionedCount: 2,
      waypoints: [
        { name: "BODAL", lat: 50, lon: 14, via: null, breakBefore: true },
        { name: "SOMID", lat: 51, lon: 12, via: null, breakBefore: false },
      ],
      observedAt: new Date(now).toISOString(), stationId: "RXW",
      source: "rxw-acarshub", confidence: "reported",
    };
    const snapshot = buildRxwRouteSnapshot(incoming!, legacyPlan);
    expect(snapshot).toMatchObject({
      icaoHex: "4CA123", flight: "CSA123", kind: "FPN",
      origin: "LKPR", destination: "EGLL", positionedCount: 2,
    });
    expect(decodeRxwRouteSnapshot(snapshot)?.waypoints.map(p => p.name)).toEqual(["BODAL", "SOMID"]);
    expect(JSON.stringify(snapshot)).not.toContain("FPN/");
    expect(JSON.stringify(snapshot)).not.toContain("never persisted");
    expect(JSON.stringify(snapshot)).not.toContain('"uid"');
    expect(JSON.stringify(snapshot)).not.toContain('"text"');
    expect(snapshot?.id).toHaveLength(64);
  });

  it("archives structured airport pairs when no FPN is available", () => {
    const store = new RxwHubMessageStore();
    let snapshot: ReturnType<typeof buildRxwRouteSnapshot> = null;
    store.ingest(message("two", { label: "Q0", text: "private" }), now, (m, p) => {
      snapshot = buildRxwRouteSnapshot(m, p);
    });
    expect(snapshot).toMatchObject({ kind: "AIRPORT_PAIR", positionedCount: 0, etaUtc: "14:45Z" });
    expect(decodeRxwRouteSnapshot(snapshot)?.waypoints).toEqual([]);
  });

  it("never accepts a different callsign, invalid geometry, or forged JSON", () => {
    const store = new RxwHubMessageStore();
    let snapshot: ReturnType<typeof buildRxwRouteSnapshot> = null;
    store.ingest(message("three"), now, (m, p) => { snapshot = buildRxwRouteSnapshot(m, p); });
    expect(snapshot).not.toBeNull();
    expect(decodeRxwRouteSnapshot({ ...snapshot!, waypointsJson: '[{"text":"secret"}]' })).toBeNull();
    expect(decodeRxwRouteSnapshot({ ...snapshot!, flight: "CS-A123" })).toBeNull();
    expect(decodeRxwRouteSnapshot({ ...snapshot!, icaoHex: "A-ABCD" })).toBeNull();
    expect(buildRxwRouteSnapshot({
      uid: "wrong", stationId: "RXW", icaoHex: "4CA123", timestamp: new Date(now).toISOString(),
      protocol: "VDL-M2", frequencyMhz: null, label: null, reportedRoute: { origin: "LKPR", destination: "EGLL", flight: "CSA123", etaUtc: null },
    }, { icaoHex: "4CA124", flight: "CSA123", origin: "LKPR", destination: "EGLL",
      status: "planned", waypoints: [], positionedCount: 0, observedAt: new Date(now).toISOString(),
      stationId: "RXW", source: "rxw-acarshub", confidence: "reported" })).toBeNull();
  });
});
