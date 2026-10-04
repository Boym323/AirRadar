import { describe, expect, it } from "vitest";
import { AircraftContinuityGuard } from "@/lib/server/aircraft-continuity";

const config = { enabled: true, minBaseline: 20, dropRatio: 0.5 };

function hexes(count: number, offset = 0): Set<string> {
  return new Set(Array.from({ length: count }, (_, index) => (index + offset).toString(16).padStart(6, "0").toUpperCase()));
}

describe("aircraft continuity guard", () => {
  it("defers the first suspicious mass drop and confirms the second low snapshot", () => {
    const guard = new AircraftContinuityGuard();
    const baseline = hexes(80);
    const low = hexes(8);

    const first = guard.evaluateMassDrop("local", baseline, low, 1_000, config);
    expect(first).toMatchObject({ suspicious: true, deferPrune: true, confirmed: false, baselineCount: 80, currentCount: 8 });

    const second = guard.evaluateMassDrop("local", low, low, 2_000, config);
    expect(second).toMatchObject({ suspicious: true, deferPrune: false, confirmed: true, baselineCount: 80, currentCount: 8 });

    expect(guard.diagnostics({
      localObserved: 8,
      localRetained: 8,
      networkObserved: 0,
      networkRetained: 0,
      pendingAffinity: 0,
    }).local).toMatchObject({
      massDropCandidates: 1,
      massDropDeferrals: 1,
      massDropConfirmed: 1,
      massDropRecovered: 0,
      massDropPending: false,
    });
  });

  it("clears a pending mass drop when the next snapshot recovers", () => {
    const guard = new AircraftContinuityGuard();
    const baseline = hexes(60);
    const low = hexes(10);

    expect(guard.evaluateMassDrop("network", baseline, low, 1_000, config).deferPrune).toBe(true);
    const recovered = guard.evaluateMassDrop("network", low, hexes(58), 2_000, config);

    expect(recovered).toMatchObject({ suspicious: false, deferPrune: false, confirmed: false, recovered: true });
    expect(guard.diagnostics({
      localObserved: 0,
      localRetained: 0,
      networkObserved: 58,
      networkRetained: 60,
      pendingAffinity: 0,
    }).network).toMatchObject({
      massDropCandidates: 1,
      massDropDeferrals: 1,
      massDropConfirmed: 0,
      massDropRecovered: 1,
      massDropPending: false,
    });
  });

  it("does not guard small baselines or ordinary churn", () => {
    const guard = new AircraftContinuityGuard();
    expect(guard.evaluateMassDrop("local", hexes(10), hexes(1), 1_000, config).deferPrune).toBe(false);
    expect(guard.evaluateMassDrop("local", hexes(80), hexes(50), 2_000, config).deferPrune).toBe(false);
  });

  it("tracks omission recovery, stale expiration, quick reappearance, and source failover", () => {
    const guard = new AircraftContinuityGuard();
    const first = new Set(["ABC123", "DEF456"]);
    const missingOne = new Set(["ABC123"]);

    guard.observeMembership("local", first, missingOne, 1_000);
    guard.observeMembership("local", missingOne, first, 2_000);
    guard.recordRemoval("local", "DEF456", 3_000);
    guard.recordObservation("local", "DEF456", 10_000, 30_000);
    guard.recordFailover("local", "network", 11_000);
    guard.recordFailover("network", "local", 12_000);

    const diagnostics = guard.diagnostics({
      localObserved: 2,
      localRetained: 2,
      networkObserved: 0,
      networkRetained: 0,
      pendingAffinity: 1,
    });
    expect(diagnostics.local).toMatchObject({
      omissionEvents: 1,
      recoveredOmissions: 1,
      staleExpirations: 1,
      reappearedWithinWindow: 1,
      missingTracked: 0,
    });
    expect(diagnostics.sourceFailovers).toEqual({
      localToNetwork: 1,
      networkToLocal: 1,
      pendingAffinity: 1,
    });
    expect(diagnostics.lastEventAt).toBe(new Date(12_000).toISOString());
  });
});
