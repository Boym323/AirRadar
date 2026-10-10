import { describe, expect, it } from "vitest";
import { getMemoryRetentionDiagnostics } from "@/lib/server/memory-retention-diagnostics";
import type { Aircraft } from "@/lib/aircraft/types";

function aircraft(lastSeen: string, trail: string[] = []): Aircraft {
  return {
    icaoHex: "ABC123", callsign: null, registration: null, aircraftType: null,
    aircraftDescription: null, lat: 50, lon: 14, altitude: 10_000, baroAltitude: 10_000,
    geomAltitude: null, groundSpeed: 100, track: 90, verticalRate: 0, baroRate: null,
    squawk: null, category: null, emergency: null, rssi: null, messages: 1,
    seenSeconds: 0, seenPosSeconds: 0, lastSeen, source: "ADS-B", origin: "local",
    distanceKm: 1, bearing: 1, onGround: false, trail: trail.map((recordedAt) => ({
      lat: 50, lon: 14, recordedAt,
    })),
  } as Aircraft;
}

describe("memory retention diagnostics", () => {
  it("attributes retained aircraft, trail age, and auxiliary map sizes without changing limits", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    const result = getMemoryRetentionDiagnostics({
      localAircraft: new Map([["ABC123", aircraft("2026-10-10T11:59:00.000Z", ["2026-10-10T11:58:00.000Z"])]]),
      networkAircraft: new Map([["DEF456", aircraft("2026-10-10T11:40:00.000Z", ["2026-10-10T11:30:00.000Z"])]]),
      localStaleAfterMs: 5 * 60_000,
      networkStaleAfterMs: 10 * 60_000,
      networkTrailMaxAgeMs: 10 * 60_000,
      sourcePreferences: new Map([["ABC123", "local"]]),
      sourcePreferenceMissingSince: new Map([["DEF456", now - 1_000]]),
      lastHistorySample: new Map([["ABC123", now]]),
      predictiveEvaluatedAt: new Map(),
      atcResolutionKeys: new Map([["ABC123", "key"]]),
      atcShadowPredictionKeys: new Map(),
      snapshotCacheEntries: 2,
      listeners: 3,
      now,
    });

    expect(result.note).toContain("not a heap snapshot");
    expect(result.aircraft.local.count).toBe(1);
    expect(result.aircraft.local.staleRetained).toBe(0);
    expect(result.trails.network.points).toBe(1);
    expect(result.trails.network.staleRetained).toBe(1);
    expect(result.auxiliaryMaps.sourcePreferenceMissingSince).toBe(1);
    expect(result.snapshotCacheEntries).toBe(2);
  });
});
