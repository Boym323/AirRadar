import { describe, expect, it } from "vitest";
import {
  RXW_ROUTE_HINT_TTL_MS,
  RxwHubMessageStore,
  normalizeRxwCommunication,
  parseRxwReportedRoute,
  rxwAirportCode,
  rxwEtaUtc,
  selectRxwRouteEvidence,
} from "@/lib/server/rxw-hub-store";

const now = Date.UTC(2026, 9, 10, 12, 0, 0);
const message = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, icao_hex: "4ca123", timestamp: now / 1000, station_id: "RXW-1",
  message_type: "VDL-M2", freq: 136.975, label: "H1",
  flight: "CSA123", depa: "LKPR", dsta: "LZIB", eta: "1420",
  text: "PERSONAL/PRIVATE MESSAGE BODY MUST NOT LEAK",
  decodedText: { formatted: [{ label: "Secret", value: "personal" }] },
  libacars: { content: "sensitive" },
  ...extra,
});

describe("RXW structured route parser", () => {
  it("normalizes complete ICAO or IATA airport pairs from structured fields only", () => {
    expect(parseRxwReportedRoute(message("A"))).toEqual({
      origin: "LKPR", destination: "LZIB", etaUtc: "14:20Z", flight: "CSA123",
    });
    expect(parseRxwReportedRoute(message("B", { depa: "prg", dsta: "vie", eta: "14:20Z", flight: " csa123 " }))).toEqual({
      origin: "PRG", destination: "VIE", etaUtc: "14:20Z", flight: "CSA123",
    });
    expect(rxwAirportCode("ZZZZ")).toBeNull();
    expect(rxwAirportCode("LZIB")).toBe("LZIB");
    expect(rxwEtaUtc("2359")).toBe("23:59Z");
    expect(rxwEtaUtc("24:10")).toBeNull();
    expect(rxwEtaUtc("2026-10-10")).toBeNull();
  });

  it("never infers route from free text, partial fields, placeholders or equal airports", () => {
    expect(parseRxwReportedRoute(message("A", { depa: null, text: "LKPR LZIB" }))).toBeNull();
    expect(parseRxwReportedRoute(message("A", { dsta: "ZZZZ" }))).toBeNull();
    expect(parseRxwReportedRoute(message("A", { dsta: "LKPR" }))).toBeNull();
    expect(parseRxwReportedRoute(message("A", { depa: "LKPR <script>" }))).toBeNull();
    expect(parseRxwReportedRoute(message("A", { depa: "???" }))).toBeNull();
    expect(parseRxwReportedRoute(message("A", { depa: "LKPR", dsta: undefined }))).toBeNull();
  });

  it("exposes only bounded route metadata; never raw text, decoded content or coordinates", () => {
    const normalized = normalizeRxwCommunication(message("A"), now);
    expect(normalized?.reportedRoute?.etaUtc).toBe("14:20Z");
    expect(normalized?.reportedRoute?.flight).toBe("CSA123");
    expect(JSON.stringify(normalized)).not.toContain("PRIVATE");
    expect(JSON.stringify(normalized)).not.toContain("personal");
    expect(JSON.stringify(normalized)).not.toContain("libacars");
    expect(JSON.stringify(normalized)).not.toContain("decodedText");
  });
});

describe("RXW flight-specific route evidence", () => {
  it("matches both ICAO24 and callsign; a generic airframe report is not a verified active flight", () => {
    const entries = [
      normalizeRxwCommunication(message("one"), now)!,
      normalizeRxwCommunication(message("two", { icao_hex: "4ca124", flight: "CSA123" }), now)!,
      normalizeRxwCommunication(message("three", { flight: "CSA456" }), now)!,
    ];
    expect(selectRxwRouteEvidence(entries, "4CA123", "CSA123", now)).toMatchObject({
      origin: "LKPR", destination: "LZIB", etaUtc: "14:20Z", flight: "CSA123",
      icaoHex: "4CA123", source: "rxw-acarshub", confidence: "reported", stationId: "RXW-1",
    });
    expect(selectRxwRouteEvidence(entries, "4CA123", "CSA999", now)).toBeNull();
    expect(selectRxwRouteEvidence(entries, "4CA124", "CSA456", now)).toBeNull();
    expect(selectRxwRouteEvidence(entries, "~4CA123", "CSA123", now)).toBeNull();
    const missingFlight = [normalizeRxwCommunication(message("no-flight", { flight: null }), now)!];
    expect(selectRxwRouteEvidence(missingFlight, "4CA123", "CSA123", now)).toBeNull();
  });

  it("does not merge origin and destination from different ACARS messages", () => {
    const store = new RxwHubMessageStore();
    expect(store.ingest(message("origin", { dsta: undefined }), now)).toBe(true);
    expect(store.ingest(message("destination", { depa: undefined }), now)).toBe(true);
    expect(store.routeForFlight("4CA123", "CSA123", now)).toBeNull();
  });

  it("picks newest matching evidence and expires route hints before metadata", () => {
    const store = new RxwHubMessageStore();
    store.ingest(message("old", { timestamp: (now - 30 * 60_000) / 1000, dsta: "LKTB" }), now);
    store.ingest(message("latest"), now);
    expect(store.routeForFlight("4CA123", "CSA123", now)?.destination).toBe("LZIB");
    expect(store.routeForFlight("4CA123", "CSA123", now + RXW_ROUTE_HINT_TTL_MS + 1)).toBeNull();
    expect(store.list("4CA123", now + RXW_ROUTE_HINT_TTL_MS + 1)).toHaveLength(2);
  });

  it("does not create a route if the message predates the current 45-minute flight window", () => {
    const old = normalizeRxwCommunication(message("old", { timestamp: (now - 60 * 60_000) / 1000 }), now)!;
    expect(old.reportedRoute).not.toBeNull();
    expect(selectRxwRouteEvidence([old], "4CA123", "CSA123", now)).toBeNull();
  });
});
