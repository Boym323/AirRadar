import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchesAlertV1Matcher } from "@/lib/server/alerts-fleets-v1";
import { SPOTTER_ICONIC_AIRCRAFT_TYPES } from "@/lib/server/spotter-saved-spots";

describe("Spotter Saved Spots V1", () => {
  it("matches a fleet by canonical ICAO aircraft type", () => {
    const aircraft = {
      icaoHex: "8964A1",
      registration: "A6-EVK",
      callsign: "UAE139",
      aircraftType: "A388",
      enrichment: { metadata: { icaoTypeCode: "A388" } },
    } as never;
    expect(matchesAlertV1Matcher(aircraft, {
      id: "a380",
      enabled: true,
      type: "AIRCRAFT_TYPE",
      value: "A388",
    })).toBe(true);
    expect(matchesAlertV1Matcher(aircraft, {
      id: "b747",
      enabled: true,
      type: "AIRCRAFT_TYPE",
      value: "B744",
    })).toBe(false);
  });

  it("ships an intentionally narrow iconic default fleet", () => {
    expect(SPOTTER_ICONIC_AIRCRAFT_TYPES).toContain("A388");
    expect(SPOTTER_ICONIC_AIRCRAFT_TYPES).toContain("B744");
    expect(SPOTTER_ICONIC_AIRCRAFT_TYPES).toContain("B748");
    expect(SPOTTER_ICONIC_AIRCRAFT_TYPES).toContain("A124");
  });

  it("requires explicit browser POST before observer coordinates are persisted", () => {
    const component = readFileSync(new URL("../components/mobile-spotter-mode.tsx", import.meta.url), "utf8");
    const route = readFileSync(new URL("../app/api/admin/spotter/saved-spots/route.ts", import.meta.url), "utf8");
    expect(component).toContain('fetch("/api/admin/spotter/saved-spots", {');
    expect(component).toContain('method: "POST"');
    expect(component).toContain("centerLat: observer.lat");
    expect(component).toContain("centerLon: observer.lon");
    expect(route).toContain("requireWatchlistMutation");
  });

  it("keeps the legacy geofence notification lane target-aware", () => {
    const engine = readFileSync(new URL("../lib/server/alert-engine.ts", import.meta.url), "utf8");
    expect(engine).toContain("ruleTargetMatches(rule, aircraft, config.fleets)");
    expect(engine).toContain("matchingEnterRules.length");
  });
});
