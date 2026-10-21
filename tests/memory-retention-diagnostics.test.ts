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
      
      atcResolutionKeys: new Map([["ABC123", "key"]]),
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
    expect(result.auxiliaryMaps.predictiveEvaluatedAt).toBe(0);
  });
  it("reads each source only once while retaining independent aircraft and trail age windows", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    class CountingMap extends Map<string, Aircraft> {
      reads = 0;
      override values(): MapIterator<Aircraft> {
        this.reads += 1;
        return super.values();
      }
    }
    const local = new CountingMap([["A", aircraft("2026-10-10T11:56:00.000Z", [
      "2026-10-10T11:52:00.000Z", "2026-10-10T11:58:00.000Z",
    ])]]);
    const network = new CountingMap([["B", aircraft("2026-10-10T11:52:00.000Z", [
      "2026-10-10T11:52:00.000Z", "invalid-timestamp",
    ])]]);
    const empty = new Map<string, unknown>();
    const result = getMemoryRetentionDiagnostics({
      localAircraft: local,
      networkAircraft: network,
      localStaleAfterMs: 5 * 60_000,
      networkStaleAfterMs: 10 * 60_000,
      networkTrailMaxAgeMs: 5 * 60_000,
      sourcePreferences: empty,
      sourcePreferenceMissingSince: empty,
      lastHistorySample: empty,
      
      atcResolutionKeys: empty,
      snapshotCacheEntries: 0,
      listeners: 0,
      now,
    });
    expect(local.reads).toBe(1);
    expect(network.reads).toBe(1);
    expect(result.aircraft.local).toEqual({
      count: 1, oldestObservedAt: "2026-10-10T11:56:00.000Z",
      oldestAgeMs: 4 * 60_000, staleRetained: 0,
    });
    expect(result.trails.local).toEqual({
      count: 2, points: 2, maxPointsPerAircraft: 2,
      oldestObservedAt: "2026-10-10T11:52:00.000Z",
      oldestAgeMs: 8 * 60_000, staleRetained: 1,
    });
    expect(result.aircraft.network.staleRetained).toBe(0);
    expect(result.trails.network.staleRetained).toBe(1);
    expect(result.trails.network.points).toBe(2);
  });

  it("continues accounting for trails when the aircraft timestamp is invalid", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    const empty = new Map<string, unknown>();
    const result = getMemoryRetentionDiagnostics({
      localAircraft: new Map([["A", aircraft("not-a-date", ["2026-10-10T11:30:00.000Z"])]]),
      networkAircraft: new Map(),
      localStaleAfterMs: 5 * 60_000,
      networkStaleAfterMs: 5 * 60_000,
      networkTrailMaxAgeMs: 5 * 60_000,
      sourcePreferences: empty,
      sourcePreferenceMissingSince: empty,
      lastHistorySample: empty,
      
      atcResolutionKeys: empty,
      snapshotCacheEntries: 0,
      listeners: 0,
      now,
    });
    expect(result.aircraft.local).toEqual({
      count: 1, oldestObservedAt: null, oldestAgeMs: null, staleRetained: 0,
    });
    expect(result.trails.local.points).toBe(1);
    expect(result.trails.local.staleRetained).toBe(1);
    expect(result.trails.network).toEqual({
      count: 0, points: 0, maxPointsPerAircraft: 0,
      oldestObservedAt: null, oldestAgeMs: null, staleRetained: 0,
    });
  });

  it("returns optional trail-limit counts without altering the underlying retention summaries", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    const empty = new Map<string, unknown>();
    const local = new Map([
      ["A", aircraft("2026-10-10T11:59:00.000Z", ["2026-10-10T11:59:00.000Z", "2026-10-10T11:59:30.000Z"])],
      ["B", aircraft("2026-10-10T11:59:00.000Z", ["2026-10-10T11:59:00.000Z"])],
    ]);
    const input = {
      localAircraft: local,
      networkAircraft: new Map([["C", aircraft("2026-10-10T11:59:00.000Z", ["2026-10-10T11:59:00.000Z"])]]),
      localStaleAfterMs: 60_000, networkStaleAfterMs: 60_000,
      networkTrailMaxAgeMs: 60_000,
      sourcePreferences: empty, sourcePreferenceMissingSince: empty,
      lastHistorySample: empty, 
      atcResolutionKeys: empty,
      snapshotCacheEntries: 0, listeners: 0, now,
    };
    const original = getMemoryRetentionDiagnostics(input);
    const withLimits = getMemoryRetentionDiagnostics({
      ...input,
      localTrailLimitPoints: 1,
      networkTrailLimitPoints: 1,
    });
    expect(withLimits.limitCounters).toEqual({
      local: { atLimitAircraftCount: 1, overLimitAircraftCount: 1 },
      network: { atLimitAircraftCount: 1, overLimitAircraftCount: 0 },
    });
    const { limitCounters, ...unchanged } = withLimits;
    expect(unchanged).toEqual(original);
    expect(limitCounters).toBeDefined();
  });

});
