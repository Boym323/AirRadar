import { describe, expect, it } from "vitest";
import type { FlightPlan } from "@/lib/aircraft/types";
import { assessFlightStatusEvidence } from "@/lib/aircraft/flight-status-evidence-v6-e";
const plan = (retrievedAt?: string): FlightPlan => ({
  callsign: "CSA123", scheduledDeparture: null, actualDeparture: null, scheduledArrival: null,
  estimatedArrival: null, filedRoute: null, waypoints: [], retrievedAt, flightAware: { status: "En Route" },
});
describe("V6-E paid flight status evidence boundary", () => {
  const now = Date.parse("2026-10-10T16:00:00Z");
  it("does not fabricate missing provider information", () => {
    expect(assessFlightStatusEvidence(null, now).source).toBe("none");
    expect(assessFlightStatusEvidence(plan(), now).state).toBe("unknown");
  });
  it("marks an explicit recent FlightAware snapshot current", () => {
    const result = assessFlightStatusEvidence(plan("2026-10-10T15:30:00Z"), now);
    expect(result).toMatchObject({ source: "flightaware", state: "current", ageMinutes: 30 });
  });
  it("marks older snapshot stale, not live", () => {
    expect(assessFlightStatusEvidence(plan("2026-10-10T14:00:00Z"), now).state).toBe("stale");
    expect(assessFlightStatusEvidence(plan("2026-10-11T14:00:00Z"), now).state).toBe("unknown");
  });
});
