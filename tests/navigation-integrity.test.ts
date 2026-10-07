import { describe, expect, it } from "vitest";
import { cellKey, altitudeBand, connectedCellGroups } from "@/lib/navigation-integrity/grid";
import { buildBaseline } from "@/lib/navigation-integrity/baseline";
import { classifyNavigationIntegrity } from "@/lib/navigation-integrity/classification";
import { detectNavigationIntegrityAnomalies } from "@/lib/navigation-integrity/detector";
import type { NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { NavigationIntegrityService } from "@/lib/server/navigation-integrity";

function observation(hex: string, lat: number, lon: number, nic = 8, nacP = 8): NavigationIntegrityObservation {
  const at = "2026-09-28T10:00:00.000Z";
  return {
    aircraftHex: hex, flightId: null, observedAt: at, receivedAt: at, lat, lon, altitudeFt: 30_000, altitudeBand: altitudeBand(30_000),
    nic, nacP, nacV: 3, sil: 3, sda: 3, gva: 3, adsbVersion: 2, positionSource: "ADS-B", source: "LOCAL", provider: "readsb", quality: "HIGH", confidence: "HIGH",
    provenance: { origin: "local", positionObservedAt: at, fields: {} },
  };
}

describe("navigation integrity", () => {
  it("keeps original fields distinct and classifies one degraded aircraft conservatively", () => {
    const item = observation("ABC001", 49.2, 16.6, 4, 8);
    expect(item.nic).not.toBe(item.nacP);
    expect(classifyNavigationIntegrity(item).state).toBe("REDUCED");
    expect(detectNavigationIntegrityAnomalies([item])).toHaveLength(0);
  });

  it("requires independent aircraft contributors for a regional candidate", () => {
    const items = ["ABC001", "ABC002", "ABC003"].map((hex, index) => observation(hex, 49.2 + index * 0.01, 16.6, 3, 4));
    const anomalies = detectNavigationIntegrityAnomalies(items);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.affectedAircraftCount).toBe(3);
    expect(anomalies[0]?.confidence).toBe("LOW");
  });

  it("groups adjacent cells without merging altitude bands", () => {
    const left = cellKey(49.2, 16.6, 3);
    const right = cellKey(49.2, 16.81, 3);
    const high = cellKey(49.2, 16.81, 4);
    expect(connectedCellGroups([left, right, high])).toEqual([[left, right], [high]]);
  });

  it("supports a coherent adjacent-cell candidate but not dispersed aircraft", () => {
    const adjacent = Array.from({ length: 8 }, (_, index) => observation(`ADJ${index}`, 49.2, 16.6 + (index % 2) * 0.21, 3, 4));
    expect(detectNavigationIntegrityAnomalies(adjacent)[0]?.affectedAircraftCount).toBe(8);
    const dispersed = Array.from({ length: 8 }, (_, index) => observation(`DIS${index}`, 49.2 + index * 0.6, 16.6, 3, 4));
    expect(detectNavigationIntegrityAnomalies(dispersed)).toHaveLength(0);
  });

  it("marks same-window baselines immature and exposes unchanged medians", () => {
    const items = Array.from({ length: 3 }, (_, index) => observation(`BASE${index}`, 49.2, 16.6, 3, 4));
    const baseline = [...buildBaseline(items).values()][0]!;
    expect(baseline.aircraftCount).toBe(3);
    expect(baseline.maturity).toBe("IMMATURE");
    const candidate = detectNavigationIntegrityAnomalies(items)[0]!;
    expect(candidate.evidence.structured.baseline.maturity).toBe("IMMATURE");
    expect(candidate.evidence.structured.delta.nic).toBe(0);
    expect(candidate.evidence.structured.rules.find((rule) => rule.id === "NACP_BASELINE_DROP")?.passed).toBe(false);
    expect(candidate.evidence.structured.auditCategories).toContain("BASELINE_IMMATURE");
  });

  it("requires independent aircraft and time coverage for a strong baseline", () => {
    const items = Array.from({ length: 24 }, (_, index) => {
      const item = observation(`MATURE${index % 8}`, 49.2, 16.6, 8, 8);
      const at = new Date(Date.parse(item.observedAt) + Math.floor(index / 4) * 15 * 60_000).toISOString();
      return { ...item, observedAt: at, receivedAt: at };
    });
    const baseline = [...buildBaseline(items).values()][0]!;
    expect(baseline.aircraftCount).toBe(8);
    expect(baseline.timeBucketCount).toBe(6);
    expect(baseline.maturity).toBe("STRONG");
  });

  it("reuses a current-window computation and invalidates it after a collection", () => {
    const receiver = { lat: 49.2, lon: 16.6, name: "TEST" };
    const firstAt = new Date("2026-10-07T12:00:00.000Z");
    const makeAircraft = (hex: string, at: Date, lon: number) => normalizeAircraft({
      hex,
      type: "adsb_icao",
      lat: 49.2,
      lon,
      alt_baro: 30_000,
      seen: 0,
      seen_pos: 0,
      nic: 8,
      nac_p: 8,
      nac_v: 3,
      sil: 3,
      sda: 3,
      gva: 3,
      version: 2,
    }, receiver, at);

    const firstAircraft = makeAircraft("ABC001", firstAt, 16.6);
    if (!firstAircraft) throw new Error("test aircraft could not be normalized");
    const service = new NavigationIntegrityService();
    service.observe([firstAircraft], firstAt);

    const first = service.getCurrent("15m", new Date(firstAt.getTime() + 1_000));
    const cached = service.getCurrent("15m", new Date(firstAt.getTime() + 1_500));
    expect(cached.cells).toBe(first.cells);
    expect(cached.summary.aircraft).toBe(1);

    const secondAt = new Date(firstAt.getTime() + 16_000);
    const refreshedFirst = makeAircraft("ABC001", secondAt, 16.61);
    const secondAircraft = makeAircraft("ABC002", secondAt, 16.62);
    if (!refreshedFirst || !secondAircraft) throw new Error("test aircraft could not be normalized");
    service.observe([refreshedFirst, secondAircraft], secondAt);

    const afterCollection = service.getCurrent("15m", new Date(secondAt.getTime() + 1_000));
    expect(afterCollection.cells).not.toBe(first.cells);
    expect(afterCollection.summary.aircraft).toBe(2);
  });
});
