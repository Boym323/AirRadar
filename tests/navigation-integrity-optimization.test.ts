import { describe, expect, it } from "vitest";
import { buildBaseline } from "@/lib/navigation-integrity/baseline";
import { detectNavigationIntegrityAnomalies, summariseCells } from "@/lib/navigation-integrity/detector";
import {
  detectNavigationIntegrityAnomaliesReference,
  summariseCellsReference,
} from "./fixtures/navigation-integrity-detector-reference";
import type { NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

const started = Date.parse("2026-10-15T11:00:00.000Z");
const now = new Date(started + 60 * 60_000);

function observation(
  index: number,
  overrides: Partial<NavigationIntegrityObservation> = {},
): NavigationIntegrityObservation {
  const at = new Date(started + Math.floor(index / 5) * 15_000).toISOString();
  return {
    aircraftHex: `ABC${(index % 70).toString(16).padStart(3, "0")}`,
    flightId: null, observedAt: at, receivedAt: at,
    lat: 49.1 + (index % 7) * 0.21,
    lon: 14.1 + (Math.floor(index / 7) % 6) * 0.21,
    altitudeFt: 30_000, altitudeBand: index % 4,
    nic: index % 5 === 0 ? 3 : 8,
    nacP: index % 7 === 0 ? 4 : 8,
    nacV: index % 11 === 0 ? 1 : 3,
    sil: 3, sda: 3, gva: 3, adsbVersion: 2,
    positionSource: "ADS-B", source: index % 3 === 0 ? "NETWORK" : "LOCAL",
    provider: "readsb", quality: "HIGH", confidence: "HIGH",
    provenance: { origin: "local", positionObservedAt: at, fields: {} },
    ...overrides,
  };
}

function verifyParity(items: NavigationIntegrityObservation[]): void {
  const baselines = buildBaseline(items);
  expect(summariseCells(items, baselines)).toEqual(summariseCellsReference(items, baselines));
  expect(detectNavigationIntegrityAnomalies(items, now, baselines))
    .toEqual(detectNavigationIntegrityAnomaliesReference(items, now, baselines));
}

describe("Navigation Integrity optimized detector (pre-optimization oracle)", () => {
  it("preserves empty and normal-only contexts", () => {
    verifyParity([]);
    verifyParity(Array.from({ length: 150 }, (_, i) => observation(i, {
      nic: 9, nacP: 9, nacV: 5, sil: 3, sda: 3, gva: 3,
    })));
  });

  it("preserves full anomaly evidence for many distinct and overlapping cells", () => {
    const cases = [1, 5, 17, 55, 140, 350, 900];
    for (const size of cases) {
      const items = Array.from({ length: size }, (_, index) => observation(index));
      verifyParity(items);
    }
  });

  it("keeps aircraft dominance, local/network overlap, baseline maturity and nearby normals", () => {
    const cell = (index: number, hex: string, nic: number, minutes: number) => {
      const at = new Date(started + minutes * 60_000).toISOString();
      return observation(index, {
        aircraftHex: hex,
        lat: 49.25 + (index % 2) * 0.21, lon: 16.65,
        altitudeBand: 3, nic, nacP: nic < 6 ? 4 : 8,
        observedAt: at, receivedAt: at,
        source: index % 2 ? "NETWORK" : "LOCAL",
      });
    };
    const items = Array.from({ length: 100 }, (_, index) => cell(index, `GOOD${index % 10}`, 8, index * 15))
      .concat(Array.from({ length: 16 }, (_, index) => cell(index, index < 10 ? "DOMINANT" : `BAD${index}`, 3, index * 3)));
    verifyParity(items);
    const anomaly = detectNavigationIntegrityAnomalies(items, now)[0];
    expect(anomaly).toBeDefined();
    expect(anomaly!.evidence.structured.auditCategories).toContain("AIRCRAFT_SPECIFIC");
    expect(anomaly!.evidence.structured.nearbyNormalAircraftCount).toBeGreaterThan(0);
  });

  it("preserves sorted group identities and exact evidence over multiple random-shaped workloads", () => {
    // Deterministic pseudo-random input: same fixtures in CI on every run.
    let seed = 419_009;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let fixture = 0; fixture < 12; fixture += 1) {
      const items = Array.from({ length: 125 + fixture * 43 }, (_, i) => {
        const x = Math.floor(next() * 12);
        const y = Math.floor(next() * 10);
        const field = Math.floor(next() * 8);
        const band = Math.floor(next() * 5);
        const hex = `R${Math.floor(next() * 65).toString().padStart(4, "0")}`;
        return observation(i, {
          lat: 48 + x * 0.201, lon: 13 + y * 0.201, altitudeBand: band,
          aircraftHex: hex, nic: field <= 2 ? 3 : 8,
          nacP: field === 4 ? 4 : 8, nacV: field === 5 ? 1 : 3,
          source: field % 2 ? "NETWORK" : "LOCAL",
        });
      });
      verifyParity(items);
    }
  });

  it("handles dense hot cells without quadratic per-aircraft recounts", () => {
    const items = Array.from({ length: 1_200 }, (_, index) => observation(index, {
      aircraftHex: `DENSE${index % 17}`, lat: 49.25, lon: 16.65,
      altitudeBand: 3, nic: index % 3 === 0 ? 8 : 3, nacP: 4,
    }));
    verifyParity(items);
    expect(detectNavigationIntegrityAnomalies(items, now)).toHaveLength(1);
  });
});
