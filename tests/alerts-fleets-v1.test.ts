import { describe, expect, it } from "vitest";
import {
  AlertV1TransitionTracker,
  evaluateAlertV1,
  matchingAlertV1Fleets,
  occurrenceId,
  geofenceTransitionSourceKey,
  squawkTransitionSourceKey,
  signalMatchesRule,
  validateAlertV1Geofence,
  type AlertV1Config,
} from "@/lib/server/alerts-fleets-v1";

const aircraft = { icaoHex: "abc123", registration: " ok-abc ", callsign: "CSA123" };
const config: AlertV1Config = {
  fleets: [{ id: "cargo", name: "Cargo", enabled: true, matchers: [{ id: "m", enabled: true, type: "CALLSIGN_PREFIX", value: "csa" }] }],
  geofences: [],
  rules: [{ id: "landing", name: "Landings", enabled: true, target: { kind: "FLEET", fleetId: "cargo" }, trigger: "FLIGHT_EVENT", flightEventTypes: ["LANDING"], channels: ["IN_APP"] }],
};

describe("Alerts & Fleets V1 primitives", () => {
  it("normalizes matcher values and applies exact/prefix semantics", () => {
    expect(matchingAlertV1Fleets(aircraft, config.fleets)).toEqual(["cargo"]);
    expect(signalMatchesRule({ sourceType: "FLIGHT_EVENT", sourceKey: "42", trigger: "FLIGHT_EVENT", aircraft, occurredAt: "2026-10-02T00:00:00Z", flightEventId: "42", flightEventType: "LANDING" }, config.rules[0]!, config.fleets)).toBe(true);
  });

  it("creates deterministic, repeat-safe occurrences", () => {
    const signal = { sourceType: "FLIGHT_EVENT" as const, sourceKey: "42", trigger: "FLIGHT_EVENT" as const, aircraft, occurredAt: "2026-10-02T00:00:00Z", flightEventId: "42", flightEventType: "LANDING" as const };
    const first = evaluateAlertV1(signal, config);
    expect(first).toHaveLength(1);
    expect(first[0]!.id).toBe(occurrenceId("landing", "FLIGHT_EVENT", "42"));
    expect(evaluateAlertV1(signal, config, new Set([first[0]!.id]))).toEqual([]);
  });

  it("builds distinct, deterministic episode keys from canonical transitions", () => {
    expect(squawkTransitionSourceKey("abc123", null, "7700", "2026-10-02T00:00:01Z"))
      .toBe("squawk:ABC123:NON_SPECIAL->7700:2026-10-02T00:00:01Z");
    expect(squawkTransitionSourceKey("abc123", null, "7700", "2026-10-02T00:00:02Z"))
      .not.toBe(squawkTransitionSourceKey("abc123", null, "7700", "2026-10-02T00:00:01Z"));
    expect(geofenceTransitionSourceKey("abc123", "zlin", "ENTER", "2026-10-02T00:00:01Z"))
      .toBe("geofence:ABC123:zlin:ENTER:2026-10-02T00:00:01Z");
  });

  it("requires a meaningful squawk transition and ignores a restart baseline", () => {
    const tracker = new AlertV1TransitionTracker();
    tracker.observeSquawk("ABC123", "7700");
    tracker.beginBaseline();
    expect(tracker.observeSquawk("ABC123", "7700")).toBeNull();
    expect(tracker.observeSquawk("ABC123", "7000")).toEqual({ previous: "7700", current: null });
    expect(tracker.observeSquawk("ABC123", "7700")).toEqual({ previous: null, current: "7700" });
  });

  it("confirms geofence transitions over two observations and validates bounds", () => {
    const tracker = new AlertV1TransitionTracker();
    const geofence = { id: "zlin", name: "Zlin", centerLat: 49.2, centerLon: 17.6, radiusMeters: 10_000, enabled: true };
    tracker.observeGeofence("ABC123", geofence, 49.2, 17.6);
    tracker.beginBaseline();
    expect(tracker.observeGeofence("ABC123", geofence, 49.2, 17.6)).toBeNull();
    expect(tracker.observeGeofence("ABC123", geofence, 49.35, 17.6)).toBeNull();
    expect(tracker.observeGeofence("ABC123", geofence, 49.35, 17.6)?.transition).toBe("EXIT");
    expect(() => validateAlertV1Geofence({ centerLat: 91, centerLon: 0, radiusMeters: 1000 })).toThrow();
  });
});
