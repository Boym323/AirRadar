import { afterEach, describe, expect, it } from "vitest";
import { parseFpnCoordinate, parseRxwH1Fpn, RXW_FPN_MAX_TEXT_LENGTH } from "@/lib/server/rxw-fpn-parser";
import { RXW_WAYPOINT_PLAN_TTL_MS, RxwHubMessageStore } from "@/lib/server/rxw-hub-store";
import { createRxwFpnBadges, createRxwFpnRoute } from "@/lib/radar/rxw-fpn-visual";

const now = Date.UTC(2026, 9, 10, 12);
const planText = "FPN/FNCSA123/RP:DA:LKPR:AA:EGLL:F:BODAL,N50000E014000..SOMID,N51000E012000.J190..DENUT,N52000E010000..N53000E005000A1B2";
const message = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, station_id: "RXW", icao_hex: "4ca123", timestamp: now / 1000,
  flight: "CSA123", label: "H1", message_type: "VDL-M2",
  text: planText,
  ...extra,
});

afterEach(() => { delete process.env.RXW_FPN_ENABLED; });

describe("H1/FPN flight-plan parser", () => {
  it("reads millidegree coordinates, airway and route order without interpreting decimals as minutes", () => {
    expect(parseFpnCoordinate("N01234W123456")).toEqual({ lat: 1.234, lon: -123.456 });
    expect(parseFpnCoordinate("S90000E180000")).toEqual({ lat: -90, lon: 180 });
    expect(parseFpnCoordinate("N90001E090000")).toBeNull();
    const plan = parseRxwH1Fpn(planText, "CSA123");
    expect(plan).toMatchObject({ flight: "CSA123", status: "planned", origin: "LKPR", destination: "EGLL", positionedCount: 4 });
    expect(plan?.waypoints.map((p) => p.name)).toEqual(["BODAL", "SOMID", "DENUT", "N53000E005000"]);
    expect(plan?.waypoints[2]).toMatchObject({ lat: 52, lon: 10, via: "J190", breakBefore: false });
  });

  it("treats RI as inactive and avoids elevating a route identifier to waypoints", () => {
    const inactive = parseRxwH1Fpn("FPN/RI:DA:KEWR:AA:KDFW:F:FOO,N50000W088000..BAR,N51000W087000ABCD", "UAL123");
    expect(inactive?.status).toBe("inactive");
    expect(parseRxwH1Fpn("FPN/FNUAL123/RP:DA:KEWR:AA:KDFW:CR:EWRDFW01ABCD", null)).toBeNull();
  });

  it("rejects malformed, oversized, multipart, conflicting, unauthenticated and mismatched messages", () => {
    expect(parseRxwH1Fpn("secret", "CSA123")).toBeNull();
    expect(parseRxwH1Fpn("X".repeat(RXW_FPN_MAX_TEXT_LENGTH + 1), "CSA123")).toBeNull();
    expect(parseRxwH1Fpn(planText, "CSA999")).toBeNull();
    expect(parseRxwH1Fpn(planText.replace(":DA:LKPR", ":DA:ZZZZ"), "CSA123")).toBeNull();
    expect(parseRxwH1Fpn(planText.replace(":DA:LKPR", ":DA:EGLL"), "CSA123")).toBeNull();
    expect(parseRxwH1Fpn(planText.slice(0, -4), "CSA123")).toBeNull();
    expect(parseRxwH1Fpn("FPN/RI:DA:LKPR:AA:EGLL:F:ONLYABCD", "CSA123")).toBeNull();
  });

  it("keeps discontinuities and partial-geolocation separate", () => {
    const plan = parseRxwH1Fpn(
      "FPN/FNUAL123/RP:DA:KJFK:AA:EGLL:F:BETTE,N40000W070000..VECTOR..FOO,N41000W060000..BAR..BAZ,N42000W050000ABCD",
      "UAL123",
    );
    expect(plan?.waypoints.map((wp) => [wp.name, wp.breakBefore])).toEqual([
      ["BETTE", true], ["FOO", true], ["BAR", false], ["BAZ", false],
    ]);
    expect(plan?.positionedCount).toBe(3);
  });
});

