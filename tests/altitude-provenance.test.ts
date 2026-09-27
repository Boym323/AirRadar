import { afterEach, describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { getAltitudeDiagnostics, resetAltitudeDiagnosticsForTests, selectAircraftAltitude } from "@/lib/aircraft/altitude-provenance";

const base = (icaoHex = "ABC123"): Aircraft => ({
  icaoHex, callsign: null, registration: null, aircraftType: null, aircraftDescription: null,
  lat: 50, lon: 14, altitude: 40_000, baroAltitude: 40_000, geomAltitude: null,
  groundSpeed: 400, track: 90, verticalRate: 0, baroRate: 0, geomRate: null, squawk: null,
  category: null, emergency: null, rssi: null, messages: 1, seenSeconds: 0, seenPosSeconds: 0,
  lastSeen: "2026-09-27T12:00:00.000Z", source: "ADS-B", origin: "local", sourceType: "df17",
  onGround: false, distanceKm: 1, bearing: 0, trail: [], observationTimes: {
    altitude: Date.parse("2026-09-27T12:00:00.000Z"), baroAltitude: Date.parse("2026-09-27T12:00:00.000Z"), geomAltitude: null,
    groundSpeed: null, track: null, verticalRate: null,
  }, provenance: { seenLocal: true, seenNetwork: false, lastLocalSeen: "2026-09-27T12:00:00.000Z", lastNetworkSeen: null, positionOrigin: "local", positionSource: "ADS-B", fields: {
    altitude: { origin: "local", protocol: "beast-mode-s", df: 17, tc: 11, observedAt: "2026-09-27T12:00:00.000Z", confidence: "high" },
  } },
});

afterEach(() => resetAltitudeDiagnosticsForTests());

describe("altitude provenance policy", () => {
  it("prefers fresh Beast over fresh readsb JSON", () => {
    const beast = base();
    const json = base(); json.sourceType = "adsb_icao"; json.provenance!.fields = { altitude: { origin: "local", protocol: "readsb-json", observedAt: "2026-09-27T12:00:00.000Z", confidence: "high" } };
    const decision = selectAircraftAltitude("ABC123", beast, json, Date.parse("2026-09-27T12:00:01.000Z"));
    expect(decision.selected).toMatchObject({ source: "LOCAL_BEAST", valueFt: 40_000 });
  });

  it("uses fresh JSON when Beast is stale", () => {
    const beast = base();
    beast.lastSeen = "2026-09-27T11:59:00.000Z";
    beast.provenance!.fields!.altitude!.observedAt = beast.lastSeen;
    const json = base(); json.sourceType = "adsb_icao"; json.provenance!.fields = { altitude: { origin: "local", protocol: "readsb-json", observedAt: "2026-09-27T12:00:00.000Z", confidence: "high" } };
    expect(selectAircraftAltitude("ABC123", beast, json, Date.parse("2026-09-27T12:00:20.000Z")).selected?.source).toBe("READSB_JSON");
  });

  it("records a bounded disagreement anomaly and keeps the corroborated value", () => {
    const beast = base(); beast.altitude = 40_000;
    const network = { ...base(), origin: "adsblol" as const, sourceType: "adsb_icao", altitude: 90_000, baroAltitude: 90_000, provenance: { ...base().provenance!, seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: base().lastSeen, fields: { altitude: { origin: "adsblol" as const, protocol: "sbs" as const, observedAt: base().lastSeen, confidence: "high" as const } } } };
    const decision = selectAircraftAltitude("ABC123", beast, network, Date.parse("2026-09-27T12:00:01.000Z"));
    expect(decision.anomaly).toBe("DISAGREEMENT");
    expect(decision.selected?.valueFt).toBe(40_000);
    expect(getAltitudeDiagnostics().counters.altitudeAnomalies).toBe(1);
  });

  it("rejects an impossible same-source temporal jump but allows a first high observation", () => {
    const first = base(); first.altitude = 90_000; first.baroAltitude = 90_000;
    const second = { ...base(), altitude: 40_000, baroAltitude: 40_000, lastSeen: "2026-09-27T12:00:05.000Z", provenance: { ...base().provenance!, fields: { altitude: { ...base().provenance!.fields!.altitude!, observedAt: "2026-09-27T12:00:05.000Z" } } } };
    const firstDecision = selectAircraftAltitude("FIRST1", first, undefined, Date.parse("2026-09-27T12:00:00.000Z"));
    const secondDecision = selectAircraftAltitude("FIRST1", second, undefined, Date.parse("2026-09-27T12:00:05.000Z"));
    expect(firstDecision.selected?.valueFt).toBe(90_000);
    expect(secondDecision.reason).toBe("IMPLAUSIBLE_JUMP_REJECTED");
    expect(secondDecision.selected?.valueFt).toBe(90_000);
  });
});
