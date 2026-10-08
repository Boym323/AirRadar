import { describe, expect, it } from "vitest";
import { buildAirportApproachEvidenceD3 } from "@/lib/airport-intelligence/approach-evidence-d3";
import type { AirportCorrelatedTrafficSnapshot } from "@/lib/airport-intelligence/v3";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import type { AirportMovement } from "@/lib/server/airport-movements";

const now = new Date("2026-10-08T20:00:00.000Z");
const move = (kind: AirportMovement["movement"], observedAt: string, flightId = 17): AirportMovement => ({
  flightId, icaoHex: "ABC123", callsign: "TEST17", registration: null,
  airport: "LKPR", movement: kind, confidence: "medium", runway: null,
  observedAt, evidence: [],
});
function snapshot(current: AirportMovement | null, stage: string = "APPROACH"): AirportCorrelatedTrafficSnapshot {
  return { inbound: [{
    aircraft: {icaoHex: "ABC123", callsign: "TEST17", onGround: false},
    distanceKm: 5, journey: {stage, routeRelation: "CONFIRMED"},
    movement: current, movementAgeSeconds: 60,
  }] as AirportCorrelatedTrafficSnapshot["inbound"], outbound: [] };
}
function operations(events: AirportMovement[], complete = true): AirportOperationsResponse {
  return {recentMovements: events, complete, truncated: false} as AirportOperationsResponse;
}
describe("D3 approach transition evidence", () => {
  it("requires ordered real events on the same flight for reapproach", () => {
    const prior = move("GO_AROUND", "2026-10-08T19:47:00.000Z");
    const latest = move("APPROACH", "2026-10-08T19:57:00.000Z");
    const got = buildAirportApproachEvidenceD3({
      traffic: snapshot(latest), operations: operations([latest, prior]), now,
    });
    expect(got.items[0]).toMatchObject({state: "REAPPROACH_EVIDENCE", flightId: 17});
    expect(got.counts.reapproach).toBe(1);
    const mismatched = buildAirportApproachEvidenceD3({
      traffic: snapshot(latest), operations: operations([latest, {...prior, flightId: 18}]), now,
    });
    expect(mismatched.items[0]?.state).toBe("APPROACH_EVIDENCE");
  });
  it("cannot mistake a live stage for independently observed holding or go-around", () => {
    const got = buildAirportApproachEvidenceD3({
      traffic: snapshot(null, "GO_AROUND"), operations: null, now,
    });
    expect(got.items[0]?.state).toBe("LIVE_ONLY");
    const actual = move("GO_AROUND", "2026-10-08T19:58:00.000Z");
    expect(buildAirportApproachEvidenceD3({
      traffic: snapshot(actual, "GO_AROUND"), operations: operations([actual]), now,
    }).items[0]?.state).toBe("GO_AROUND_EVIDENCE");
  });
  it("fails closed for stale, future and identity-conflicting movements", () => {
    const future = move("APPROACH", "2026-10-08T20:05:00.000Z");
    const outdated = move("HOLDING", "2026-10-08T19:00:00.000Z");
    const conflict = {...move("APPROACH", "2026-10-08T19:59:00.000Z"), icaoHex: "FFF000"};
    for (const m of [future, outdated, conflict]) {
      expect(buildAirportApproachEvidenceD3({
        traffic: snapshot(m, m.movement), operations: operations([m]), now,
      }).items[0]?.state).toBe("LIVE_ONLY");
    }
  });
  it("never infers a landing, caps per-aircraft work and flags incomplete history", () => {
    const actual = move("APPROACH", "2026-10-08T19:58:00.000Z");
    const got = buildAirportApproachEvidenceD3({
      traffic: snapshot(actual, "FINAL"), operations: operations([actual], false), now,
    });
    expect(got.items[0]?.state).toBe("FINAL_APPROACH_EVIDENCE");
    expect(got.complete).toBe(false);
  });
});
