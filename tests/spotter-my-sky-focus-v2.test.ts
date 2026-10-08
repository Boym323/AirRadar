import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { buildMySkyFocus, selectMySkyFocus } from "@/lib/spotter-focus";
import type { SpotterObserverPosition } from "@/lib/spotter-location";

const observer: SpotterObserverPosition = {
  lat: 50, lon: 14, altitudeMeters: 250, accuracyMeters: 10, capturedAt: "2026-10-08T16:00:00Z",
};
function aircraft(hex: string, patch: Partial<AircraftView> = {}): AircraftView {
  return {
    icaoHex: hex, callsign: hex, registration: null, aircraftType: "A320", aircraftDescription: null,
    lat: 50.02, lon: 14, altitude: 8_000, baroAltitude: 8_000, geomAltitude: null,
    groundSpeed: 240, track: 180, verticalRate: 0, baroRate: 0, geomRate: null,
    squawk: null, category: null, emergency: null, rssi: null, messages: 12,
    seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-10-08T16:00:00Z",
    source: "ADS-B", origin: "local", sourceType: null, onGround: false,
    distanceKm: 400, bearing: 180, ...patch,
  };
}

describe("My Sky Focus V2", () => {
  it("ranks a nearby iconic aircraft ahead of ordinary traffic and explains its score", () => {
    const report = buildMySkyFocus([
      aircraft("AAA001", { lat: 50.05 }),
      aircraft("AAA002", { lat: 50.025, aircraftType: "A388" }),
    ], observer);
    expect(report.nearbyCount).toBe(2);
    expect(report.items[0]?.aircraft.icaoHex).toBe("AAA002");
    expect(report.items[0]?.interest.reasons.map(reason => reason.code)).toContain("iconic_type");
    expect(report.items[0]?.geometry.horizontalDistanceKm).toBeLessThan(5);
    expect(report.items[0]?.geometry.horizontalDistanceKm).not.toBe(400); // receiver distance is irrelevant
  });

  it("never presents network-only, missing-position or remote aircraft as local overhead", () => {
    const result = buildMySkyFocus([
      aircraft("NETWORK", { origin: "adsblol", lat: 50.001 }),
      aircraft("MISSING", { lat: null }),
      aircraft("REMOTE", { lat: 51.5, lon: 14 }),
      aircraft("LOCAL1", { lat: 50.001, lon: 14 }),
    ], observer);
    expect(result.items.map(item => item.aircraft.icaoHex)).toEqual(["LOCAL1"]);
    expect(result.items[0]?.kind).toBe("OVERHEAD");
  });

  it("deduplicates aircraft and bounds the focus list without losing total counts", () => {
    const local = Array.from({ length: 12 }, (_, i) => aircraft(i.toString().padStart(6, "0"), { lat: 50.01 + i * 0.002 }));
    const report = buildMySkyFocus([...local, local[0]!], observer, new Map(), null, 3);
    expect(report.items).toHaveLength(3);
    expect(report.nearbyCount).toBe(12);
    expect(report.items.map(item => item.aircraft.icaoHex)).toEqual(
      [...new Set(report.items.map(item => item.aircraft.icaoHex))],
    );
  });

  it("resolves manual selection and falls back when a flight disappears from LOCAL coverage", () => {
    const first = buildMySkyFocus([aircraft("AAAAAA"), aircraft("BBBBBB", { aircraftType: "A388" })], observer);
    expect(selectMySkyFocus(first, "AAAAAA")?.aircraft.icaoHex).toBe("AAAAAA");
    const reduced = buildMySkyFocus([aircraft("BBBBBB", { aircraftType: "A388" })], observer);
    expect(selectMySkyFocus(reduced, "AAAAAA")?.aircraft.icaoHex).toBe("BBBBBB");
    expect(selectMySkyFocus(buildMySkyFocus([], observer), "AAAAAA")).toBeNull();
  });

  it("keeps observer GPS client-side and reuses existing watchlist, map and detail flows", () => {
    const component = readFileSync(new URL("../components/mobile-spotter-mode.tsx", import.meta.url), "utf8");
    const helper = readFileSync(new URL("../lib/spotter-focus.ts", import.meta.url), "utf8");
    expect(component).toContain('activeCoverage: "local"');
    expect(component).toContain("buildMySkyFocus(");
    expect(component).toContain("selectMySkyFocus(");
    expect(component).toContain('data-testid="my-sky-focus-v2"');
    expect(component).toContain('setSelectedMySkyHex(');
    expect(component).toContain('pathname: "/watchlist"');
    expect(component).toContain("/?aircraft=");
    expect(component).toContain("/aircraft/");
    expect(component).not.toContain("/api/my-sky");
    expect(helper).not.toContain("fetch(");
    expect(helper).not.toContain("/api/");
  });
});