describe("RXW FPN bounded in-memory identity and lifetime", () => {
  it("stores parsed-only plans and never publishes the ACARS body", () => {
    process.env.RXW_FPN_ENABLED = "true";
    const store = new RxwHubMessageStore();
    expect(store.ingest(message("fpl"), now)).toBe(true);
    const plan = store.waypointPlanForFlight("4CA123", "CSA123", now);
    expect(plan).toMatchObject({ icaoHex: "4CA123", flight: "CSA123", source: "rxw-acarshub", status: "planned", confidence: "reported" });
    expect(store.waypointPlanForFlight("4CA123", "CSA999", now)).toBeNull();
    expect(store.waypointPlanForFlight("4CA124", "CSA123", now)).toBeNull();
    expect(store.waypointAvailability(now)).toEqual([{ icaoHex: "4CA123", flight: "CSA123", waypointCount: 4 }]);
    expect(JSON.stringify(plan)).not.toContain("FPN/");
    expect(JSON.stringify(store.list("4CA123", now))).not.toContain("FPN/");
    expect(store.waypointPlanForFlight("4CA123", "CSA123", now + RXW_WAYPOINT_PLAN_TTL_MS + 1)).toBeNull();
    expect(store.waypointAvailability(now + RXW_WAYPOINT_PLAN_TTL_MS + 1)).toEqual([]);
  });

  it("requires H1 and explicit opt-in, never leaks a raw message", () => {
    const store = new RxwHubMessageStore();
    store.ingest(message("disabled"), now);
    expect(store.waypointAvailability(now)).toEqual([]);
    process.env.RXW_FPN_ENABLED = "true";
    store.ingest(message("wrong-label", { label: "Q0" }), now);
    store.ingest(message("wrong-flight", { text: planText, flight: "DLH111" }), now);
    expect(store.waypointAvailability(now)).toEqual([]);
  });

  it("a newer inactive report clears the active plan; older replay cannot replace it", () => {
    process.env.RXW_FPN_ENABLED = "true";
    const store = new RxwHubMessageStore();
    store.ingest(message("planned"), now);
    store.ingest(message("stale", { timestamp: (now - 90_000) / 1000, text: planText.replace("EGLL", "KJFK") }), now);
    expect(store.waypointPlanForFlight("4CA123", "CSA123", now)?.destination).toBe("EGLL");
    store.ingest(message("inactive", { timestamp: (now + 10_000) / 1000,
      text: "FPN/RI:DA:LKPR:AA:EGLL:F:BODAL,N50000E014000..SOMID,N51000E012000ABCD" }), now + 10_000);
    expect(store.waypointAvailability(now + 10_000)).toEqual([]);
  });
});

describe("RXW map display geometry", () => {
  it("badges only planes whose live ICAO24 and callsign match, with fresh ADS-B position", () => {
    const aircraft = new Map([["4CA123", { icaoHex: "4CA123", callsign: "CSA123", lat: 50, lon: 14, seenPosSeconds: 1 }]]);
    const valid = [{ icaoHex: "4CA123", flight: "CSA123", waypointCount: 4 }];
    expect(createRxwFpnBadges(aircraft, valid).features).toHaveLength(1);
    expect(createRxwFpnBadges(aircraft, [{ ...valid[0], flight: "CSA999" }]).features).toHaveLength(0);
    expect(createRxwFpnBadges(new Map([["4CA123", { ...aircraft.get("4CA123")!, seenPosSeconds: 999 }]]), valid).features).toHaveLength(0);
  });

  it("draws only consecutive georeferenced fixes, not inferred joins across missing coordinates", () => {
    const plan = parseRxwH1Fpn("FPN/FNCSA123/RP:DA:LKPR:AA:EGLL:F:AAA,N50000E014000..BBB,N51000E012000..CCC..DDD,N52000E010000ABCD", "CSA123");
    expect(plan).not.toBeNull();
    const geometry = createRxwFpnRoute({ ...plan!, icaoHex: "4CA123", stationId: "RXW", observedAt: new Date(now).toISOString(), source: "rxw-acarshub", confidence: "reported" });
    const lines = geometry.features.filter(f => f.geometry.type === "LineString");
    expect(lines).toHaveLength(1);
    expect(lines[0].geometry).toMatchObject({ type: "LineString", coordinates: [[14, 50], [12, 51]] });
    expect(createRxwFpnRoute(null).features).toHaveLength(0);
  });
});
